/**
 * HERMES 2.1 trusted GitHub Actions -> Supabase publisher.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in runner secrets.
 * Never run on untrusted pull_request; workflow is restricted to main push/dispatch.
 * Only activates image after source/app/URL checksums and DB CAS succeed.
 */
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const url=Deno.env.get("SUPABASE_URL")||"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ghToken=Deno.env.get("GITHUB_TOKEN")||"";
const ghSha=Deno.env.get("GITHUB_SHA")||"";
const ghRef=Deno.env.get("GITHUB_REF")||"";
const ghRun=Deno.env.get("GITHUB_RUN_ID")||"";
const repo=Deno.env.get("GITHUB_REPOSITORY")||"";
if(!url||!secret)throw Error("HERMES_PUBLISH_SECRETS_MISSING");
if(repo!=="lindkvistfoto-dot/alea-crusaders"||ghRef!=="refs/heads/main"||!/^\d{6,20}$/.test(ghRun)||!/^[a-f0-9]{40}$/.test(ghSha))throw Error("UNTRUSTED_ACTIONS_RUN");
if(Deno.args.length!==2)throw Error("Usage: deno run -A scripts/hermes2_publish.ts <manifest> <output-dir>");
const db=createClient(url,secret,{auth:{persistSession:false}});
const manifest=JSON.parse(await Deno.readTextFile(Deno.args[0]));
const outputRoot=Deno.args[1];
if(manifest.schema!==1||!Array.isArray(manifest.assets)||manifest.assets.length<1)throw Error("INVALID_MANIFEST");

