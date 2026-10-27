// HERMES CORE CREATE adapter: registers a newly uploaded WebP system asset.
export function createSystemImageCreator({rpc}) {
 if(typeof rpc!=='function') throw new TypeError('Supabase RPC required');
 return async function create({id,label,path,metadata}) {
  if(!id||!label||!path||!metadata) throw new Error('System image metadata required');
  const {sha256,bytes,width,height,alphaPreserved}=metadata;
  if(!/^[a-f0-9]{64}$/.test(sha256||'')||
     path!=='hermes/system-asset/'+id+'/'+sha256+'.webp')
   throw new Error('Invalid system image path');
  return rpc('hermes_core_system_image_create',{
   p_asset_key:id,p_label:label,p_path:path,p_sha256:sha256,
   p_bytes:bytes,p_width:width,p_height:height,p_alpha_preserved:alphaPreserved
  });
 };
}
