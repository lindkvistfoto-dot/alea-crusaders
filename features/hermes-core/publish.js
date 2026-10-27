// HERMES CORE WebP publisher: existing ALEA Storage contracts, no WASM.
export function createWebPPublisher({reserveAsset,upload,stat,bucket='hermes-alea-display'}) {
 for(const [name,fn] of Object.entries({reserveAsset,upload,stat}))
  if(typeof fn!=='function') throw new TypeError('Missing publisher adapter: '+name);
 return async function publishWebP({target,webp,archive}) {
  if(!target||webp?.type!=='image/webp'||!webp.size) throw new Error('Invalid WebP publication');
  const isSystem=target.kind==='system';
  const selectedBucket=isSystem?'alea-hermes-public':bucket;
  const asset=await reserveAsset({target,archive,bytes:webp.size,mimeType:'image/webp'});
  if(!asset?.key||!asset?.path) throw new Error('Image asset reservation failed');
  if(isSystem) {
   const prefix='hermes/system-asset/'+target.id+'/';
   if(asset.key!==asset.path||!asset.path.startsWith(prefix)||
      !/^[a-f0-9]{64}[.]webp$/.test(asset.path.slice(prefix.length)))
    throw new Error('Invalid ALEA system image path');
  }
  await upload({bucket:selectedBucket,path:asset.path,blob:webp,upsert:false});
  const info=await stat({bucket:selectedBucket,path:asset.path});
  if(Number(info?.size)!==webp.size||info?.mimeType!=='image/webp')
   throw new Error('WebP publication not verified');
  return {key:asset.key,verified:true,metadata:asset.metadata??null};
 };
}
