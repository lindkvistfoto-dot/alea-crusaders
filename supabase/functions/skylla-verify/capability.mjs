import {sha256,boundedBody,validEntry,verifyStorageEntry,PROJECT} from './core.mjs';

/** Deployment-authorized, read-only capability. Token never enters the bundle.
 * One fixed allowlist, <=30 minute window, no browser CORS, no bytes or URLs in
 * responses. Repeated reads within the window are safe; this is not single-use.
 */
export function createCapabilityHandler({plan, capability, env, fetcher = fetch, now = Date.now}) {
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,
    headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
  return async req=>{
    if(req.method!=='POST')return json({error:'POST_REQUIRED'},405);
    if(req.headers.has('origin'))return json({error:'BROWSER_ORIGIN_DENIED'},403);
    const start=Date.parse(capability.not_before),until=Date.parse(capability.expires_at);
    if(capability.enabled!==true||!Number.isFinite(start)||!Number.isFinite(until)||
       until<=start||until-start>1800000||now()<start||now()>=until||
       !/^[a-f0-9]{64}$/.test(capability.token_sha256||'')||
       capability.plan_sha256!==plan.plan_sha256)return json({error:'CAPABILITY_DISABLED_OR_EXPIRED'},503);
    const token=req.headers.get('x-skylla-capability')||'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)||await sha256(new TextEncoder().encode(token))!==capability.token_sha256){
      return json({error:'CAPABILITY_REQUIRED'},401);
    }
    let entry;
    try{
      if(!(req.headers.get('content-type')||'').startsWith('application/json'))return json({error:'JSON_REQUIRED'},400);
      const body=JSON.parse(new TextDecoder().decode(await boundedBody(new Response(req.body),512)));
      if(Object.keys(body).sort().join(',')!=='id,plan_sha256'||body.plan_sha256!==plan.plan_sha256){
        return json({error:'FIXED_PLAN_REQUIRED'},400);
      }
      if(plan.schema!=='skylla-server-allowlist/v1'||plan.project_id!==PROJECT||
         await sha256(new TextEncoder().encode(JSON.stringify(plan.entries)))!==plan.plan_sha256||
         !plan.entries.every(validEntry)||new Set(plan.entries.map(e=>e.id)).size!==plan.entries.length){
        return json({error:'INVALID_SERVER_PLAN'},503);
      }
      entry=plan.entries.find(e=>e.id===body.id);
      if(!entry)return json({error:'OBJECT_NOT_ALLOWLISTED'},403);
      const proof=await verifyStorageEntry(entry,plan.plan_sha256,{env,fetcher,now,until});
      return json({...proof,authorization_method:'deployment_scoped_read_capability',
        capability_expires_at:capability.expires_at});
    }catch{
      return json({error:'VERIFICATION_FAILED',id:entry?.id||null,safe_to_delete:false},422);
    }
  };
}
