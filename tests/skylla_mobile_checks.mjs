import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMobileHandler,signEnvelope,readEnvelope,verifyGitHubJWT} from '../supabase/functions/skylla-verify/mobile.mjs';
import {canonical} from '../supabase/functions/skylla-verify/batch.mjs';
import {sha256,PROJECT,BUCKET} from '../supabase/functions/skylla-verify/core.mjs';
const policy=JSON.parse(readFileSync(new URL('../supabase/functions/skylla-mobile/policy.json',import.meta.url)));
const sample=JSON.parse(readFileSync(new URL('../docs/skylla/fast-lane-2/SKYLLA_BATCH_001.json',import.meta.url)));
const clock=Date.parse('2026-10-20T17:00:00Z'),secret='synthetic-server-only-secret';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'synthetic',alg:'RS256',use:'sig'};
const b64=v=>Buffer.from(v).toString('base64url');
const hash=o=>sha256(new TextEncoder().encode(canonical(o)));
async function jwt(phase='prepare',claims={},header={}){
  const ref=claims.ref||'refs/heads/main';
  const c={iss:'https://token.actions.githubusercontent.com',aud:'skylla-mobile:'+phase,iat:clock/1000,exp:clock/1000+300,
    repository:policy.repository,repository_id:policy.repository_id,repository_owner_id:policy.owner_id,actor_id:policy.owner_id,
    sha:'a'.repeat(40),workflow_sha:'a'.repeat(40),workflow_ref:`${policy.repository}/${policy.workflow}@${ref}`,
    ref,sub:`repo:${policy.repository}:ref:${ref}`,event_name:'workflow_dispatch',run_id:'123',run_attempt:'1',...claims};
  const raw=b64(JSON.stringify({alg:'RS256',kid:'synthetic',...header}))+'.'+b64(JSON.stringify(c));
  return raw+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(raw)));
}
async function setup(options={}){
  const plan=structuredClone(sample);plan.entries=plan.entries.slice(0,1);delete plan.manifest_sha256;plan.manifest_sha256=await hash(plan);
  const entry=plan.entries[0],calls=[],p={...policy,...options.policy};
  const folders={[entry.object_path.split('/')[0]]:entry.drive.parent_id};
  const fetcher=async(url,opts={})=>{
    calls.push({url,method:opts.method||'GET'});
    if(url.endsWith('/.well-known/jwks'))return Response.json({keys:[jwk]});
    if(url.includes('raw.githubusercontent.com'))return Response.json(url.endsWith('config/skylla-mobile-batches.json')?
      {schema:'skylla-mobile-catalog/v1',batches:{[plan.batch_id]:{manifest_path:'docs/skylla/fast-lane-2/SKYLLA_BATCH_001.json',manifest_sha256:plan.manifest_sha256}}}:
      options.corruptPlan?{...plan,approval_required:false}:plan);
    if(url.includes('/environments/'))return Response.json({can_admins_bypass:false,protection_rules:options.unprotected?[]:
      [{type:'required_reviewers',prevent_self_review:false,reviewers:[{reviewer:{id:Number(policy.owner_id)}}]}]});
    if(url.endsWith('/approvals'))return Response.json(options.unapproved?[]:[{state:'approved',user:{id:Number(policy.owner_id)},environments:[{name:policy.environment}]}]);
    if(url.includes('www.googleapis.com')){
      if(options.driveDenied)return Response.json({error:'private provider details'},{status:403});
      return Response.json({id:entry.drive.file_id,parents:[entry.drive.parent_id],headRevisionId:options.changedDrive?'new-revision':entry.drive.revision_id,
        size:String(entry.size_bytes),mimeType:'image/png',trashed:false,sha256Checksum:options.driveBadHash?'0'.repeat(64):entry.sha256});
    }
    assert.ok(url.startsWith(`https://${PROJECT}.supabase.co/`));
    assert.equal(opts.headers.apikey,secret);
    if(opts.method==='DELETE')return Response.json([{name:entry.object_path}]);
    if(url.includes('/object/info/'))return Response.json({id:entry.source_identity.id,version:options.changedSource?'new-version':entry.source_identity.version,
      etag:entry.source_identity.etag,size:entry.size_bytes,last_modified:entry.source_identity.last_modified});
    if(url.includes('/object/authenticated/'))return Response.json({statusCode:'404'},{status:400});
    if(url.includes('/hermes_jobs?select=id&kind='))return Response.json(options.pending?[{id:'pending'}]:[]);
    if(url.includes('/hermes_jobs?'))return Response.json([{...entry.dependency,id:entry.dependency.job_id,status:'active',source_sha256:entry.sha256}]);
    if(url.includes('?select=id&or='))return Response.json(options.registered?[{id:'reference'}]:[]);
    return Response.json([{[entry.dependency.registry_field]:entry.dependency.app_path}]);
  };
  const handler=createMobileHandler({policy:p,folders,env:()=>secret,fetcher,now:()=>clock});
  const req=(body,token='',headers={})=>new Request('https://synthetic.invalid/mobile',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token,...headers},body:JSON.stringify(body)});
  const prepare=async(mode='dry-run',claims={})=>{
    const r=await handler(req({operation:'prepare',batch_id:plan.batch_id,manifest_sha256:plan.manifest_sha256,mode},await jwt('prepare',claims)));
    return {status:r.status,...await r.json()};
  };
  const authorize=async(ticket,claims={})=>{
    const r=await handler(req({operation:'authorize',ticket},await jwt('authorize',claims),{'x-skylla-github-token':'synthetic-job-token'}));
    return {status:r.status,...await r.json()};
  };
  const seed=await signEnvelope({},secret);assert.ok(seed);
  const source=entry.source_identity;
  const payload={schema:'skylla-signed-byte-proof/v2',project_id:PROJECT,bucket:BUCKET,object_path:entry.object_path,
    sha256:entry.sha256,size_bytes:entry.size_bytes,source_identity:{...source,etag:String(source.etag).replace(/^"|"$/g,''),last_modified:new Date(source.last_modified).toISOString()},
    drive_file_id:entry.drive.file_id,drive_revision_id:entry.drive.revision_id,verified_at:new Date(clock-1000).toISOString()};
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('SKYLLA-BYTE-RECEIPT/v2\n'+canonical(payload)))).toString('hex');
  const run=(credential,action='verify',extra={},headers={})=>handler(req({operation:'run',id:entry.id,manifest_sha256:plan.manifest_sha256,action,
    receipt:{payload,signature},...extra},credential,{'x-skylla-drive-token':'synthetic-drive-read-token',...headers}));
  return {plan,entry,calls,handler,fetcher,req,prepare,authorize,run};
}
test('committed production policy is disabled and single fixed repository',()=>{
  assert.equal(policy.execution_enabled,false);assert.equal(policy.repository_id,'1403008145');assert.equal(policy.credential_minutes,20);
});
test('real RSA JWT, ticket and scoped access verify unchanged byte receipt with live Drive checks',async()=>{
  const s=await setup(),ticket=await s.prepare();assert.equal(ticket.object_count,1);assert.equal(ticket.expected_bytes,s.entry.size_bytes);
  const a=await s.authorize(ticket.ticket);assert.equal(a.status,200);
  const r=await(await s.run(a.credential)).json();assert.equal(r.status,'verified');assert.equal(r.source_hash_receipt_reused,true);
  assert.ok(!s.calls.some(c=>c.method!=='GET'));assert.ok(!JSON.stringify(r).includes(secret));
});
for(const [name,claims] of Object.entries({wrongIssuer:{iss:'https://attacker.invalid'},wrongAudience:{aud:'skylla-mobile:authorize'},
  wrongRepo:{repository:'attacker/repo'},wrongRepoID:{repository_id:'99'},wrongOwner:{repository_owner_id:'99'},wrongActor:{actor_id:'99'},
  expired:{exp:clock/1000},future:{iat:clock/1000+120},longTTL:{exp:clock/1000+3600},
  wrongWorkflow:{workflow_ref:'other.yml'},wrongWorkflowCommit:{workflow_sha:'b'.repeat(40)},missingWorkflowCommit:{workflow_sha:undefined},
  untrustedBranch:{ref:'refs/heads/attacker'},pullRequest:{event_name:'pull_request'}}))
  test('reject untrusted OIDC: '+name,async()=>{const s=await setup();assert.equal((await s.prepare('dry-run',claims)).status,403);assert.ok(!s.calls.some(c=>c.url.includes('supabase.co')));});
