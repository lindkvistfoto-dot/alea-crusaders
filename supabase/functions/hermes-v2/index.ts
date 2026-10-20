import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/** Legacy HERMES: authenticated history/rollback only; original publication is retired. */
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL_BASE, SERVICE_KEY, {auth:{persistSession:false}});
const headers = {"access-control-allow-origin":"*","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","content-type":"application/json"};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers});
const fail = (status:number,code:string,message:string) => json({error:code,message},status);
async function event(id:string,state:string,message:string){
 await db.from("hermes_job_events").insert({job_id:id,state,message:message.slice(0,450)});
}
async function patchJob(id:string,details:Record<string,unknown>){
 const {error}=await db.from("hermes_jobs").update({...details,updated_at:new Date().toISOString()}).eq("id",id);
 if(error)throw Error("JOB_WRITE_"+error.message);
}
async function rollbackJob(job:Record<string,any>){
 const id=job.id as string;
 if(job.status==="rolled_back")return {ok:true,job_id:id,status:"rolled_back"};
 if(job.status!=="active")return {ok:false,job_id:id,error:"ONLY_ACTIVE_JOBS_CAN_ROLL_BACK"};
 const table=job.kind==="symbol"?"rule_magic_symbols":"rule_spells";
 const field=job.kind==="symbol"?"symbol_key":"spell_key";
 const {data:target,error}=await db.from(table).select("id,icon_path").eq(field,job.target_key).single();
 if(error||!target)return {ok:false,job_id:id,error:"TARGET_NOT_FOUND"};
 if(target.icon_path!==job.app_path && target.icon_path!==job.previous_icon_path)
  return {ok:false,job_id:id,error:"ICON_CHANGED_SINCE_ACTIVATION"};
 if(target.icon_path===job.app_path){
  const {data:updated,error:writeError}=await db.from(table)
   .update({icon_path:job.previous_icon_path}).eq("id",target.id).eq("icon_path",job.app_path).select("id,icon_path");
  if(writeError||updated?.length!==1)return {ok:false,job_id:id,error:"ROLLBACK_CONFLICT"};
 }
 const {data:confirmed,error:readError}=await db.from(table).select("icon_path").eq("id",target.id).single();
 if(readError||confirmed.icon_path!==job.previous_icon_path)return {ok:false,job_id:id,error:"ROLLBACK_READBACK_FAILED"};
 await patchJob(id,{status:"rolled_back",activated_at:null});
 await event(id,"rolled_back","Restored prior icon path; immutable media retained.");
 return {ok:true,job_id:id,status:"rolled_back",icon_path:job.previous_icon_path};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return fail(405,"METHOD_NOT_ALLOWED","Only POST is enabled.");
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!jwt)return fail(401,"UNAUTHORIZED","Missing access token.");
 const client=createClient(URL_BASE,ANON_KEY,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await client.auth.getUser(jwt);
 if(authError||!user)return fail(401,"UNAUTHORIZED","Session is invalid.");
 // Authorize with the *same JWT* used in Alea, never with the service-role client's own session.
 // This matches the established profiles_select RLS: the signed-in user may read their own row.
 // A service-role misconfiguration must not incorrectly strip an authenticated user's admin role.
 const actor=createClient(URL_BASE,ANON_KEY,{
  global:{headers:{Authorization:"Bearer "+jwt}},
  auth:{persistSession:false}
 });
 const {data:profile,error:profileError}=await actor.from("profiles").select("id,is_admin").eq("id",user.id).maybeSingle();
 if(profileError){
  console.error("HERMES_AUTH_PROFILE_READ_FAILED",profileError.code||"UNKNOWN",profileError.message.slice(0,120));
  return fail(503,"ADMIN_LOOKUP_FAILED","Cannot verify administrator rights; please retry.");
 }
 if(!profile?.is_admin)return fail(403,"ADMIN_REQUIRED","Only Alea admins can upload art.");
 try{
  if(!(req.headers.get("content-type")||"").includes("application/json"))
   return fail(410,"HERMES_ORIGINAL_PUBLICATION_RETIRED","Use Google Drive HERMES queue. PNG uploads are disabled.");
  const body=await req.json();
  if(body.action==="diagnostics")return json({ok:true,version:3,publication_enabled:false,source_uploads_enabled:false,rollback_enabled:true});
  if(body.action!=="rollback")return fail(410,"HERMES_ORIGINAL_PUBLICATION_RETIRED","Import, retry and PNG staging are disabled. Use Google Drive HERMES queue.");
  if(typeof body.job_id!=="string")return fail(400,"BAD_ACTION","Expected rollback and job_id.");
  const {data:job,error}=await db.from("hermes_jobs").select("*").eq("id",body.job_id).single();
  if(error||!job)return fail(404,"NOT_FOUND","Job not found.");
  // This legacy endpoint only knows icon jobs. Other profiles require their own reviewed rollback.
  if(!["spell","symbol"].includes(job.kind))return fail(400,"UNSUPPORTED_ROLLBACK_KIND","Only legacy icon rollback is supported.");
  return json(await rollbackJob(job));
 }catch{
  return fail(400,"HERMES_REQUEST_FAILED","Request failed; no original publication is available.");
 }
});
