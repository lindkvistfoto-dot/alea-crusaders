// HERMES CORE system image RPC adapter. Existing ALEA public storage layout.
export function createSystemImageRpcAdapter({rpc}) {
 if(typeof rpc!=='function') throw new TypeError('Supabase RPC required');
 return {
  readSystem:async id=>{
   try {
    const row=await rpc('hermes_core_system_image_read',{p_asset_key:id});
    return {key:row.key??null,revision:Number(row.revision)};
   } catch(error) {
    if(error?.message==='UNKNOWN_SYSTEM_ASSET'||error?.code==='UNKNOWN_SYSTEM_ASSET') return null;
    throw error;
   }
  },
  writeSystem:async ({id,expectedRevision,expectedKey,key,metadata})=>{
   const data=key===null?{}:metadata;
   if(key!==null && (!data?.sha256||!data?.bytes||!data?.width||!data?.height||
      typeof data.alphaPreserved!=='boolean')) throw new Error('Verified image metadata required');
   if(typeof id!=='string'||!/^[a-z0-9][a-z0-9_.-]*$/.test(id))
    throw new Error('Invalid system asset key');
   if(key!==null && (typeof key!=='string' ||
      !key.startsWith('hermes/system-asset/'+id+'/') ||
      !/^[a-f0-9]{64}[.]webp$/.test(key.slice(('hermes/system-asset/'+id+'/').length))))
    throw new Error('Invalid system WebP path');
   const row=await rpc('hermes_core_system_image_set',{
    p_asset_key:id,p_expected_revision:expectedRevision,p_expected_path:expectedKey,
    p_new_path:key,p_sha256:data.sha256??null,p_bytes:data.bytes??null,
    p_width:data.width??null,p_height:data.height??null,
    p_alpha_preserved:data.alphaPreserved??null
   });
   return {key:row.key??null,revision:Number(row.revision)};
  }
 };
}
