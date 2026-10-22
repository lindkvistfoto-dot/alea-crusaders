/**
 * HERMES 2.1 trusted GitHub Actions -> Supabase publisher.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in runner secrets.
 * Never run on untrusted pull_request; workflow is restricted to main push/dispatch.
 * Only activates image after source/app/URL checksums and DB CAS succeed.
 */
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { assertSpellCutoutWritable, systemAssetProfile } from "./hermes2_asset_profiles.ts";

const url=Deno.env.get("SUPABASE_URL")||"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
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
if(manifest.schema!==2||!["pilot","publish"].includes(manifest.publication_mode)||!Array.isArray(manifest.assets)||manifest.assets.length<1||manifest.assets.length>100)throw Error("INVALID_MANIFEST");
const reportPath=Deno.env.get("HERMES_REPORT_PATH");
const started=Date.now();

function bytesToHex(data:Uint8Array){return [...data].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function digest(type:"SHA-1"|"SHA-256",bytes:Uint8Array){
 const buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);
 return bytesToHex(new Uint8Array(await crypto.subtle.digest(type,buffer)));
}
async function verifyStorage(bucket:string,path:string,sha:string){
 const {data,error}=await db.storage.from(bucket).download(path);
 if(error||!data)throw Error("STORAGE_READBACK_FAILED "+bucket+" "+(error?.message||""));
 const bytes=new Uint8Array(await data.arrayBuffer());
 if(await digest("SHA-256",bytes)!==sha)throw Error("STORAGE_SHA256_MISMATCH "+bucket);
}
async function immutableUpload(bucket:string,path:string,bytes:Uint8Array,mime:string,sha:string){
 if(!["alea-hermes-public","alea-spell-art","alea-skill-art"].includes(bucket)||mime!=="image/webp"||!path.endsWith(".webp"))throw Error("DISPLAY_WEBP_ONLY");
 const {error}=await db.storage.from(bucket).upload(path,new Blob([new Uint8Array(bytes)],{type:mime}),
  {upsert:false,contentType:mime,cacheControl:"31536000"});
 if(error&&!/already exists|duplicate|409|resource already/i.test(error.message))
  throw Error("STORAGE_UPLOAD_FAILED "+bucket+" "+error.message);
 await verifyStorage(bucket,path,sha);
}
async function verifyDelivery(bucket:string,path:string,sha:string){
 if(bucket==="alea-hermes-public"){
   const publicUrl=db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
   const response=await fetch(publicUrl,{cache:"no-store"});
   if(!response.ok)throw Error("PUBLIC_IMAGE_UNAVAILABLE "+response.status);
   if(await digest("SHA-256",new Uint8Array(await response.arrayBuffer()))!==sha)
    throw Error("PUBLIC_IMAGE_SHA_MISMATCH");
  }else{
   const {data:signed,error:signedError}=await db.storage.from(bucket).createSignedUrl(path,60);
   if(signedError||!signed?.signedUrl)throw Error("PRIVATE_IMAGE_SIGNING_FAILED "+(signedError?.message||""));
   const response=await fetch(signed.signedUrl,{cache:"no-store"});
   if(!response.ok)throw Error("PRIVATE_IMAGE_UNAVAILABLE "+response.status);
   if(await digest("SHA-256",new Uint8Array(await response.arrayBuffer()))!==sha)
    throw Error("PRIVATE_IMAGE_SHA_MISMATCH");
  }
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
function checkAsset(a:any,archiveRequired=false){
 if(!a||!["system-asset","spell","spell-cutout","symbol","skill","skill-illustration","skill-illustration-wide","spell-illustration-wide","spell-illustration"].includes(a.kind)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.target_key||"")||
  !/^[a-f0-9]{64}$/.test(a.source_sha256||"")||!/^[a-f0-9]{64}$/.test(a.app_sha256||""))
  throw Error("INVALID_ASSET_METADATA");
 if(archiveRequired&&(a.archive_verified!==true||a.source_path!=="drive://"+a.archive_file_id||
   !Number.isInteger(a.batch_index)||a.batch_index<0||typeof a.target_id!=="string"))throw Error("VERIFIED_DRIVE_ARCHIVE_REQUIRED");
 const expected=/^drive:\/\/[A-Za-z0-9_-]{10,160}$/.test(a.source_path||"");
 const out=`${a.kind}/${a.target_key}/${a.app_sha256}.webp`;
 if(a.kind==='system-asset'){
  const profile=systemAssetProfile(a.target_key);
  if(!archiveRequired||!expected||a.app_file!==out||a.target_id!==profile.id||
    a.width!==profile.display_size[0]||a.height!==profile.display_size[1]||a.alpha_preserved!==true)
   throw Error('INVALID_SYSTEM_ASSET_METADATA');
  return {table:'arcane_system_assets',field:'asset_key',sourcePath:a.source_path,
   appPath:'hermes/'+out,assetField:'asset_path' as const};
 }
 const spellWide=a.kind==="spell-illustration-wide";
 const spellSquare=a.kind==="spell-illustration";
 const spellCutout=a.kind==="spell-cutout";
 const spellArt=spellWide||spellSquare||spellCutout;
 const wide=a.kind==="skill-illustration-wide"||spellWide;
 const illustration=a.kind==="skill-illustration"||wide||spellSquare;
 const expectsAlpha=!illustration;
 const assetField: "icon_path" | "illustration_path" | "illustration_wide_path" | "cutout_path" = spellCutout?"cutout_path":wide?"illustration_wide_path":illustration?"illustration_path":"icon_path";
 const validDimensions=spellWide?Number.isInteger(a.width)&&Number.isInteger(a.height)&&a.width>=640&&a.width<=2560&&a.height>=360&&a.height<=1440&&a.width/a.height>=1.25&&a.width/a.height<=2.4:wide?Number.isInteger(a.width)&&Number.isInteger(a.height)&&a.width>=640&&a.width<=2560&&a.height>=360&&a.height<=1440&&Math.abs(a.width/a.height-16/9)/(16/9)<=0.003:a.width===640&&a.height===640;
 if(!expected||a.app_file!==out||!validDimensions||a.alpha_preserved!==expectsAlpha)
  throw Error("IMMUTABLE_ASSET_PATH_MISMATCH");
 const skill=a.kind==="skill"||(illustration&&!spellArt);
 return {table:a.kind==="symbol"?"rule_magic_symbols":skill?"rule_skills":"rule_spells",
  field:a.kind==="symbol"?"symbol_key":skill?"id":"spell_key", sourcePath:a.source_path,
  appPath:spellArt?"spell/TARGET_UUID/"+illustrationUuid(a.app_sha256)+".webp":illustration?"skill/"+a.target_key.replaceAll("-","_")+(wide?"/illustration_wide/":"/illustration/")+illustrationUuid(a.app_sha256)+".webp":"hermes/"+a.kind+"/"+a.target_key+"/"+a.app_sha256+".webp", assetField};
}
type ArtTarget = {id:string; icon_path:string|null; illustration_path?:string|null; effect_image_path?:string|null; cutout_path?:string|null; illustration_wide_path?:string|null; asset_path?:string|null; app_sha256?:string|null; app_bytes?:number|null; width?:number|null; height?:number|null; alpha_preserved?:boolean|null};
async function publish(a:any){
 const {table,field,sourcePath,appPath:declaredAppPath,assetField}=checkAsset(a,manifest.archive_required===true);
 const app=new Uint8Array(await Deno.readFile(outputRoot+"/"+a.app_file));
 if(!Number.isInteger(a.source_bytes)||a.source_bytes<100||a.source_bytes>8388608||app.length!==a.app_bytes||app.length>(a.kind==="spell-illustration-wide"?524288:500000))throw Error("FILE_SIZE_MISMATCH");
 if(await digest("SHA-256",app)!==a.app_sha256)throw Error("APP_SHA_MISMATCH");
 const system=a.kind==='system-asset';
 const systemFields=['asset_path','app_sha256','app_bytes','width','height','alpha_preserved'] as const;
 const targetFields=system?'id,asset_key,'+systemFields.join(','):table==="rule_skills"?"id,icon_path,illustration_path,illustration_wide_path":table==="rule_spells"?"id,icon_path,effect_image_path,cutout_path,illustration_path,illustration_wide_path":"id,icon_path";
 const {data:target,error:targetError}=await db.from(table).select(targetFields).eq(field,(a.kind==="skill"||a.kind==="skill-illustration"||a.kind==="skill-illustration-wide")?a.target_key.replaceAll("-","_"):a.target_key).returns<ArtTarget[]>().maybeSingle();
 if(targetError)throw Error("TARGET_READ "+targetError.message);
 if(!target)throw Error("TARGET_NOT_FOUND "+a.target_key);
 if(a.target_id!==undefined&&target.id!==a.target_id)throw Error("TARGET_ID_MISMATCH "+a.target_key);
 const appPath=declaredAppPath.replace("TARGET_UUID",target.id);
 const appBucket=(a.kind==="spell-cutout"||a.kind==="spell-illustration-wide"||a.kind==="spell-illustration")?"alea-spell-art":(a.kind==="skill-illustration"||a.kind==="skill-illustration-wide")?"alea-skill-art":"alea-hermes-public";
 const activationFields=system?{asset_path:appPath,app_sha256:a.app_sha256,app_bytes:app.length,width:a.width,height:a.height,alpha_preserved:true}:{[assetField]:appPath};
 const previousFields=system?Object.fromEntries(systemFields.map(field=>[field,target[field]])):{[assetField]:target[assetField]};
 const metadataMatches=(row:ArtTarget)=>!system||systemFields.every(field=>row?.[field]===(activationFields as Record<string,unknown>)[field]);
 if(manifest.publication_mode==="pilot"){
  const pilotPath="hermes/minotaurus-pilot/"+a.kind+"/"+a.target_key+"/"+a.app_sha256+".webp";
  await immutableUpload(appBucket,pilotPath,app,"image/webp",a.app_sha256);
  await verifyDelivery(appBucket,pilotPath,a.app_sha256);
  const {data:after,error}=await db.from(table).select(targetFields).eq("id",target.id).returns<ArtTarget[]>().single();
  if(error||JSON.stringify(after)!==JSON.stringify(target))throw Error("PILOT_TARGET_CHANGED");
  console.log("HERMES_DIRECT_PILOT_VERIFIED",JSON.stringify({kind:a.kind,target_key:a.target_key,source_path:a.source_path,source_sha256:a.source_sha256,source_bytes:a.source_bytes,app_sha256:a.app_sha256,app_bytes:app.length,bucket:appBucket,path:pilotPath,pointers_unchanged:true}));
  return {status:"pilot_verified",target_id:target.id,bucket:appBucket,path:pilotPath,app_sha256:a.app_sha256};
 }
 const {data:existing,error:jobError}=await db.from("hermes_jobs").select("*")
  .eq("kind",a.kind).eq("target_key",a.target_key).eq("source_sha256",a.source_sha256).maybeSingle();
 if(jobError)throw Error("JOB_READ "+jobError.message);
 if(existing?.app_sha256 && existing.app_sha256!==a.app_sha256)throw Error("SOURCE_ALREADY_REGISTERED_DIFFERENT_WEBP");
 // Explicit HERMES publish dispatches may replace an existing wide illustration. The publisher snapshots the old path in previous_icon_path and activates only with compare-and-set below; concurrent changes still fail closed.
 if(existing?.status==="rolled_back")throw Error("JOB_WAS_ROLLED_BACK");
 if(existing?.status==="active"){
  if(target[assetField]!==existing.app_path||!metadataMatches(target))throw Error("ACTIVE_RECORD_HAS_BEEN_CHANGED");
  await verifyStorage(appBucket,existing.app_path,a.app_sha256);
  await verifyDelivery(appBucket,existing.app_path,a.app_sha256);
  console.log("ALREADY_ACTIVE",a.kind,a.target_key);
  return {status:"already_active",target_id:target.id,bucket:appBucket,path:existing.app_path,app_sha256:a.app_sha256};
 }
 // Cutouts are pilot-only and fail closed if the spell already has an image.
 // Retries may proceed only when the target already points at this exact
 // deterministic, content-derived asset path.
 if(a.kind==="spell-cutout")assertSpellCutoutWritable(target.cutout_path,appPath);
 const jobBody={kind:a.kind,target_key:a.target_key,source_sha256:a.source_sha256,app_sha256:a.app_sha256,
  source_path:sourcePath,app_path:appPath,source_bytes:a.source_bytes,app_bytes:app.length,
  github_blob_sha:null,github_commit_sha:ghSha,origin:"github_actions",
  github_run_id:ghRun,created_by:null,status:"staged",attempts:1,previous_icon_path:target[assetField]};
 let job=existing;
 if(job){
  await patch(job.id,{attempts:(job.attempts||0)+1,status:"staged",source_path:sourcePath,source_bytes:a.source_bytes,github_blob_sha:null,github_commit_sha:ghSha,github_run_id:ghRun,app_path:appPath,error_code:null,error_message:null});
 }else{
  const {data:created,error:createError}=await db.from("hermes_jobs").insert(jobBody).select("*").single();
  if(createError)throw Error("JOB_CREATE "+createError.message);
  job=created;
 }
 let activatedHere=false;
 try{
  await recordEvent(job.id,"staged","Drive original decoded and SHA-256 verified: "+a.source_path);
  await immutableUpload(appBucket,appPath,app,"image/webp",a.app_sha256);
  await patch(job.id,{status:"archived",github_blob_sha:null,github_commit_sha:ghSha});
  await recordEvent(job.id,"archived","Drive original retained; optimized WebP Storage readback verified");
  await verifyDelivery(appBucket,appPath,a.app_sha256);
  await patch(job.id,{status:"verified"});
  const previous=job.previous_icon_path;
  if(target[assetField]!==previous&&target[assetField]!==appPath)throw Error("TARGET_CHANGED_REVIEW_REQUIRED");
  if(target[assetField]!==appPath){
   let q=db.from(table).update(activationFields).eq("id",target.id);
   q=previous===null?q.is(assetField,null):q.eq(assetField,previous);
   const {data:affected,error:activateError}=await q.select("id,"+assetField);
   if(activateError||affected?.length!==1)throw Error("ACTIVATION_CONFLICT");
   activatedHere=true;
  }
  const {data:final,error:readError}=await db.from(table).select(targetFields).eq("id",target.id).returns<ArtTarget[]>().single();
  // The selected slot is protected by compare-and-swap. Sibling art fields may activate concurrently.
  if(readError||final?.[assetField]!==appPath||!metadataMatches(final))throw Error("DATABASE_READBACK_MISMATCH");
  await patch(job.id,{status:"active",activated_at:new Date().toISOString(),error_code:null,error_message:null});
  await recordEvent(job.id,"active","Published and read back "+appPath);
  console.log("HERMES_ACTIVE",a.kind,a.target_key,appPath);
  return {status:"active",target_id:target.id,bucket:appBucket,path:appPath,app_sha256:a.app_sha256};
 }catch(e){
  let msg=String(e instanceof Error?e.message:e).slice(0,340);
  if(activatedHere){
   // Restore only this invocation's slot if a post-activation check fails.
   // A concurrent replacement must never be overwritten by recovery.
   try{
    const {data:restored,error}=await db.from(table).update(system?previousFields:{[assetField]:job.previous_icon_path})
     .eq("id",target.id).eq(assetField,appPath).select("id,"+assetField);
    if(error||restored?.length!==1)msg="ACTIVATION_ROLLBACK_REVIEW_REQUIRED "+msg;
   }catch{msg="ACTIVATION_ROLLBACK_REVIEW_REQUIRED "+msg}
  }
  await patch(job.id,{status:"failed",error_code:msg.split(" ")[0],error_message:msg}).catch(()=>{});
  await recordEvent(job.id,"failed",msg).catch(()=>{});
  throw Error(msg);
 }
}
async function verifyEmptySourceBucket(){
 const {data,error}=await db.storage.from("alea-hermes-source").list("",{limit:1});
 if(error||!data)throw Error("SOURCE_BUCKET_CHECK_FAILED");
 if(data.length)throw Error("SOURCE_BUCKET_NOT_EMPTY");
}
const outcomes:any[]=new Array(manifest.assets.length);
let sourceBucketEmpty:boolean|null=null;
let batchError:string|undefined;
try{
 const slots=manifest.assets.map((a:any)=>JSON.stringify([a?.kind,a?.target_key]));
 if(new Set(slots).size!==slots.length)throw Error("DUPLICATE_BATCH_TARGET");
 if(manifest.archive_required===true)await verifyEmptySourceBucket();
 let cursor=0;
 async function worker(){
  while(cursor<manifest.assets.length){
   const position=cursor++;
   const asset=manifest.assets[position];
   const itemStart=Date.now();
   try{
    outcomes[position]={index:asset.batch_index??position,kind:asset.kind,target_key:asset.target_key,...await publish(asset)};
   }catch(e){
    const error=String(e instanceof Error?e.message:e).slice(0,400);
    outcomes[position]={index:asset?.batch_index??position,status:"failed",kind:asset?.kind,target_key:asset?.target_key,error};
    console.error("HERMES_ASSET_FAILED",asset?.kind,asset?.target_key,error);
   }
   outcomes[position].elapsed_seconds=(Date.now()-itemStart)/1000;
  }
 }
 // A single client/credential is shared; independent target slots permit bounded I/O overlap.
 await Promise.all(Array.from({length:Math.min(manifest.archive_required===true?3:1,manifest.assets.length)},()=>worker()));
}catch(e){batchError=String(e instanceof Error?e.message:e).slice(0,400)}
if(manifest.archive_required===true){
 try{await verifyEmptySourceBucket();sourceBucketEmpty=true}catch(e){sourceBucketEmpty=false;batchError=String(e instanceof Error?e.message:e)}
}
const report={schema:4,items:outcomes.filter(Boolean),source_bucket_empty:sourceBucketEmpty,
 elapsed_seconds:(Date.now()-started)/1000,error:batchError};
if(reportPath)await Deno.writeTextFile(reportPath,JSON.stringify(report,null,2)+"\n");
console.log("HERMES_PUBLICATION_REPORT",JSON.stringify(report));
const failures=outcomes.filter(item=>item?.status==="failed");
if(batchError||failures.length)throw Error(batchError||"HERMES_BATCH_FAILED "+failures.length);
console.log("HERMES 2.1: verified publication finished.");
