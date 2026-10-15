import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/** HERMES 2.0 — authenticated, content-addressed and retryable ARCANE IVORY pilot. */
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GH_TOKEN = Deno.env.get("HERMES_GITHUB_TOKEN") || "";
const GH_REPO = "lindkvistfoto-dot/alea-crusaders";
const SOURCE = "alea-hermes-source", PUBLIC = "alea-hermes-public";
const db = createClient(URL_BASE, SERVICE_KEY, {auth:{persistSession:false}});
const headers = {"access-control-allow-origin":"*","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","content-type":"application/json"};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers});
const cleanError = (e:unknown) => e instanceof Error ? e.message : String(e);
const fail = (status:number,code:string,message:string) => json({error:code,message},status);
const validKey = (x:string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x);
const bytesToHex = (arr:Uint8Array) => [...arr].map(x=>x.toString(16).padStart(2,"0")).join("");
const hash = async (algorithm:"SHA-1"|"SHA-256",input:Uint8Array) =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest(algorithm,input)));
const u32 = (b:Uint8Array,o:number) => ((b[o]*16777216)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3])>>>0;
function pngInfo(b:Uint8Array){
 const sig=[137,80,78,71,13,10,26,10];
 if(b.length<33||!sig.every((x,i)=>b[i]===x)||String.fromCharCode(...b.slice(12,16))!=="IHDR")throw Error("INVALID_PNG");
 const width=u32(b,16),height=u32(b,20),color=b[25],depth=b[24];
 if(width!==height||width<640||width>4096||depth!==8||color!==6)throw Error("PNG_MUST_BE_SQUARE_RGBA_8BIT_640_TO_4096");
 return {width,height};
}
function webpInfo(b:Uint8Array){
 if(b.length<30||String.fromCharCode(...b.slice(0,4))!=="RIFF"||String.fromCharCode(...b.slice(8,12))!=="WEBP")throw Error("INVALID_WEBP");
 if(u32le(b,4)+8!==b.length)throw Error("INVALID_WEBP_LENGTH");
 if(String.fromCharCode(...b.slice(12,16))!=="VP8X")throw Error("WEBP_ALPHA_HEADER_REQUIRED");
 const width=1+b[24]+(b[25]<<8)+(b[26]<<16);
 const height=1+b[27]+(b[28]<<8)+(b[29]<<16);
 if(width!==640||height!==640||(b[20]&16)===0)throw Error("WEBP_MUST_HAVE_640PX_AND_ALPHA");
}
function u32le(b:Uint8Array,o:number){return (b[o]+(b[o+1]<<8)+(b[o+2]<<16)+(b[o+3]*16777216))>>>0;}
function b64(bytes:Uint8Array){
 let result="";for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(result);
}
async function gitObjectSha(data:Uint8Array){
 const prefix=new TextEncoder().encode("blob "+data.length+"\0");
 const both=new Uint8Array(prefix.length+data.length);both.set(prefix);both.set(data,prefix.length);
 return await hash("SHA-1",both);
}
async function github(method:string,path:string,payload?:unknown){
 const r=await fetch("https://api.github.com/repos/"+GH_REPO+path,{
 method,headers:{"Authorization":"Bearer "+GH_TOKEN,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
 ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw Error("GITHUB_"+r.status+"_"+String(body.message||"request_failed").slice(0,100));
 return body;
}
async function archive(kind:string,key:string,sha256:string,bytes:Uint8Array){
 if(!GH_TOKEN)throw Error("GITHUB_TOKEN_NOT_CONFIGURED");
 const path="assets/hermes/originals/"+kind+"/"+key+"/"+sha256+".png";
 const expected=await gitObjectSha(bytes);
 // If this exact immutable original is already on main, a retry is a read-only success.
 const current=await github("GET","/contents/"+path+"?ref=main").catch(e=>{
  if(cleanError(e).startsWith("GITHUB_404_"))return null;
  throw e;
 });
 if(current){
  if(current.sha!==expected)throw Error("ARCHIVE_PATH_HASH_CONFLICT");
  const head=await github("GET","/git/ref/heads/main");
  return {path,blobSha:expected,commitSha:head.object.sha};
 }
 const blob=await github("POST","/git/blobs",{content:b64(bytes),encoding:"base64"});
 if(blob.sha!==expected)throw Error("GITHUB_BLOB_HASH_MISMATCH");
 for(let attempt=0;attempt<4;attempt++){
  const ref=await github("GET","/git/ref/heads/main");
  const parent=ref.object.sha;
  const parentCommit=await github("GET","/git/commits/"+parent);
  const tree=await github("POST","/git/trees",{base_tree:parentCommit.tree.sha,tree:[{path,mode:"100644",type:"blob",sha:blob.sha}]});
  const commit=await github("POST","/git/commits",{message:"art(HERMES 2): archive "+kind+" "+key+" "+sha256.slice(0,12),tree:tree.sha,parents:[parent]});
  try{
   await github("PATCH","/git/refs/heads/main",{sha:commit.sha,force:false});
   const file=await github("GET","/contents/"+path+"?ref="+commit.sha);
   if(file.sha!==expected)throw Error("GITHUB_COMMIT_VERIFICATION_FAILED");
   return {path,blobSha:expected,commitSha:commit.sha};
  }catch(e){if(attempt===3||!String(cleanError(e)).includes("GITHUB_409")&&!String(cleanError(e)).includes("GITHUB_422"))throw e;}
 }
 throw Error("GITHUB_REF_CONFLICT");
}
async function checkReadback(bucket:string,path:string,checksum:string){
 const {data,error}=await db.storage.from(bucket).download(path);
 if(error||!data)throw Error("STORAGE_READBACK_FAILED_"+cleanError(error));
 const actual=await hash("SHA-256",new Uint8Array(await data.arrayBuffer()));
 if(actual!==checksum)throw Error("STORAGE_CHECKSUM_MISMATCH");
}
async function store(bucket:string,path:string,contents:Uint8Array,mime:string,checksum:string){
 const {error}=await db.storage.from(bucket).upload(path,contents,{contentType:mime,cacheControl:"31536000",upsert:false});
 if(error&&!(/already exists|duplicate|409|resource already/i).test(error.message))throw Error("STORAGE_UPLOAD_FAILED_"+error.message);
 await checkReadback(bucket,path,checksum);
}
async function event(id:string,state:string,message:string){
 await db.from("hermes_job_events").insert({job_id:id,state,message:message.slice(0,450)});
}
async function patchJob(id:string,details:Record<string,unknown>){
 const {error}=await db.from("hermes_jobs").update({...details,updated_at:new Date().toISOString()}).eq("id",id);
 if(error)throw Error("JOB_WRITE_"+error.message);
}
async function processJob(job:Record<string,any>){
 const id=job.id as string;
 try{
  if(job.status==="active")return {ok:true,job_id:id,status:"active",icon_path:job.app_path};
  if(job.status==="rolled_back")return {ok:false,job_id:id,status:"rolled_back",error:"JOB_ROLLED_BACK"};
  await patchJob(id,{attempts:job.attempts+1,status:"staged",error_code:null,error_message:null});
  const {data:source,error:readError}=await db.storage.from(SOURCE).download(job.source_path);
  if(readError||!source)throw Error("SOURCE_MISSING");
  const bytes=new Uint8Array(await source.arrayBuffer());
  pngInfo(bytes);
  if(await hash("SHA-256",bytes)!==job.source_sha256)throw Error("SOURCE_CHECKSUM_MISMATCH");
  const {blobSha,commitSha}=await archive(job.kind,job.target_key,job.source_sha256,bytes);
  await patchJob(id,{status:"archived",github_blob_sha:blobSha,github_commit_sha:commitSha});
  await event(id,"archived","GitHub binary original confirmed "+commitSha.slice(0,12));
  await checkReadback(PUBLIC,job.app_path,job.app_sha256);
  const publicUrl=db.storage.from(PUBLIC).getPublicUrl(job.app_path).data.publicUrl;
  const response=await fetch(publicUrl,{cache:"no-store"});
  if(!response.ok)throw Error("PUBLIC_URL_UNAVAILABLE_"+response.status);
  if(await hash("SHA-256",new Uint8Array(await response.arrayBuffer()))!==job.app_sha256)throw Error("PUBLIC_URL_CHECKSUM_MISMATCH");
  await patchJob(id,{status:"verified"});
  const table=job.kind==="symbol"?"rule_magic_symbols":"rule_spells";
  const field=job.kind==="symbol"?"symbol_key":"spell_key";
  const {data:target,error:lookupError}=await db.from(table).select("id,icon_path").eq(field,job.target_key).maybeSingle();
  if(lookupError||!target)throw Error("TARGET_NOT_FOUND");
  if(target.icon_path!==job.previous_icon_path&&target.icon_path!==job.app_path)throw Error("TARGET_CHANGED_REVIEW_REQUIRED");
  if(target.icon_path!==job.app_path){
   let q=db.from(table).update({icon_path:job.app_path}).eq("id",target.id);
   q=job.previous_icon_path===null?q.is("icon_path",null):q.eq("icon_path",job.previous_icon_path);
   const {data:updated,error:updateError}=await q.select("id,icon_path");
   if(updateError||updated?.length!==1)throw Error("ACTIVATION_CONFLICT");
  }
  const {data:active,error:verifyError}=await db.from(table).select("icon_path").eq("id",target.id).single();
  if(verifyError||active.icon_path!==job.app_path)throw Error("DATABASE_READBACK_MISMATCH");
  await patchJob(id,{status:"active",activated_at:new Date().toISOString(),error_code:null,error_message:null});
  await event(id,"active","Readback verified: "+job.app_path);
  return {ok:true,job_id:id,status:"active",icon_path:job.app_path,github_commit_sha:commitSha};
 }catch(e){
  const msg=cleanError(e).slice(0,400);
  const code=msg.split("_").slice(0,5).join("_");
  const pending=msg==="GITHUB_TOKEN_NOT_CONFIGURED";
  await patchJob(id,{status:pending?"awaiting_archive":"failed",error_code:code,error_message:msg}).catch(()=>{});
  await event(id,pending?"awaiting_archive":"failed",msg).catch(()=>{});
  return {ok:false,job_id:id,status:pending?"awaiting_archive":"failed",error:msg};
 }
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
 const {data:profile,error:profileError}=await db.from("profiles").select("is_admin").eq("id",user.id).single();
 if(profileError||!profile?.is_admin)return fail(403,"ADMIN_REQUIRED","Only Alea admins can upload art.");
 try{
  const type=req.headers.get("content-type")||"";
  if(type.includes("application/json")){
   const body=await req.json();
   if(!["retry","rollback"].includes(body.action)||typeof body.job_id!=="string")return fail(400,"BAD_ACTION","Expected retry/rollback and job_id.");
   const {data:job,error}=await db.from("hermes_jobs").select("*").eq("id",body.job_id).single();
   if(error||!job)return fail(404,"NOT_FOUND","Job not found.");
   return json(body.action==="rollback"?await rollbackJob(job):await processJob(job));
  }
  if(!type.includes("multipart/form-data"))return fail(415,"INVALID_REQUEST","Expected multipart/form-data.");
  const form=await req.formData();
  const source=form.get("source"),app=form.get("app"),kind=String(form.get("kind")||""),key=String(form.get("key")||"");
  if(!(source instanceof File)||!(app instanceof File)||!["spell","symbol"].includes(kind)||!validKey(key))return fail(400,"INVALID_INPUT","Select a valid target and attach source PNG plus optimized WebP.");
  if(source.size<100||source.size>8388608||app.size<100||app.size>500000)return fail(413,"SIZE_LIMIT","PNG max 8 MiB; WebP max 500 kB.");
  const src=new Uint8Array(await source.arrayBuffer()),out=new Uint8Array(await app.arrayBuffer());
  pngInfo(src);webpInfo(out);
  const table=kind==="symbol"?"rule_magic_symbols":"rule_spells";
  const field=kind==="symbol"?"symbol_key":"spell_key";
  const {data:target,error:targetError}=await db.from(table).select("id,icon_path").eq(field,key).maybeSingle();
  if(targetError||!target)return fail(404,"TARGET_NOT_FOUND","Target key does not exist in Alea.");
  const sourceSha=await hash("SHA-256",src),appSha=await hash("SHA-256",out);
  const sourcePath=kind+"/"+key+"/"+sourceSha+".png";
  const appPath="hermes/"+kind+"/"+key+"/"+appSha+".webp";
  const {data:existing}=await db.from("hermes_jobs").select("*").eq("kind",kind).eq("target_key",key).eq("source_sha256",sourceSha).maybeSingle();
  if(existing){
    if(existing.app_sha256!==appSha)return fail(409,"SOURCE_ALREADY_REGISTERED","Same original registered with another output. Retry existing job.");
    return json(await processJob(existing));
  }
  await store(SOURCE,sourcePath,src,"image/png",sourceSha);
  await store(PUBLIC,appPath,out,"image/webp",appSha);
  const {data:job,error:insertError}=await db.from("hermes_jobs").insert({
   kind,target_key:key,source_sha256:sourceSha,app_sha256:appSha,source_path:sourcePath,app_path:appPath,
   source_bytes:src.length,app_bytes:out.length,status:"staged",attempts:0,
   previous_icon_path:target.icon_path,created_by:user.id
  }).select("*").single();
  if(insertError||!job)throw Error("JOB_CREATE_"+cleanError(insertError));
  await event(job.id,"staged","Verified source and public WebP stored with SHA-256 readback.");
  return json(await processJob(job));
 }catch(e){
  const message=cleanError(e);
  return fail(400,"HERMES_UPLOAD_FAILED",message.slice(0,350));
 }
});
