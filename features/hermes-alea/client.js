import {resolveImageProfile} from './profiles.js';
export const DISPLAY_BUCKET='hermes-alea-display';
export const SOURCE_BUCKET='hermes-alea-originals';
const uuid=/^[a-f0-9-]{36}$/i;
export const managedKey=value=>/^hermes-alea:[a-f0-9-]{36}$/i.test(String(value||''));
async function hash(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function convertToWebP(file,{requireAlpha=false,profile={}}={}){
 const limits=resolveImageProfile({...profile,requireAlpha:requireAlpha||profile.requireAlpha===true});
 if(!file||!limits.allowedMimeTypes.includes(file.type))throw Error('Välj en statisk PNG-, JPEG- eller WebP-bild.');
 if(!file.size||file.size>limits.maxBytes)throw Error('Bilden överskrider bildprofilens storleksgräns.');
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width>limits.maxWidth||bitmap.height>limits.maxHeight||bitmap.width*bitmap.height>limits.maxPixels)throw Error('Bilden överskrider bildprofilens dimensionsgräns.');
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Webbläsaren kan inte konvertera bilden.');
  ctx.drawImage(bitmap,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  if(limits.requireAlpha&&!rgba.some((value,index)=>index%4===3&&value===0))throw Error('Bildprofilen kräver äkta transparent bakgrund.');
  const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
  if(!output||output.type!=='image/webp'||output.size>limits.maxBytes)throw Error('Webbläsaren kunde inte skapa en giltig WebP.');
  const check=await createImageBitmap(output);try{if(check.width!==bitmap.width||check.height!==bitmap.height)throw Error('Bildens dimensioner ändrades.')}finally{check.close();}
  return output;
 }finally{bitmap.close();}
}
export function createHermesAleaClient({rpc,request,convert=convertToWebP,storage=globalThis.sessionStorage,targetPolicies={}}){
 const allowedTargets=new Set(Object.keys(targetPolicies));
 const attempts=new Map();
 async function json(path,options={}){
  const r=await request(path,options);const text=await r.text();const data=text?JSON.parse(text):null;
  if(!r.ok)throw Error(data?.error||data?.message||'Bildöverföringen misslyckades ('+r.status+').');return data;
 }
 async function uploadBlob(bucket,path,blob){
  const r=await request('/storage/v1/object/'+bucket+'/'+path,{method:'POST',headers:{'Content-Type':blob.type,'x-upsert':'false'},body:blob});
  if(r.ok)return;
  // An earlier upload may have succeeded with a lost response. Verification checks full bytes.
  if(r.status===409)return;
  if(r.status===400){const data=await r.json().catch(()=>null);if(data?.statusCode==='409'||data?.error==='Duplicate')return;}
  throw Error('Bilden kunde inte laddas upp. Försök igen; tidigare bild finns kvar.');
 }
 function idempotency(fingerprint){
  const key='hermes-alea:'+fingerprint;
  let id=attempts.get(key);
  try{id=id||storage?.getItem(key);}catch{}
  if(!id){id=crypto.randomUUID();attempts.set(key,id);try{storage?.setItem(key,id);}catch{}}
  return id;
 }
 async function upload({targetKind,target,file,profile={}}){
  if(!uuid.test(target?.id)||!allowedTargets.has(targetKind))throw Error('Spara posten innan du lägger till en bild.');
  const policy=resolveImageProfile(targetPolicies[targetKind]);
  const limits=resolveImageProfile({...policy,...profile,
    maxBytes:Math.min(policy.maxBytes,profile.maxBytes??policy.maxBytes),
    maxWidth:Math.min(policy.maxWidth,profile.maxWidth??policy.maxWidth),
    maxHeight:Math.min(policy.maxHeight,profile.maxHeight??policy.maxHeight),
    maxPixels:Math.min(policy.maxPixels,profile.maxPixels??policy.maxPixels),
    requireAlpha:policy.requireAlpha||profile.requireAlpha===true,
    allowedMimeTypes:(profile.allowedMimeTypes??policy.allowedMimeTypes).filter(type=>policy.allowedMimeTypes.includes(type))
  });
  if(!file||!limits.allowedMimeTypes.includes(file.type)||!file.size||file.size>limits.maxBytes)
    throw Error('Bilden uppfyller inte den valda bildprofilen.');
  const webp=await convert(file,{profile:limits,requireAlpha:limits.requireAlpha});
  if(!webp||webp.type!=='image/webp'||!webp.size||webp.size>limits.maxBytes)
    throw Error('Konverteringen gav ingen giltig WebP inom bildprofilens storleksgräns.');
  const [source_sha256,output_sha256]=await Promise.all([hash(file),hash(webp)]);
  const expected_revision=Number(target.image_revision||0);
  const meta={target_kind:targetKind,target_id:target.id,expected_revision,operation:target.image_asset_id?'REPLACE':'CREATE',source_mime:file.type,source_bytes:file.size,output_bytes:webp.size,source_sha256,output_sha256};
  meta.idempotency_key=idempotency([targetKind,target.id,expected_revision,source_sha256,output_sha256].join(':'));
  const job=await rpc('hermes_alea_begin',{request:meta});
  if(job.state==='activated')return job;
  await uploadBlob(DISPLAY_BUCKET,job.output_path,webp);
  await uploadBlob(SOURCE_BUCKET,job.source_path,file);
  await json('/functions/v1/hermes-alea',{method:'POST',body:JSON.stringify({job_id:job.id})});
  return rpc('hermes_alea_finalize',{job_id:job.id});
 }
 async function remove({targetKind,target}){
  if(!uuid.test(target?.id)||!allowedTargets.has(targetKind))throw Error('Okänd bildplats.');
  const request={target_kind:targetKind,target_id:target.id,expected_revision:Number(target.image_revision||0),operation:'REMOVE',idempotency_key:idempotency(['remove',targetKind,target.id,target.image_revision||0].join(':'))};
  return rpc('hermes_alea_remove',{request});
 }
 async function loadAssets(dbJson){
  const rows=await dbJson('hermes_alea_assets?select=*');
  return Promise.all((rows||[]).map(async row=>{
   if(!/^trophy\/[a-f0-9-]{36}\.webp$/i.test(row.asset_path))throw Error('Ogiltig bildsökväg.');
   const data=await json('/storage/v1/object/sign/'+DISPLAY_BUCKET+'/'+row.asset_path,{method:'POST',body:JSON.stringify({expiresIn:3600})});
   const path=data?.signedURL||data?.signedUrl;
   // Only the known project origin is added by the resolver, never caller-selected URL origins.
   if(typeof path!=='string'||!path.startsWith('/object/sign/'+DISPLAY_BUCKET+'/'))throw Error('Ogiltig signerad bildadress.');
   return {...row,hermes_alea_signed_path:path};
  }));
 }
 return {upload,remove,loadAssets,capabilities:()=>rpc('hermes_alea_capabilities',{})};
}
