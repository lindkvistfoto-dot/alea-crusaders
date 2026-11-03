import {canonical,createBatchHandler} from './batch.mjs';
import {sha256,boundedBody,PROJECT,BUCKET} from './core.mjs';

const issuer='https://token.actions.githubusercontent.com';
const bytes=s=>new TextEncoder().encode(s);
const digest=async o=>sha256(bytes(canonical(o)));
const fail=code=>{throw Error(code);};
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const parse=s=>JSON.parse(new TextDecoder().decode(un64(s)));
const json=(b,status=200)=>Response.json(b,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const safeError=e=>/^[A-Z][A-Z0-9_]{2,80}$/.test(e.message)?e.message:'MOBILE_SAFETY_CHECK_FAILED';

export async function signEnvelope(payload,secret){
  const data=b64(bytes(canonical(payload)));
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return data+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes('SKYLLA-MOBILE/v1\n'+data))));
}
export async function readEnvelope(token,secret,now){
  if(typeof token!=='string'||token.length>8192||!/^[-\w]+\.[-\w]+$/.test(token))fail('INVALID_SCOPED_CREDENTIAL');
  const [data,signature]=token.split('.');
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,un64(signature),bytes('SKYLLA-MOBILE/v1\n'+data)))fail('INVALID_SCOPED_CREDENTIAL');
  const p=parse(data);
  if(!Number.isInteger(p.iat)||!Number.isInteger(p.exp)||p.iat>now()/1000+30||p.exp<=now()/1000||p.exp-p.iat>3600)fail('SCOPED_CREDENTIAL_EXPIRED');
  return p;
}

/** Verify only fixed GitHub issuer/JWKS, RS256 and this repository's workflow. */
export async function verifyGitHubJWT(token,phase,policy,{fetcher=fetch,now=Date.now}={}){
  if(typeof token!=='string'||token.length>16384)fail('GITHUB_OIDC_REQUIRED');
  const parts=token.split('.');if(parts.length!==3)fail('GITHUB_OIDC_REQUIRED');
  const h=parse(parts[0]),c=parse(parts[1]);
  if(h.alg!=='RS256'||typeof h.kid!=='string')fail('INVALID_GITHUB_SIGNATURE');
  const r=await fetcher(issuer+'/.well-known/jwks',{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)fail('GITHUB_JWKS_UNAVAILABLE');
  const jwks=JSON.parse(new TextDecoder().decode(await boundedBody(r,131072)));
  const jwk=jwks.keys?.find(k=>k.kid===h.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');
  if(!jwk)fail('INVALID_GITHUB_SIGNATURE');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,un64(parts[2]),bytes(parts[0]+'.'+parts[1])))fail('INVALID_GITHUB_SIGNATURE');
  if(c.iss!==issuer||c.aud!=='skylla-mobile:'+phase||!Number.isInteger(c.exp)||!Number.isInteger(c.iat)||
    c.exp<=now()/1000||c.iat>now()/1000+30||c.exp-c.iat>600||c.iat<now()/1000-600||
    c.repository!==policy.repository||String(c.repository_id)!==policy.repository_id||
    String(c.repository_owner_id)!==policy.owner_id||String(c.actor_id)!==policy.owner_id||
    !/^[a-f0-9]{40}$/.test(c.sha||'')||c.workflow_sha!==c.sha||
    c.workflow_ref!==`${policy.repository}/${policy.workflow}@${c.ref}`||
    !/^\d+$/.test(String(c.run_id))||!/^\d+$/.test(String(c.run_attempt)))fail('UNTRUSTED_GITHUB_RUN');
  return c;
}

