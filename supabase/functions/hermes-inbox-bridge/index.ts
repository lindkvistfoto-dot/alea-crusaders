import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_BASE, SERVICE_KEY, {auth:{persistSession:false}});
const headers = {
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"POST,OPTIONS",
  "access-control-allow-headers":"authorization,apikey,content-type,x-hermes-idempotency-key,x-hermes-target-id,x-hermes-target-key,x-hermes-image-type,x-hermes-sha256",
  "content-type":"application/json"
};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers});
const fail = (status:number,code:string,message:string) => json({error:code,message},status);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TYPES = new Set(["icon","effect","cutout","illustration","illustration-wide"]);
function hex(bytes:Uint8Array){return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("")}
function sniff(bytes:Uint8Array){
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "image/png";
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
  return "";
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return fail(405,"METHOD_NOT_ALLOWED","Vain POST är tillåten.");
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt)return fail(401,"UNAUTHORIZED","Inloggningen saknas.");
  const auth=createClient(URL_BASE,ANON_KEY,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(jwt);
  if(authError||!user)return fail(401,"UNAUTHORIZED","Inloggningen har gått ut. Logga in igen.");
  const actor=createClient(URL_BASE,ANON_KEY,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false}});
  const {data:profile,error:profileError}=await actor.from("profiles").select("id,is_admin").eq("id",user.id).maybeSingle();
  if(profileError)return fail(503,"ADMIN_LOOKUP_FAILED","Administratörsrättigheten kunde inte verifieras. Försök igen.");
  if(!profile?.is_admin)return fail(403,"ADMIN_REQUIRED","Endast administratörer får ta emot bilder.");
  const id=req.headers.get("x-hermes-idempotency-key")||"";
  const targetId=req.headers.get("x-hermes-target-id")||"";
  const targetKey=req.headers.get("x-hermes-target-key")||"";
  const imageType=req.headers.get("x-hermes-image-type")||"";
  const expectedSha=(req.headers.get("x-hermes-sha256")||"").toLowerCase();
  if(!UUID.test(id)||!UUID.test(targetId)||!KEY.test(targetKey)||!TYPES.has(imageType)||!/^[a-f0-9]{64}$/.test(expectedSha))
    return fail(400,"BAD_IMAGE_REQUEST","Bildinformationen är ogiltiga. Välj bilden på nytt.");
  const existing=await admin.from("hermes_asset_jobs").select("id,idempotency_key,target_id,target_key,image_type,source_sha256,state").eq("idempotency_key",id).maybeSingle();
  if(existing.error)return fail(503,"JOB_LOOKUP_FAILED","Jobbstatus kunde inte läsas. Försök igen.");
  if(existing.data){
    const j=existing.data;
    if(j.target_id!==targetId||j.target_key!==targetKey||j.image_type!==imageType||j.source_sha256!==expectedSha)
      return fail(409,"IDEMPOTENCY_CONFLICT","Uppladdningsförsöket används redan för en annan bild.");
    return json({ok:true,job_id:j.id,status:j.state,received:true},202);
  }
  const {data:target,error:targetError}=await admin.from("rule_magic_symbols").select("id,symbol_key,icon_path,effect_image_path,cutout_path,illustration_path,illustration_wide_path").eq("id",targetId).eq("symbol_key",targetKey).maybeSingle();
  if(targetError||!target)return fail(404,"SYMBOL_NOT_FOUND","Symbolen hittades inte. Ladda om administrationen.");
  const field=({icon:"icon_path",effect:"effect_image_path",cutout:"cutout_path",illustration:"illustration_path","illustration-wide":"illustration_wide_path"} as Record<string,string>)[imageType];
  const contentType=(req.headers.get("content-type")||"").split(";")[0].toLowerCase();
  if(!["image/png","image/jpeg","image/webp"].includes(contentType))return fail(415,"UNSUPPORTED_IMAGE_TYPE","Välj PNG, JPEG eller WebP.");
  const raw=new Uint8Array(await req.arrayBuffer());
  if(raw.length<100||raw.length>8388608)return fail(413,"IMAGE_SIZE_INVALID","Bilden måste vara mellan 100 byte och 8 MiB.");
  if(sniff(raw)!==contentType)return fail(415,"IMAGE_CONTENT_MISMATCH","Filinnehållet stämmer inte med bildformatet.");
  const actualSha=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",raw)));
  if(actualSha!==expectedSha)return fail(422,"SHA256_MISMATCH","Bilden ändrades under uppladdningen. Försök igen.");
  const path="hermes-assets/"+id+"/"+actualSha;
  const upload=await admin.storage.from("alea-hermes-source").upload(path,raw,{contentType,upsert:false,cacheControl:"0"});
  if(upload.error){
    const prior=await admin.storage.from("alea-hermes-source").download(path);
    if(prior.error)return fail(503,"STAGING_WRITE_FAILED","Originalet kunde inte säkras. Ingen bild har aktiverats.");
    const priorBytes=new Uint8Array(await prior.data.arrayBuffer());
    const priorSha=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",priorBytes)));
    if(priorSha!==actualSha)return fail(409,"STAGING_CONFLICT","Ett annat original använder redan detta jobb-ID.");
  }
  const row={
    id,idempotency_key:id,target_type:"symbol",target_id:targetId,target_key:targetKey,image_type:imageType,
    source_bucket:"alea-hermes-source",source_path:path,source_sha256:actualSha,source_bytes:raw.length,
    previous_path:target[field]||null,requested_by:user.id
  };
  const inserted=await admin.from("hermes_asset_jobs").insert(row).select("id,state").single();
  if(inserted.error){
    const duplicate=await admin.from("hermes_asset_jobs").select("id,target_id,target_key,image_type,source_sha256,state").eq("idempotency_key",id).maybeSingle();
    if(duplicate.data&&duplicate.data.target_id===targetId&&duplicate.data.target_key===targetKey&&duplicate.data.image_type===imageType&&duplicate.data.source_sha256===actualSha)
      return json({ok:true,job_id:duplicate.data.id,status:duplicate.data.state,received:true},202);
    return fail(503,"JOB_CREATE_FAILED","Originalet är mellanlagrat men jobbkvittot kunde inte skapas. Försök igen med samma uppladdning.");
  }
  return json({ok:true,job_id:inserted.data.id,status:"received",received:true},202);
});