function bytesToHex(data:Uint8Array){return [...data].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function digest(type:"SHA-1"|"SHA-256",bytes:Uint8Array){
 const buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);
 return bytesToHex(new Uint8Array(await crypto.subtle.digest(type,buffer)));
}
async function blobSha(bytes:Uint8Array){
 const prefix=new TextEncoder().encode("blob "+bytes.length+"\0");
 const combined=new Uint8Array(prefix.length+bytes.length);
 combined.set(prefix);combined.set(bytes,prefix.length);
 return digest("SHA-1",combined);
}
async function assertGithubOriginal(asset:any,raw:Uint8Array){
 const expected=await blobSha(raw);
 const target=`https://api.github.com/repos/${repo}/contents/${asset.source_path}?ref=${ghSha}`;
 const response=await fetch(target,{headers:{Accept:"application/vnd.github+json",
  ...(ghToken?{Authorization:"Bearer "+ghToken}:{}),"X-GitHub-Api-Version":"2022-11-28"}});
 if(!response.ok)throw Error("GITHUB_SOURCE_LOOKUP_"+response.status);
 const data=await response.json();
 if(data.sha!==expected)throw Error("GITHUB_BLOB_SHA_MISMATCH");
 return expected;
}
async function verifyStorage(bucket:string,path:string,sha:string){
 const {data,error}=await db.storage.from(bucket).download(path);
 if(error||!data)throw Error("STORAGE_READBACK_FAILED "+bucket+" "+(error?.message||""));
 const bytes=new Uint8Array(await data.arrayBuffer());
 if(await digest("SHA-256",bytes)!==sha)throw Error("STORAGE_SHA256_MISMATCH "+bucket);
}
async function immutableUpload(bucket:string,path:string,bytes:Uint8Array,mime:string,sha:string){
 const {error}=await db.storage.from(bucket).upload(path,new Blob([new Uint8Array(bytes)],{type:mime}),
  {upsert:false,contentType:mime,cacheControl:"31536000"});
 if(error&&!/already exists|duplicate|409|resource already/i.test(error.message))
  throw Error("STORAGE_UPLOAD_FAILED "+bucket+" "+error.message);
 await verifyStorage(bucket,path,sha);
}
async function recordEvent(id:string,state:string,message:string){
 const {error}=await db.from("hermes_job_events").insert({job_id:id,state,message:message.slice(0,400)});
 if(error)throw Error("JOB_EVENT_WRITE "+error.message);
}
async function patch(id:string,fields:Record<string,unknown>){
 const {error}=await db.from("hermes_jobs").update({...fields,updated_at:new Date().toISOString()}).eq("id",id);
 if(error)throw Error("JOB_UPDATE "+error.message);
}
function illustrationUuid(sha:string){
 const hex=sha.slice(0,32).split("");
 hex[12]="4";
 hex[16]=(8+(parseInt(hex[16],16)%4)).toString(16);
 const value=hex.join("");
 return value.slice(0,8)+"-"+value.slice(8,12)+"-"+value.slice(12,16)+"-"+value.slice(16,20)+"-"+value.slice(20,32);
}
function checkAsset(a:any){
 if(!a||!["spell","symbol","skill","skill-illustration","skill-illustration-wide"].includes(a.kind)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.target_key||"")||
  !/^[a-f0-9]{64}$/.test(a.source_sha256||"")||!/^[a-f0-9]{64}$/.test(a.app_sha256||""))
  throw Error("INVALID_ASSET_METADATA");
 const expected=`assets/hermes/originals/${a.kind}/${a.target_key}/${a.source_sha256}.png`;
 const out=`${a.kind}/${a.target_key}/${a.app_sha256}.webp`;
 const wide=a.kind==="skill-illustration-wide";
 const illustration=a.kind==="skill-illustration"||wide;
 const expectsAlpha=!illustration;
 const assetField: "icon_path" | "illustration_path" | "illustration_wide_path" = wide?"illustration_wide_path":illustration?"illustration_path":"icon_path";
 const validDimensions=wide?Number.isInteger(a.width)&&Number.isInteger(a.height)&&a.width>=640&&a.width<=2560&&a.height>=360&&a.height<=1440&&Math.abs(a.width/a.height-16/9)/(16/9)<=0.003:a.width===640&&a.height===640;
 if(a.source_path!==expected||a.app_file!==out||!validDimensions||a.alpha_preserved!==expectsAlpha)
  throw Error("IMMUTABLE_ASSET_PATH_MISMATCH");
 const skill=a.kind==="skill"||illustration;
 return {table:a.kind==="symbol"?"rule_magic_symbols":skill?"rule_skills":"rule_spells",
  field:a.kind==="symbol"?"symbol_key":skill?"id":"spell_key", sourcePath:`${a.kind}/${a.target_key}/${a.source_sha256}.png`,
  appPath:illustration?"skill/"+a.target_key.replaceAll("-","_")+(wide?"/illustration_wide/":"/illustration/")+illustrationUuid(a.app_sha256)+".webp":"hermes/"+a.kind+"/"+a.target_key+"/"+a.app_sha256+".webp", assetField};
}
async function publish(a:any){
 const {table,field,sourcePath,appPath,assetField}=checkAsset(a);
 const raw=new Uint8Array(await Deno.readFile(a.source_path));
 const app=new Uint8Array(await Deno.readFile(outputRoot+"/"+a.app_file));
 if(raw.length!==a.source_bytes||app.length!==a.app_bytes||app.length>500000)throw Error("FILE_SIZE_MISMATCH");
 if(await digest("SHA-256",raw)!==a.source_sha256)throw Error("SOURCE_SHA_MISMATCH");
 if(await digest("SHA-256",app)!==a.app_sha256)throw Error("APP_SHA_MISMATCH");
 const gitBlob=await assertGithubOriginal(a,raw);
 const targetFields=table==="rule_skills"?"id,icon_path,illustration_path,illustration_wide_path":"id,icon_path,illustration_path";
 const {data:target,error:targetError}=await db.from(table).select(targetFields).eq(field,(a.kind==="skill"||a.kind==="skill-illustration"||a.kind==="skill-illustration-wide")?a.target_key.replaceAll("-","_"):a.target_key).maybeSingle();
 if(targetError)throw Error("TARGET_READ "+targetError.message);
 if(!target)throw Error("TARGET_NOT_FOUND "+a.target_key);
 const {data:existing,error:jobError}=await db.from("hermes_jobs").select("*")
  .eq("kind",a.kind).eq("target_key",a.target_key).eq("source_sha256",a.source_sha256).maybeSingle();
 if(jobError)throw Error("JOB_READ "+jobError.message);
 if(existing?.app_sha256 && existing.app_sha256!==a.app_sha256)throw Error("SOURCE_ALREADY_REGISTERED_DIFFERENT_WEBP");
 if(a.kind==="skill-illustration-wide" && target.illustration_wide_path!==null && !(existing && target.illustration_wide_path===appPath && existing.app_path===appPath))throw Error("WIDE_ALREADY_EXISTS_REVIEW_REQUIRED");
 if(existing?.status==="rolled_back")throw Error("JOB_WAS_ROLLED_BACK");
 if(a.kind==="skill-illustration"){
  const obsoletePath="hermes/skill-illustration/"+a.target_key+"/"+a.app_sha256+".webp";
  const {error:cleanupError}=await db.storage.from("alea-hermes-public").remove([obsoletePath]);
  if(cleanupError)console.warn("ORPHANED_PUBLIC_ILLUSTRATION_CLEANUP_FAILED",cleanupError.message);
 }
 if(existing?.status==="active"){
  if(target[assetField]!==existing.app_path)throw Error("ACTIVE_RECORD_HAS_BEEN_CHANGED");
  console.log("ALREADY_ACTIVE",a.kind,a.target_key);return;
 }
 const jobBody={kind:a.kind,target_key:a.target_key,source_sha256:a.source_sha256,app_sha256:a.app_sha256,
  source_path:sourcePath,app_path:appPath,source_bytes:raw.length,app_bytes:app.length,
  github_blob_sha:gitBlob,github_commit_sha:ghSha,origin:"github_actions",
  github_run_id:ghRun,created_by:null,status:"staged",attempts:1,previous_icon_path:target[assetField]};
 let job=existing;
 if(job){
  await patch(job.id,{attempts:(job.attempts||0)+1,status:"staged",app_path:appPath,error_code:null,error_message:null});
 }else{
  const {data:created,error:createError}=await db.from("hermes_jobs").insert(jobBody).select("*").single();
  if(createError)throw Error("JOB_CREATE "+createError.message);
  job=created;
 }
 try{
  await recordEvent(job.id,"staged","HERMES 2.1 source validated; GitHub blob "+gitBlob);
  await immutableUpload("alea-hermes-source",sourcePath,raw,"image/png",a.source_sha256);
  const appBucket=(a.kind==="skill-illustration"||a.kind==="skill-illustration-wide")?"alea-skill-art":"alea-hermes-public";
  await immutableUpload(appBucket,appPath,app,"image/webp",a.app_sha256);
  await patch(job.id,{status:"archived",github_blob_sha:gitBlob,github_commit_sha:ghSha});
  await recordEvent(job.id,"archived","Immutable GitHub original and Supabase readback verified");
  if(appBucket==="alea-hermes-public"){
   const publicUrl=db.storage.from(appBucket).getPublicUrl(appPath).data.publicUrl;
   const response=await fetch(publicUrl,{cache:"no-store"});
   if(!response.ok)throw Error("PUBLIC_IMAGE_UNAVAILABLE "+response.status);
   if(await digest("SHA-256",new Uint8Array(await response.arrayBuffer()))!==a.app_sha256)
    throw Error("PUBLIC_IMAGE_SHA_MISMATCH");
  }else{
   const {data:signed,error:signedError}=await db.storage.from(appBucket).createSignedUrl(appPath,60);
   if(signedError||!signed?.signedUrl)throw Error("PRIVATE_IMAGE_SIGNING_FAILED "+(signedError?.message||""));
   const response=await fetch(signed.signedUrl,{cache:"no-store"});
   if(!response.ok)throw Error("PRIVATE_IMAGE_UNAVAILABLE "+response.status);
   if(await digest("SHA-256",new Uint8Array(await response.arrayBuffer()))!==a.app_sha256)
    throw Error("PRIVATE_IMAGE_SHA_MISMATCH");
  }
  await patch(job.id,{status:"verified"});
  const previous=job.previous_icon_path;
  if(target[assetField]!==previous&&target[assetField]!==appPath)throw Error("TARGET_CHANGED_REVIEW_REQUIRED");
  if(target[assetField]!==appPath){
   let q=db.from(table).update({[assetField]:appPath}).eq("id",target.id);
   q=previous===null?q.is(assetField,null):q.eq(assetField,previous);
   const {data:affected,error:activateError}=await q.select("id,"+assetField);
   if(activateError||affected?.length!==1)throw Error("ACTIVATION_CONFLICT");
  }
  const {data:final,error:readError}=await db.from(table).select(targetFields).eq("id",target.id).single();
  if(readError||final?.[assetField]!==appPath)throw Error("DATABASE_READBACK_MISMATCH");
  if(a.kind==="skill-illustration-wide" && (final.icon_path!==target.icon_path || final.illustration_path!==target.illustration_path))throw Error("EXISTING_ART_CHANGED_DURING_WIDE_ACTIVATION");
  await patch(job.id,{status:"active",activated_at:new Date().toISOString(),error_code:null,error_message:null});
  await recordEvent(job.id,"active","Published and read back "+appPath);
  console.log("HERMES_ACTIVE",a.kind,a.target_key,appPath);
 }catch(e){
  const msg=String(e instanceof Error?e.message:e).slice(0,340);
  await patch(job.id,{status:"failed",error_code:msg.split(" ")[0],error_message:msg}).catch(()=>{});
  await recordEvent(job.id,"failed",msg).catch(()=>{});
  throw e;
 }
}
for(const asset of manifest.assets)await publish(asset);
console.log("HERMES 2.1: verified publication finished.");
