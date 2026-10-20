import {sha256,boundedBody,PROJECT} from './core.mjs';

/** Separate five-display-file read scope; source originals and writes forbidden.
 * Binary WebP output is fully decoded by Pillow in the authenticated client.
 */
export function createDisplayHandler({plan,capability,env,fetcher=fetch,now=Date.now}) {
  const error=(code,status)=>Response.json({error:code},{status,headers:{'cache-control':'no-store'}});
  return async req=>{
    if(req.method!=='POST')return error('POST_REQUIRED',405);
    if(req.headers.has('origin'))return error('BROWSER_ORIGIN_DENIED',403);
    const start=Date.parse(capability.not_before),until=Date.parse(capability.expires_at);
    if(capability.enabled!==true||!Number.isFinite(start)||!Number.isFinite(until)||
       until<=start||until-start>1800000||now()<start||now()>=until||
       capability.plan_sha256!==plan.plan_sha256)return error('DISABLED_OR_EXPIRED',503);
    const token=req.headers.get('x-skylla-capability')||'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)||await sha256(new TextEncoder().encode(token))!==capability.token_sha256){
      return error('CAPABILITY_REQUIRED',401);
    }
    try{
      const body=JSON.parse(new TextDecoder().decode(await boundedBody(new Response(req.body),512)));
      if(Object.keys(body).sort().join(',')!=='id,plan_sha256'||body.plan_sha256!==plan.plan_sha256)return error('FIXED_PLAN_REQUIRED',400);
      if(plan.schema!=='skylla-display-read-plan/v1'||plan.project_id!==PROJECT||plan.entries.length!==5||
         await sha256(new TextEncoder().encode(JSON.stringify(plan.entries)))!==plan.plan_sha256||
         new Set(plan.entries.map(e=>e.id)).size!==5||!plan.entries.every(e=>
           /^[a-f0-9]{64}$/.test(e.id)&&/^[a-f0-9]{64}$/.test(e.sha256)&&
           ['alea-hermes-public','alea-spell-art','alea-skill-art'].includes(e.bucket)&&
           /^(?:hermes\/)?(?:spell|skill)\/[a-z0-9_-]+\/(?:illustration(?:_wide)?\/)?[a-f0-9-]+\.webp$/.test(e.path)&&
           Number.isInteger(e.size_bytes)&&e.size_bytes>0&&e.size_bytes<=1024*1024))return error('INVALID_DISPLAY_PLAN',503);
      const entry=plan.entries.find(e=>e.id===body.id);
      if(!entry)return error('OBJECT_NOT_ALLOWLISTED',403);
      const service=env('SUPABASE_SERVICE_ROLE_KEY');if(!service)return error('SERVER_CONFIGURATION_REQUIRED',503);
      const response=await fetcher(`https://${PROJECT}.supabase.co/storage/v1/object/authenticated/${entry.bucket}/${entry.path}`,
        {method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+service,apikey:service}});
      const bytes=await boundedBody(response,entry.size_bytes);
      if(bytes.length!==entry.size_bytes||await sha256(bytes)!==entry.sha256||now()>=until)throw Error('DISPLAY_MISMATCH');
      return new Response(bytes,{headers:{'content-type':'image/webp','cache-control':'no-store',
        'x-content-type-options':'nosniff','x-content-sha256':entry.sha256}});
    }catch{return error('DISPLAY_READ_FAILED',422);}
  };
}