for(const header of [{alg:'none'},{alg:'HS256'},{kid:'attacker'}])
  test('JWT rejects algorithm or signing key '+JSON.stringify(header),async()=>{
    const s=await setup();await assert.rejects(verifyGitHubJWT(await jwt('prepare',{},header),'prepare',policy,{fetcher:s.fetcher,now:()=>clock}));});
test('ticket cannot be minted from the protected job after owner review',async()=>{
  const s=await setup();const p=await s.prepare('dry-run',{environment:policy.environment,sub:`repo:${policy.repository}:environment:${policy.environment}`});assert.equal(p.status,403);
});
for(const claims of [{run_id:'124'},{run_attempt:'2'},{sha:'b'.repeat(40),workflow_sha:'b'.repeat(40)}])
  test('ticket rejects changed run/attempt/commit '+JSON.stringify(claims),async()=>{
    const s=await setup(),t=await s.prepare();assert.equal((await s.authorize(t.ticket,claims)).status,403);
  });
test('tampered and expired signed scope is rejected',async()=>{
  const s=await setup(),t=await s.prepare();assert.equal((await s.authorize(t.ticket+'x')).status,403);
  const data=await readEnvelope(t.ticket,secret,()=>clock);data.exp=clock/1000;
  assert.equal((await s.authorize(await signEnvelope(data,secret))).status,403);
});
test('dry-run cannot execute even with a valid access credential',async()=>{
  const s=await setup(),t=await s.prepare(),a=await s.authorize(t.ticket);assert.equal((await s.run(a.credential,'execute')).status,403);
  assert.ok(!s.calls.some(c=>c.url.includes('supabase.co')));
});
test('production execution disabled before any source lookup or approval request',async()=>{
  const s=await setup();assert.equal((await s.prepare('execute')).error,'PRODUCTION_EXECUTION_DISABLED');
  assert.ok(!s.calls.some(c=>c.url.includes('supabase.co')));
});
for(const [name,options] of Object.entries({driveDenied:{driveDenied:true},changedRevision:{changedDrive:true},wrongDriveSHA:{driveBadHash:true},
  activeJob:{pending:true},registeredReference:{registered:true},replacedSource:{changedSource:true}}))
  test('unsafe current object skipped: '+name,async()=>{
    const s=await setup(options),t=await s.prepare(),a=await s.authorize(t.ticket);const r=await(await s.run(a.credential)).json();
    assert.equal(r.status,'skipped');assert.equal(r.delete_api_invoked,false);assert.ok(!s.calls.some(c=>c.method!=='GET'));
  });
