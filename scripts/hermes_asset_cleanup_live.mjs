import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {createHermesAssetCleanup, CLEANUP_LIVE_PROJECT} from "../features/hermes-core/asset-cleanup-live.js";

const [requestPath] = Deno.args;
const expectedRepository = "lindkvistfoto-dot/alea-crusaders";
const expectedRef = "refs/heads/main";
const expectedUrl = `https://${CLEANUP_LIVE_PROJECT}.supabase.co`;
const repository = Deno.env.get("GITHUB_REPOSITORY") ?? "";
const ref = Deno.env.get("GITHUB_REF") ?? "";
const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
const projectRef = projectUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1] ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const targetEnv = Deno.env.get("HERMES_TARGET_ENV") ?? "";
if (!requestPath || repository !== expectedRepository || ref !== expectedRef || projectUrl !== expectedUrl ||
    projectRef !== CLEANUP_LIVE_PROJECT || targetEnv !== "LIVE" || !serviceKey)
  throw new Error("CLEANUP_WORKFLOW_ENVIRONMENT_REJECTED");

const request = JSON.parse(await Deno.readTextFile(requestPath));
const db = createClient(projectUrl, serviceKey, {auth: {persistSession: false}});
const systemAssets = db.from("arcane_system_assets");
const storageApi = bucket => db.storage.from(bucket);

async function sha256(bytes) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", copy));
  return [...hash].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function assertQuery(query, code) {
  const {data,error}=await query;
  if(error)throw new Error(code);
  return data;
}

const references = {
  async find(assetKey,path) {
    const checks = [
      {label:"honor_definitions.image_asset_id",query:db.from("honor_definitions").select("id,status").eq("image_asset_id",assetKey)},
      {label:"honor_relief_variants.image_asset_id",query:db.from("honor_relief_variants").select("id,status").eq("image_asset_id",assetKey)},
      {label:"hermes_jobs.target_key",query:db.from("hermes_jobs").select("id,status").eq("target_key",assetKey)},
      {label:"hermes_jobs.app_path",query:db.from("hermes_jobs").select("id,status").eq("app_path",path)},
      {label:"hermes_jobs.previous_icon_path",query:db.from("hermes_jobs").select("id,status").eq("previous_icon_path",path)},
      {label:"hermes_web_jobs.source_path",query:db.from("hermes_web_jobs").select("id,state").eq("source_path",path)},
      {label:"hermes_web_jobs.output_path",query:db.from("hermes_web_jobs").select("id,state").eq("output_path",path)},
      {label:"hermes_alea_jobs.source_path",query:db.from("hermes_alea_jobs").select("id,state").eq("source_path",path)},
      {label:"hermes_alea_jobs.output_path",query:db.from("hermes_alea_jobs").select("id,state").eq("output_path",path)},
      {label:"hermes_alea_jobs.previous_key",query:db.from("hermes_alea_jobs").select("id,state").eq("previous_key",assetKey)},
    ];
    const results=await Promise.all(checks.map(async check=>({label:check.label,rows:await assertQuery(check.query,"CLEANUP_REFERENCE_SCAN_FAILED")})));
    const honors=await assertQuery(db.from("honor_definitions").select("id,status,badge_frame_assets").range(0,999),"CLEANUP_REFERENCE_SCAN_FAILED");
    if(honors.length>=1000)throw new Error("CLEANUP_REFERENCE_SCAN_LIMIT");
    const contains=(value)=>value===assetKey||value===path||
      (Array.isArray(value)&&value.some(contains))||
      (value&&typeof value==="object"&&Object.values(value).some(contains));
    const badgeRefs=honors.filter(row=>contains(row.badge_frame_assets))
      .map(row=>({source:"honor_definitions.badge_frame_assets",id:row.id,state:row.status??null}));
    const assetConfig=JSON.parse(await Deno.readTextFile("config/hermes-system-assets.json"));
    const staticRefs=[];
    const walk=(value,where="config/hermes-system-assets.json")=>{
      if(value===assetKey||value===path){staticRefs.push({source:where,id:assetKey,state:"repository-config"});return;}
      if(Array.isArray(value))value.forEach((child,index)=>walk(child,`${where}[${index}]`));
      else if(value&&typeof value==="object")for(const [key,child] of Object.entries(value)){
        if(key===assetKey||key===path)staticRefs.push({source:`${where}.${key}`,id:assetKey,state:"repository-config"});
        walk(child,`${where}.${key}`);
      }
    };
    walk(assetConfig);
    return [...results.flatMap(result=>result.rows.map(row=>({source:result.label,id:row.id,state:row.state??row.status??null}))),...badgeRefs,...staticRefs];
  },
};

