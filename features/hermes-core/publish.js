// HERMES CORE WebP publisher. Supabase Storage upload is binary.
// Asset registration must use the existing ALEA image resolver contract.
export function createWebPPublisher({reserveAsset,upload,stat,bucket='hermes-alea-display'}) {
 for(const [name,fn] of Object.entries({reserveAsset,upload,stat}))
  if(typeof fn!=='function') throw new TypeError('Missing publisher adapter: '+name);
 return async function publishWebP({target,webp,archive}) {
  if(!target||webp?.type!=='image/webp'||!webp.size) throw new Error('Invalid WebP publication');
  const asset=await reserveAsset({target,archive,bytes:webp.size,mimeType:'image/webp'});
  if(!asset?.key||!asset?.path) throw new Error('Image asset reservation failed');
  await upload({bucket,path:asset.path,blob:webp,upsert:false});
  const info=await stat({bucket,path:asset.path});
  if(Number(info?.size)!==webp.size||info?.mimeType!=='image/webp')
   throw new Error('WebP publication not verified');
  return {key:asset.key,verified:true,metadata:asset.metadata??null};
 };
}
