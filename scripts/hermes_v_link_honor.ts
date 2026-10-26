/** HERMES V: link a verified, published system asset to one honor relief variant.
 * Runs only in trusted main Actions after successful publisher readback.
 * Does not activate the honor itself or change the displayed material.
 */
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const [honorId,material,assetKey]=Deno.args;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!uuid.test(honorId||"")||!["enamel","metal","wood"].includes(material)||!/^arcane-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assetKey||""))throw Error("INVALID_HONOR_LINK_INPUT");
if(Deno.env.get("GITHUB_REPOSITORY")!=="lindkvistfoto-dot/alea-crusaders"||Deno.env.get("GITHUB_REF")!=="refs/heads/main")throw Error("UNTRUSTED_CONTEXT");
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const {data:honor,error:honorError}=await db.from("honor_definitions").select("id,name,category,created_by").eq("id",honorId).single();
if(honorError||!honor||!["badge","award"].includes(honor.category)||!honor.created_by)throw Error("HONOR_TARGET_NOT_FOUND");
const {data:asset,error:assetError}=await db.from("arcane_system_assets").select("asset_key,asset_path,app_sha256,alpha_preserved").eq("asset_key",assetKey).single();
if(assetError||!asset?.asset_path||!asset?.alpha_preserved||!asset?.app_sha256)throw Error("ASSET_NOT_PUBLISHED_AND_VERIFIED");
if(!asset.asset_path.startsWith("hermes/system-asset/"+assetKey+"/"))throw Error("ASSET_PATH_MISMATCH");
const {data:variants,error:variantsError}=await db.from("honor_relief_variants").select("id,material,image_asset_id,status").eq("honor_id",honorId).eq("material",material);
if(variantsError)throw Error("VARIANT_READ_FAILED "+variantsError.message);
if((variants||[]).length>1)throw Error("AMBIGUOUS_MATERIAL_VARIANTS");
if(variants?.length){
 const v=variants[0];
 if(v.image_asset_id&&v.image_asset_id!==assetKey)throw Error("EXISTING_VARIANT_ASSET_CONFLICT");
 if(v.status==="archived")throw Error("VARIANT_ARCHIVED");
 if(!v.image_asset_id){
  const {data:updated,error}=await db.from("honor_relief_variants").update({image_asset_id:assetKey,updated_at:new Date().toISOString()}).eq("id",v.id).is("image_asset_id",null).select("id").single();
  if(error||!updated)throw Error("VARIANT_CONCURRENT_UPDATE");
 }
}else{
 const {error}=await db.from("honor_relief_variants").insert({honor_id:honorId,name:({enamel:"Emalj",metal:"Metallrelief",wood:"Snidat trä"})[material],material,image_asset_id:assetKey,status:"draft",created_by:honor.created_by});
 if(error)throw Error("VARIANT_INSERT_FAILED "+error.message);
}
const {data:verified,error:verifyError}=await db.from("honor_relief_variants").select("id,image_asset_id").eq("honor_id",honorId).eq("material",material).eq("image_asset_id",assetKey).single();
if(verifyError||!verified)throw Error("VARIANT_READBACK_FAILED");
console.log("HERMES_V_HONOR_RELIEF_LINKED",JSON.stringify({honor_id:honorId,material,asset_key:assetKey,variant_id:verified.id}));
