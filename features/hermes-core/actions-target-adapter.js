// Database adapters for trusted HERMES CORE Actions publishing.
import {normalizeCoreAppImageKey,resolveCoreAppImageTarget} from "./app-image-targets.js";
export function createCoreActionsTargetAdapter({db,prepared,registryKey}) {
 const targetKind=prepared.target?.kind??"system";
 const appTarget=resolveCoreAppImageTarget(targetKind, prepared.profile_id);
 const honorTable=targetKind==="honor-definition"?"honor_definitions":"honor_relief_variants";
 function dbMetadata(metadata){return {asset_path:metadata.path,app_sha256:metadata.sha256,app_bytes:metadata.bytes,width:metadata.width,height:metadata.height,alpha_preserved:metadata.alphaPreserved};}
 function appImageUpdate(previous,metadata){
  const values={[appTarget.image_column]:metadata.path};
  if(appTarget.metadata_column){
   values[appTarget.metadata_column]={
    ...(previous.row[appTarget.metadata_column]&&typeof previous.row[appTarget.metadata_column]==="object"?previous.row[appTarget.metadata_column]:{}),
    master:prepared.source_file_name??null,
    drive_file_id:prepared.drive_file_id,
    archive_file_id:prepared.archive_file_id,
    source_sha256:prepared.source_sha256,
    app_sha256:metadata.sha256,
    mime_type:prepared.source_mime,
    width:metadata.width,
    height:metadata.height,
    alpha_preserved:metadata.alphaPreserved,
    verified:true,
    published_by:"HERMES-CORE"
   };
  }
  return values;
 }
 async function readTarget(target){
  if(appTarget){
   const key=normalizeCoreAppImageKey(targetKind,target.id,prepared.profile_id);
   const columns=["id",appTarget.image_column];
   if(appTarget.metadata_column)columns.push(appTarget.metadata_column);
   const {data,error}=await db.from(appTarget.table).select(columns.join(",")).eq(appTarget.lookup_column,key).maybeSingle();
   if(error)throw error;
   return data?{key:data[appTarget.image_column]??null,revision:0,row:data}:null;
  }
  if(targetKind!=="system"){
   const {data,error}=await db.from(honorTable).select(targetKind==="honor-relief"?"id,honor_id,image_asset_id,image_revision,material":"id,image_asset_id,image_revision").eq("id",target.id).maybeSingle();
   if(error)throw error;
   if(!data)throw new Error("HONOR_TARGET_NOT_FOUND");
   if(targetKind==="honor-relief"&&prepared.target.material!==data.material)throw new Error("RELIEF_MATERIAL_MISMATCH");
   return {key:data.image_asset_id??null,revision:Number(data.image_revision??0),row:data};
  }
  const {data,error}=await db.from("arcane_system_assets").select("id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved,image_revision").eq("asset_key",target.id).maybeSingle();
  if(error)throw error;
  return data?{key:data.asset_path??null,revision:Number(data.image_revision??0),row:data}:null;
 }
 async function activate(target,expectedRevision,expectedKey,metadata,create){
  if(appTarget){
   if(create)throw new Error("CORE_APP_TARGET_MUST_EXIST");
   if(metadata?.path==null)throw new Error("CORE_APP_IMAGE_REMOVE_UNSUPPORTED");
   if(prepared.profile_id==="spell-cutout"&&expectedKey&&expectedKey!==metadata.path)throw new Error("EXISTING_CUTOUT_PROTECTED");
   const previous=await readTarget(target);
   if(!previous||previous.key!==expectedKey)throw new Error("CORE_APP_TARGET_CHANGED");
   if(appTarget.binding_type==="record-image"&&expectedKey!==null&&expectedKey!==metadata.path)
    throw new Error("CORE_RECORD_IMAGE_REPLACE_PROTECTED");
   let update=db.from(appTarget.table).update(appImageUpdate(previous,metadata)).eq("id",previous.row.id);
   update=expectedKey===null?update.is(appTarget.image_column,null):update.eq(appTarget.image_column,expectedKey);
   if(appTarget.metadata_column){
    const oldMetadata=previous.row[appTarget.metadata_column];
    update=oldMetadata===null||oldMetadata===undefined
     ?update.is(appTarget.metadata_column,null):update.eq(appTarget.metadata_column,oldMetadata);
   }
   const columns=["id",appTarget.image_column];
   const {data,error}=await update.select(columns.join(",")).maybeSingle();
   if(error)throw error;
   if(!data){
    const current=await readTarget(target);
    if(current?.key===metadata.path)return {key:current.key,revision:0};
    throw new Error("CORE_APP_TARGET_CONCURRENT_CHANGE");
   }
   const confirmed=await readTarget(target);
   if(confirmed?.key!==metadata.path)throw new Error("CORE_APP_TARGET_READBACK_MISMATCH");
   if(appTarget.metadata_column){
    const record=confirmed.row[appTarget.metadata_column];
    if(record?.app_sha256!==metadata.sha256||record?.source_sha256!==prepared.source_sha256||
       record?.archive_file_id!==prepared.archive_file_id||record?.verified!==true)
     throw new Error("CORE_APP_IMAGE_METADATA_READBACK_MISMATCH");
   }
   return {key:confirmed.key,revision:0};
  }
  if(targetKind!=="system"){
   if(create)throw new Error("HONOR_TARGET_MUST_EXIST");
   const {data:existing,error:lookupError}=await db.from("arcane_system_assets").select("id,asset_key,asset_path,app_sha256,image_revision").eq("asset_key",registryKey).maybeSingle();
   if(lookupError)throw lookupError;
   if(!existing){
    const {error:insertError}=await db.from("arcane_system_assets").insert({id:crypto.randomUUID(),asset_key:registryKey,label:prepared.label});
    if(insertError&&insertError.code!=="23505")throw insertError;
   }
   const {data:registered,error:registeredError}=await db.from("arcane_system_assets").select("id,asset_key,asset_path,app_sha256,image_revision").eq("asset_key",registryKey).single();
   if(registeredError)throw registeredError;
   if(registered.asset_path!==metadata.path||registered.app_sha256!==metadata.sha256){
    const {data:changed,error:updateError}=await db.from("arcane_system_assets").update(dbMetadata(metadata)).eq("asset_key",registryKey).eq("image_revision",registered.image_revision).select("id").maybeSingle();
    if(updateError)throw updateError;
    if(!changed)throw new Error("REGISTRY_CONCURRENT_CHANGE");
   }
   let update=db.from(honorTable).update({image_asset_id:registryKey}).eq("id",target.id).eq("image_revision",expectedRevision);
   update=expectedKey===null?update.is("image_asset_id",null):update.eq("image_asset_id",expectedKey);
   const {data,error}=await update.select("image_asset_id,image_revision").maybeSingle();
   if(error)throw error;
   if(!data){
    const current=await readTarget(target);
    if(current.key===registryKey)return {key:registryKey,revision:current.revision};
    throw new Error("HONOR_TARGET_CONCURRENT_CHANGE");
   }
   const confirmed=await readTarget(target);
   if(confirmed.key!==registryKey)throw new Error("HONOR_TARGET_READBACK_MISMATCH");
   return {key:confirmed.key,revision:confirmed.revision};
  }
  const values=dbMetadata(metadata);
  if(create){
   const {error:insertError}=await db.from("arcane_system_assets").insert({id:crypto.randomUUID(),asset_key:target.id,label:target.label});
   if(insertError&&insertError.code!=="23505")throw insertError;
  }
  let query=db.from("arcane_system_assets").update(values).eq("asset_key",target.id).eq("image_revision",expectedRevision);
  query=expectedKey===null?query.is("asset_path",null):query.eq("asset_path",expectedKey);
  const {data,error}=await query.select("asset_path,image_revision").maybeSingle();
  if(error)throw error;
  if(!data){
   const current=await readTarget(target);
   if(current&&current.key===metadata.path&&current.row?.app_sha256===metadata.sha256)return {key:current.key,revision:current.revision};
   throw new Error("SYSTEM_IMAGE_CHANGED_DURING_PUBLICATION");
  }
  const confirmed=await readTarget(target);
  if(confirmed?.key!==metadata.path)throw new Error("SYSTEM_TARGET_READBACK_MISMATCH");
  return {key:confirmed.key,revision:confirmed.revision};
 }
 return {readTarget,activate};
}