export function createMobileHandler({policy,folders,env,fetcher=fetch,now=Date.now}){
  const plans=new Map();
  const getJSON=async(url,options={})=>{
    const r=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),...options});
    if(!r.ok)fail('TRUSTED_METADATA_UNAVAILABLE');
    return JSON.parse(new TextDecoder().decode(await boundedBody(r,2097152)));
  };
  const loadPlan=async(commit,batchID,hash)=>{
    if(!/^[a-f0-9]{40}$/.test(commit||'')||!/^SKYLLA-BATCH-\d{3}$/.test(batchID||'')||!/^\w{64}$/.test(hash||''))fail('EXACT_BATCH_REQUIRED');
    const cacheKey=commit+':'+batchID+':'+hash;if(plans.has(cacheKey))return plans.get(cacheKey);
    const root=`https://raw.githubusercontent.com/${policy.repository}/${commit}/`;
    const catalog=await getJSON(root+policy.catalog_path),item=catalog.batches?.[batchID];
    if(catalog.schema!=='skylla-mobile-catalog/v1'||!item||item.manifest_sha256!==hash||
      !/^docs\/skylla\/[A-Za-z0-9_/-]+\.json$/.test(item.manifest_path)||item.manifest_path.includes('..'))fail('BATCH_NOT_IN_TRUSTED_CATALOG');
    const plan=await getJSON(root+item.manifest_path),p={...plan};delete p.manifest_sha256;
    if(plan.schema!=='skylla-fast-lane-batch/v2'||plan.batch_id!==batchID||plan.manifest_sha256!==hash||
      await digest(p)!==hash||plan.project_id!==PROJECT||plan.bucket!==BUCKET||plan.approval_required!==true||
      !Array.isArray(plan.entries)||plan.entries.length<1||plan.entries.length>100||
      new Set(plan.entries.map(e=>e.id)).size!==plan.entries.length)fail('INVALID_FIXED_MANIFEST');
    if(plans.size>=4)plans.delete(plans.keys().next().value);plans.set(cacheKey,plan);return plan;
  };
  const checkScope=(p,type)=>{
    if(p.type!==type||p.repository_id!==policy.repository_id||p.actor_id!==policy.owner_id||
      !['dry-run','execute'].includes(p.mode))fail('INVALID_SCOPED_CREDENTIAL');
    if(p.mode==='execute'&&policy.execution_enabled!==true)fail('PRODUCTION_EXECUTION_DISABLED');
  };
  const checkRun=(c,mode,protectedJob)=>{
    if(mode==='execute'){
      if(policy.execution_enabled!==true)fail('PRODUCTION_EXECUTION_DISABLED');
      if(c.ref!=='refs/heads/main'||c.event_name!=='workflow_dispatch')fail('PROTECTED_MAIN_DISPATCH_REQUIRED');
    }else if(mode!=='dry-run'||!policy.dry_run_refs.includes(c.ref)||!['push','workflow_dispatch'].includes(c.event_name))fail('TRUSTED_DRY_RUN_REQUIRED');
    const [owner,repository]=policy.repository.split('/');
    // GitHub's immutable-ID subject format is enabled on this repository.
    // Accept only the two exact issuer formats; all individual ID claims are also checked.
    const prefixes=[`repo:${policy.repository}`,`repo:${owner}@${policy.owner_id}/${repository}@${policy.repository_id}`];
    const suffix=protectedJob?`:environment:${policy.environment}`:`:ref:${c.ref}`;
    if(!prefixes.some(p=>c.sub===p+suffix)||(protectedJob?c.environment!==policy.environment:!!c.environment))fail('WRONG_JOB_ENVIRONMENT');
  };
  const ownerApproval=async(c,token)=>{
    if(!token||token.length>2048)fail('GITHUB_REVIEW_READ_TOKEN_REQUIRED');
    const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'};
    const base=`https://api.github.com/repos/${policy.repository}`;
    const environment=await getJSON(base+'/environments/'+policy.environment,{headers});
    const reviewer=environment.protection_rules?.find(r=>r.type==='required_reviewers');
    if(!reviewer?.reviewers?.some(r=>String(r.reviewer?.id)===policy.owner_id)||reviewer.prevent_self_review!==false||environment.can_admins_bypass!==false)
      fail('REQUIRED_OWNER_ENVIRONMENT_PROTECTION_MISSING');
    const approvals=await getJSON(base+'/actions/runs/'+c.run_id+'/approvals',{headers});
    if(!Array.isArray(approvals)||!approvals.some(a=>a.state==='approved'&&String(a.user?.id)===policy.owner_id&&
      a.environments?.some(e=>e.name===policy.environment)))fail('OWNER_ENVIRONMENT_APPROVAL_REQUIRED');
    // A re-run must be reviewed again. GitHub's deployment gate is also enforced before this job starts.
  };
  const driveCheck=async(entry,token)=>{
    if(!token||token.length>4096)fail('DRIVE_READ_AUTH_REQUIRED');
    const root='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(entry.drive.file_id);
    const d=await getJSON(root+'?fields=id,parents,headRevisionId,size,mimeType,trashed,sha256Checksum',
      {headers:{authorization:'Bearer '+token}});
    if(d.id!==entry.drive.file_id||d.trashed!==false||d.headRevisionId!==entry.drive.revision_id||
      !d.parents?.includes(entry.drive.parent_id)||Number(d.size)!==entry.size_bytes||d.mimeType!=='image/png'||
      entry.drive.parent_id!==folders[entry.object_path.split('/')[0]])fail('PERMANENT_DRIVE_IDENTITY_CHANGED');
    if(d.sha256Checksum){if(d.sha256Checksum!==entry.sha256)fail('DRIVE_SHA256_MISMATCH');}
    else{
      const r=await fetcher(root+'?alt=media',{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+token}});
      const raw=await boundedBody(r,entry.size_bytes);
      if(raw.length!==entry.size_bytes||await sha256(raw)!==entry.sha256)fail('DRIVE_SHA256_MISMATCH');
    }
  };
  return async req=>{
    if(req.method!=='POST')return json({error:'POST_REQUIRED'},405);
    if(req.headers.has('origin'))return json({error:'BROWSER_ORIGIN_DENIED'},403);
    try{
      if(!(req.headers.get('content-type')||'').startsWith('application/json'))fail('JSON_REQUIRED');
      const body=JSON.parse(new TextDecoder().decode(await boundedBody(new Response(req.body),24576)));
      const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
      const secret=env('SUPABASE_SERVICE_ROLE_KEY');if(!secret)fail('SERVER_CONFIGURATION_REQUIRED');
      if(body.operation==='prepare'){
        if(Object.keys(body).sort().join(',')!=='batch_id,manifest_sha256,mode,operation')fail('EXACT_BATCH_REQUIRED');
        const c=await verifyGitHubJWT(token,'prepare',policy,{fetcher,now});checkRun(c,body.mode,false);
        const plan=await loadPlan(c.sha,body.batch_id,body.manifest_sha256);
        const ticket={type:'approval-ticket',repository_id:policy.repository_id,actor_id:policy.owner_id,
          commit:c.sha,run_id:String(c.run_id),run_attempt:String(c.run_attempt),batch_id:plan.batch_id,
          manifest_sha256:plan.manifest_sha256,mode:body.mode,iat:Math.floor(now()/1000),exp:Math.floor(now()/1000)+policy.ticket_minutes*60};
        return json({ticket:await signEnvelope(ticket,secret),batch_id:plan.batch_id,manifest_sha256:plan.manifest_sha256,
          object_count:plan.entries.length,expected_bytes:plan.entries.reduce((n,e)=>n+e.size_bytes,0),commit:c.sha,
          execution_enabled:policy.execution_enabled,mode:body.mode,expires_at:new Date(ticket.exp*1000).toISOString()});
      }
      if(body.operation==='authorize'){
        if(Object.keys(body).sort().join(',')!=='operation,ticket')fail('SIGNED_PREFLIGHT_TICKET_REQUIRED');
        const c=await verifyGitHubJWT(token,'authorize',policy,{fetcher,now});
        const ticket=await readEnvelope(body.ticket,secret,now);checkScope(ticket,'approval-ticket');
        checkRun(c,ticket.mode,ticket.mode==='execute');
        if(ticket.commit!==c.sha||ticket.run_id!==String(c.run_id)||ticket.run_attempt!==String(c.run_attempt))fail('TICKET_RUN_MISMATCH');
        await loadPlan(ticket.commit,ticket.batch_id,ticket.manifest_sha256);
        if(ticket.mode==='execute')await ownerApproval(c,req.headers.get('x-skylla-github-token'));
        const scope={...ticket,type:'batch-access',iat:Math.floor(now()/1000),exp:Math.floor(now()/1000)+policy.credential_minutes*60};
        return json({credential:await signEnvelope(scope,secret),expires_at:new Date(scope.exp*1000).toISOString()});
      }
      if(body.operation!=='run'||Object.keys(body).sort().join(',')!=='action,id,manifest_sha256,operation,receipt')fail('FIXED_BATCH_REQUEST_REQUIRED');
      const scope=await readEnvelope(token,secret,now);checkScope(scope,'batch-access');
      const plan=await loadPlan(scope.commit,scope.batch_id,scope.manifest_sha256);
      if(body.manifest_sha256!==plan.manifest_sha256)fail('EXACT_BATCH_REQUIRED');
      const entry=plan.entries.find(e=>e.id===body.id);if(!entry)fail('OBJECT_OUTSIDE_BATCH');
      if(!['verify','execute','status'].includes(body.action))fail('FIXED_BATCH_REQUEST_REQUIRED');
      if(body.action==='execute'&&(scope.mode!=='execute'||policy.execution_enabled!==true))fail('PRODUCTION_EXECUTION_DISABLED');
      if(body.action!=='status'){
        try{await driveCheck(entry,req.headers.get('x-skylla-drive-token'));}
        catch(e){return json({id:entry.id,manifest_sha256:plan.manifest_sha256,bucket:BUCKET,object_path:entry.object_path,
          sha256:entry.sha256,size_bytes:entry.size_bytes,status:'skipped',reason:safeError(e),delete_api_invoked:false});}
      }
      const internal=b64(crypto.getRandomValues(new Uint8Array(32)));
      const capability={enabled:true,operation:scope.mode==='execute'?'execute':'verify_only',
        owner_approved_manifest_sha256:scope.mode==='execute'?plan.manifest_sha256:null,manifest_sha256:plan.manifest_sha256,
        token_sha256:await sha256(bytes(internal)),not_before:new Date(now()).toISOString(),
        expires_at:new Date(Math.min(scope.exp*1000,now()+120000)).toISOString(),drive_checked_at:new Date(now()).toISOString(),
        drive_revision_set_sha256:await digest(plan.entries.map(e=>({file_id:e.drive.file_id,revision_id:e.drive.revision_id})).sort((a,b)=>a.file_id<b.file_id?-1:a.file_id>b.file_id?1:0))};
      const guardedFetch=(url,options={})=>{
        if(scope.mode==='dry-run'&&(options.method||'GET')!=='GET')fail('DRY_RUN_WRITE_FORBIDDEN');
        return fetcher(url,options);
      };
      const handler=createBatchHandler({plan,capability,folders,env,fetcher:guardedFetch,now});
      const {operation,...request}=body;
      return await handler(new Request('https://internal.invalid/batch',{method:'POST',
        headers:{'content-type':'application/json','x-skylla-capability':internal},body:JSON.stringify(request)}));
    }catch(e){return json({error:safeError(e)},403);}
  };
}
