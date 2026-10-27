// HERMES CORE adapter for the guarded system-image RPCs.
// Uses existing Supabase RPC transport; no direct table updates.
export function createSystemImageRpcAdapter({rpc}) {
 if(typeof rpc!=='function') throw new TypeError('Supabase RPC required');
 return {
  readSystem:async id=>{
   const row=await rpc('hermes_core_system_image_read',{p_asset_key:id});
   return {key:row.key??null,revision:Number(row.revision)};
  },
  writeSystem:async ({id,expectedRevision,expectedKey,key,metadata})=>{
   const data=key===null?{}:metadata;
   if(key!==null && (!data?.sha256||!data?.bytes||!data?.width||!data?.height||
      typeof data.alphaPreserved!=='boolean')) throw new Error('Verified image metadata required');
   if(key!==null && (typeof key!=='string' || !new RegExp('^hermes/system-asset/'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\if(key!==null && !/^trophy\/[a-f0-9-]{36}[.]webp$/i.test(key)) throw new Error('Invalid system WebP path');')+'/[a-f0-9]{64}[.]webp
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
).test(key))) throw new Error('Invalid system WebP path');
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