const registry = {
  async read(assetKey) {
    const {data,error}=await systemAssets.select("id,asset_key,asset_path,app_sha256,app_bytes,image_revision")
      .eq("asset_key",assetKey).maybeSingle();
    if(error)throw new Error("CLEANUP_REGISTRY_READ_FAILED");
    return data;
  },
  async deleteIfUnchanged(identity) {
    const {data,error}=await systemAssets.delete().eq("id",identity.registry_row_id)
      .eq("asset_key",identity.asset_key).eq("asset_path",identity.object_path)
      .eq("app_sha256",identity.sha256).eq("app_bytes",identity.bytes)
      .eq("image_revision",identity.image_revision).select("id").maybeSingle();
    if(error)throw new Error("CLEANUP_REGISTRY_DELETE_FAILED");
    return Boolean(data);
  },
};

const storage = {
  async inspect(bucket,path) {
    const slash=path.lastIndexOf("/");
    const folder=path.slice(0,slash);
    const name=path.slice(slash+1);
    const {data:files,error}=await storageApi(bucket).list(folder,{limit:1000,search:name});
    if(error)throw new Error("CLEANUP_STORAGE_METADATA_READ_FAILED");
    const rows=(files??[]).filter(item=>item.name===name&&item.id);
    if(rows.length>1)throw new Error("CLEANUP_STORAGE_ID_AMBIGUOUS");
    const row=rows[0];
    if(!row)return null;
    const {data:downloaded,error:downloadError}=await storageApi(bucket).download(path);
    if(downloadError||!downloaded)throw new Error("CLEANUP_STORAGE_DOWNLOAD_FAILED");
    const bytes=new Uint8Array(await downloaded.arrayBuffer());
    const metadata=row.metadata??{};
    return {id:row.id,bucket,path,bytes:bytes.byteLength,
      mime_type:metadata.mimetype??metadata.mimetype_guess??downloaded.type,sha256:await sha256(bytes)};
  },
  async remove(bucket,path) {
    const {error}=await storageApi(bucket).remove([path]);
    if(error)throw error;
  },
};

const cleanup=createHermesAssetCleanup({projectRef,targetEnv,registry,storage,references});
let result;
try {
  if(request.action==="dry_run") {
    result=await cleanup.preflight(request);
  } else if(request.action==="delete") {
    result=await cleanup.execute(request,request.approval,Deno.env.get("GITHUB_ACTOR")??"");
  } else {
    throw new Error("CLEANUP_ACTION_INVALID");
  }
} catch(error) {
  const code=typeof error?.message==="string"&&/^CLEANUP_[A-Z_]+$/.test(error.message)
    ? error.message:"CLEANUP_UNEXPECTED_FAILURE";
  result={schema:"hermes-asset-cleanup/v1",status:"failed_closed",error_code:code};
  console.log("HERMES_ASSET_CLEANUP_RESULT",JSON.stringify(result));
  const reportPath=Deno.env.get("HERMES_CLEANUP_REPORT_PATH");
  if(reportPath)await Deno.writeTextFile(reportPath,JSON.stringify(result,null,2)+"\n");
  throw new Error(code);
}
console.log("HERMES_ASSET_CLEANUP_RESULT",JSON.stringify(result));
const reportPath=Deno.env.get("HERMES_CLEANUP_REPORT_PATH");
if(reportPath)await Deno.writeTextFile(reportPath,JSON.stringify(result,null,2)+"\n");
