import {sha256,boundedBody,validEntry,verifyStorageEntry,PROJECT,BUCKET} from './core.mjs';

const BASE=`https://${PROJECT}.supabase.co`;
const encoded=value=>encodeURIComponent(value);
const fresh=(value,now)=>Number.isFinite(Date.parse(value))&&now-Date.parse(value)>=0&&now-Date.parse(value)<=600000;

/** Owner-approved exact pilot only. No caller-controlled paths or credentials.
 * Default disabled; deploy a <=10 minute capability only after fresh readbacks.
 * One Storage API DELETE per original, never SQL, wildcard or bucket deletion.
 * A transport failure is an unknown outcome: reconcile, never blindly retry.
 */
export function createDeletePilotHandler({plan,capability,env,fetcher=fetch,now=Date.now}) {
  const attempted=new Set();
  const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  return async req=>{
    if(req.method!=='POST')return json({error:'POST_REQUIRED'},405);
    if(req.headers.has('origin'))return json({error:'BROWSER_ORIGIN_DENIED'},403);
    const start=Date.parse(capability.not_before),until=Date.parse(capability.expires_at);
    if(capability.enabled!==true||!Number.isFinite(start)||!Number.isFinite(until)||until<=start||
       until-start>600000||now()<start||now()>=until||capability.plan_sha256!==plan.plan_sha256)
      return json({error:'DELETE_CAPABILITY_DISABLED_OR_EXPIRED'},503);
    const token=req.headers.get('x-skylla-capability')||'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)||await sha256(new TextEncoder().encode(token))!==capability.token_sha256)
      return json({error:'CAPABILITY_REQUIRED'},401);
    let entry,deleteInvoked=false;
    try {
      if(!(req.headers.get('content-type')||'').startsWith('application/json'))throw Error('JSON_REQUIRED');
      const body=JSON.parse(new TextDecoder().decode(await boundedBody(new Response(req.body),512)));
      if(Object.keys(body).sort().join(',')!=='action,id,plan_sha256'||body.plan_sha256!==plan.plan_sha256||
         !['check','delete','absence'].includes(body.action))return json({error:'FIXED_PLAN_REQUIRED'},400);
      if(plan.schema!=='skylla-approved-delete-pilot/v1'||plan.project_id!==PROJECT||plan.bucket!==BUCKET||
         plan.owner_approved!==true||plan.separate_approval_required_for_further_objects!==true||
         !/^[a-f0-9]{64}$/.test(plan.approved_proposal_sha256||'')||
         plan.entries.length<1||plan.entries.length>5||!plan.entries.every(validEntry)||
         new Set(plan.entries.map(e=>e.object_path)).size!==plan.entries.length||
         new Set(plan.entries.map(e=>e.id)).size!==plan.entries.length||
         await sha256(new TextEncoder().encode(JSON.stringify(plan.entries)))!==plan.plan_sha256)
        return json({error:'INVALID_APPROVED_PLAN'},503);
      entry=plan.entries.find(e=>e.id===body.id);
      if(!entry)return json({error:'OBJECT_NOT_APPROVED'},403);
      const service=env('SUPABASE_SERVICE_ROLE_KEY');if(!service)throw Error('SERVER_CONFIGURATION_REQUIRED');
      const headers={authorization:'Bearer '+service,apikey:service};
      const request=(path,options={})=>fetcher(BASE+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
        ...options,headers:{...headers,...options.headers}});
      const getJSON=async path=>JSON.parse(new TextDecoder().decode(await boundedBody(await request(path),65536)));
      const absence=async()=>{
        const r=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+entry.object_path);
        if(r.ok){await r.body?.cancel();return {absent:false,http_status:r.status};}
        const raw=await r.text();if(raw.length>4096)throw Error('UNEXPECTED_ABSENCE_RESPONSE');
        let code;try{code=JSON.parse(raw).statusCode;}catch{}
        // Storage versions may return HTTP 400 wrapping a numeric 404.
        return {absent:r.status===404||(r.status===400&&String(code)==='404'),http_status:r.status,storage_status_code:code??null};
      };
      const identity={id:entry.id,bucket:BUCKET,object_path:entry.object_path,
        permanent_drive_file_id:entry.permanent_drive_file_id,sha256:entry.sha256,size_bytes:entry.size_bytes};
      if(body.action==='absence')return json({...identity,status:'absence_check',...await absence(),observed_at:new Date(now()).toISOString()});
      if(!fresh(entry.drive_verified_at,now())||!fresh(entry.dependencies_verified_at,now())||
         !fresh(entry.app_verified_at,now())||entry.dependencies_clear!==true||entry.reference_paths_unchanged!==true||
         entry.workflow_idle!==true||!entry.restore_plan_sha256||!entry.job_id||
         !['rule_spells','rule_skills'].includes(entry.registry_table)||
         !['icon_path','cutout_path','illustration_path','illustration_wide_path'].includes(entry.registry_field))
        throw Error('STALE_OR_INCOMPLETE_SAFETY_EVIDENCE');
      const proof=await verifyStorageEntry(entry,plan.plan_sha256,{env,fetcher,now,until});
      const jobs=await getJSON('/rest/v1/hermes_jobs?select=id,status,source_path,source_sha256,app_path,app_sha256&id=eq.'+encoded(entry.job_id));
      const pending=await getJSON('/rest/v1/hermes_jobs?select=id&status=not.in.(active,failed)&limit=1');
      if(!Array.isArray(jobs)||jobs.length!==1||jobs[0].status!=='active'||jobs[0].source_path!==entry.object_path||
         jobs[0].source_sha256!==entry.sha256||jobs[0].app_path!==entry.app_path||jobs[0].app_sha256!==entry.app_sha256||
         !Array.isArray(pending)||pending.length)throw Error('ACTIVE_OR_CHANGED_HERMES_DEPENDENCY');
      const registry=await getJSON('/rest/v1/'+entry.registry_table+'?select='+entry.registry_field+'&id=eq.'+encoded(entry.registry_id));
      if(!Array.isArray(registry)||registry.length!==1||registry[0][entry.registry_field]!==entry.app_path)
        throw Error('REGISTRY_REFERENCE_CHANGED');
      if(!['alea-hermes-public','alea-spell-art','alea-skill-art'].includes(entry.app_bucket)||
         !/^[a-zA-Z0-9_/-]+\.webp$/.test(entry.app_path)||entry.app_path.includes('..')||
         !Number.isInteger(entry.app_size_bytes)||entry.app_size_bytes<=0||entry.app_size_bytes>1048576)
        throw Error('INVALID_DISPLAY_IDENTITY');
      const display=await boundedBody(await request('/storage/v1/object/authenticated/'+entry.app_bucket+'/'+entry.app_path),entry.app_size_bytes);
      if(display.length!==entry.app_size_bytes||await sha256(display)!==entry.app_sha256)throw Error('DISPLAY_BYTES_CHANGED');
      if(now()>=until||![entry.drive_verified_at,entry.dependencies_verified_at,entry.app_verified_at].every(t=>fresh(t,now())))
        throw Error('SAFETY_WINDOW_EXPIRED');
      if(body.action==='check')return json({...identity,status:'preflight_verified',source_proof:proof,delete_api_invoked:false,verified_at:new Date(now()).toISOString()});
      if(attempted.has(entry.object_path))return json({...identity,status:'skipped',reason:'ALREADY_ATTEMPTED_RECONCILE',delete_api_invoked:false});
      attempted.add(entry.object_path);deleteInvoked=true;
      const deleted=await request('/storage/v1/object/'+BUCKET,{method:'DELETE',headers:{'content-type':'application/json'},
        body:JSON.stringify({prefixes:[entry.object_path]})});
      const results=JSON.parse(new TextDecoder().decode(await boundedBody(deleted,65536)));
      if(!Array.isArray(results)||results.length!==1||results[0].name!==entry.object_path)
        throw Error('DELETE_RESPONSE_REQUIRES_RECONCILIATION');
      const gone=await absence();
      return json({...identity,status:gone.absent?'deleted_verified_absent':'outcome_unknown',...gone,
        source_proof:proof,delete_api_invoked:true,storage_delete_response_names:results.map(r=>r.name),
        observed_at:new Date(now()).toISOString()});
    }catch(error){
      const known=['STALE_OR_INCOMPLETE_SAFETY_EVIDENCE','ACTIVE_OR_CHANGED_HERMES_DEPENDENCY',
        'REGISTRY_REFERENCE_CHANGED','DISPLAY_BYTES_CHANGED','SAFETY_WINDOW_EXPIRED'];
      return json({id:entry?.id??null,object_path:entry?.object_path??null,
        status:deleteInvoked?'outcome_unknown':'skipped',delete_api_invoked:deleteInvoked,
        reason:known.includes(error.message)?error.message:'SAFETY_OR_TRANSFER_CHECK_FAILED',observed_at:new Date(now()).toISOString()});
    }
  };
}
