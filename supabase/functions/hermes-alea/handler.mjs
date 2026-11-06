import {validatePair,sha256} from './validation.mjs';
import {recoverAbandonedStaging} from './recovery.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createVerifyHandler({env,decode,fetcher=fetch}){
 return async request=>{
  const origin=request.headers.get('Origin')||'';
  const allowed=(env('HERMES_ALEA_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
  const cors={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization,apikey,content-type','Vary':'Origin'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
  if(origin&&!allowed.includes(origin))return reply({error:'ORIGIN_NOT_ALLOWED'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const url=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return reply({error:'UNAUTHORIZED'},401);
  const headers={apikey:key,Authorization:authorization,'Content-Type':'application/json'};
  const trusted={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function json(path,options={}){
   const r=await fetcher(url+path,{headers,...options});
   if(!r.ok)throw Error('UPSTREAM_'+r.status);
   const body=await r.text();return body?JSON.parse(body):null;
  }
  try{
   const text=await request.text();if(text.length>1024)return reply({error:'REQUEST_TOO_LARGE'},413);
   const payload=JSON.parse(text);
   const serviceCall=Boolean(service&&authorization==='Bearer '+service);
   if(serviceCall&&origin)return reply({error:'FORBIDDEN'},403);
   // User calls are bound to their own authenticated account; service calls are CI-only and scoped to one owner.
   const user=serviceCall?null:await json('/auth/v1/user');
   if(payload?.action==='recover_staging'){
    const requesterId=serviceCall?payload.requested_by:user?.id;
    if(!uuid.test(String(requesterId||'')))return reply({error:'INVALID_RECOVERY_OWNER'},400);
    if(!serviceCall){
     const cap=await json('/rest/v1/rpc/hermes_alea_capabilities',{method:'POST',body:'{}'});
     if(!cap?.enabled)return reply({error:'HERMES_ALEA_DISABLED'},409);
    }
    const result=await recoverAbandonedStaging({url,headers:trusted,requesterId,fetcher});
    return reply(result);
   }
   if(serviceCall)return reply({error:'FORBIDDEN'},403);
   const {job_id}=payload;if(!uuid.test(job_id))return reply({error:'INVALID_JOB'},400);
   const rows=await json('/rest/v1/hermes_alea_jobs?id=eq.'+job_id+'&select=*');
   const job=rows[0];if(!job||job.requested_by!==user.id)return reply({error:'FORBIDDEN'},403);
   if(job.state==='activated')return reply({verified:true});
   if(job.state!=='uploading'||job.operation==='REMOVE')return reply({error:'INVALID_STATE'},409);
   const cap=await json('/rest/v1/rpc/hermes_alea_capabilities',{method:'POST',body:'{}'});
   if(!cap.enabled)return reply({error:'HERMES_ALEA_DISABLED'},409);
   async function download(bucket,path,expected){
    const r=await fetcher(url+'/storage/v1/object/'+bucket+'/'+path,{headers:trusted});
    if(!r.ok)throw Error('UPLOAD_INCOMPLETE');
    if(Number(r.headers.get('content-length'))>12000000)throw Error('INVALID_SIZE');
    const reader=r.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>expected||size>12000000)throw Error('INVALID_SIZE');parts.push(value)}}finally{await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}return bytes;
   }
   const source=await download('hermes-alea-originals',job.source_path,job.source_bytes);
   const output=await download('hermes-alea-display',job.output_path,job.output_bytes);
   const receipt=await validatePair(job,source,output,decode);
   if(['combatant-pose','race-pose'].includes(job.target_kind)){
    const segment=job.target_kind==='race-pose'?'race-battle-pose-cutout':'battle-pose-cutout';
    const path='hermes/'+segment+'/'+job.target_id+'/'+receipt.output_sha256+'.webp';
    const uploaded=await fetcher(url+'/storage/v1/object/alea-hermes-public/'+path,{
     method:'POST',headers:{...trusted,'Content-Type':'image/webp','x-upsert':'false'},body:output
    });
    if(!uploaded.ok){
     const duplicate=await uploaded.json().catch(()=>null);
     if(uploaded.status!==409&&duplicate?.statusCode!=='409'&&duplicate?.error!=='Duplicate')throw Error('POSE_OUTPUT_UPLOAD_FAILED');
    }
    const stored=await download('alea-hermes-public',path,job.output_bytes);
    if(stored.length!==job.output_bytes||await sha256(stored)!==receipt.output_sha256)throw Error('POSE_OUTPUT_READBACK_FAILED');
   }
   await json('/rest/v1/rpc/hermes_alea_verify',{method:'POST',headers:trusted,body:JSON.stringify({job_id,receipt})});
   return reply({verified:true});
  }catch(error){
   const code=error instanceof Error?error.message:'VERIFICATION_FAILED';
   // Never leak upstream response bodies or credentials.
   return reply({error:/^[A-Z_0-9]+$/.test(code)?code:'VERIFICATION_FAILED'},code==='UPSTREAM_401'?401:422);
  }
 };
}