test('missing Drive read token cannot verify or delete',async()=>{
  const s=await setup(),t=await s.prepare(),a=await s.authorize(t.ticket);const r=await(await s.run(a.credential,'verify',{}, {'x-skylla-drive-token':''})).json();
  assert.equal(r.reason,'DRIVE_READ_AUTH_REQUIRED');assert.ok(!s.calls.some(c=>c.url.includes('supabase.co')));
});
test('request cannot inject an extra path, different manifest or outside object',async()=>{
  const s=await setup(),t=await s.prepare(),a=await s.authorize(t.ticket);
  for(const extra of [{path:'elsewhere'},{id:'0'.repeat(64)},{manifest_sha256:'0'.repeat(64)}])assert.equal((await s.run(a.credential,'verify',extra)).status,403);
});
test('corrupt trusted manifest fails closed',async()=>{const s=await setup({corruptPlan:true});assert.equal((await s.prepare()).status,403);});
const protectedClaims={environment:policy.environment,sub:`repo:${policy.repository}:environment:${policy.environment}`};
for(const [name,options] of Object.entries({noReview:{unapproved:true},noGate:{unprotected:true}}))
  test('synthetic production rejects '+name,async()=>{
    const s=await setup({...options,policy:{execution_enabled:true}}),t=await s.prepare('execute');
    assert.equal((await s.authorize(t.ticket,protectedClaims)).status,403);
  });
test('synthetic production scope requires owner environment review and cannot mint new ticket inside gate',async()=>{
  const s=await setup({policy:{execution_enabled:true}}),t=await s.prepare('execute');
  assert.equal((await s.authorize(t.ticket)).status,403);
  const a=await s.authorize(t.ticket,protectedClaims);assert.equal(a.status,200);
  const r=await(await s.run(a.credential,'execute')).json();assert.equal(r.status,'deleted');
  assert.equal(s.calls.filter(c=>c.method==='DELETE').length,1);
});
test('scope is not a Supabase API key and is never returned by run results',async()=>{
  const s=await setup(),t=await s.prepare(),a=await s.authorize(t.ticket);
  const p=await readEnvelope(a.credential,secret,()=>clock);assert.equal(p.type,'batch-access');assert.equal(p.exp-p.iat,1200);
  const out=JSON.stringify(await(await s.run(a.credential)).json());assert.ok(!out.includes(a.credential));assert.ok(!out.includes(secret));
});

test('GitHub immutable-ID subject format matches this exact repository only',async()=>{
  const s=await setup();
  const prefix='repo:lindkvistfoto-dot@337302317/alea-crusaders@1403008145';
  assert.equal((await s.prepare('dry-run',{sub:prefix+':ref:refs/heads/main'})).status,200);
  assert.equal((await s.prepare('dry-run',{sub:prefix.replace('1403008145','99')+':ref:refs/heads/main'})).status,403);
});
