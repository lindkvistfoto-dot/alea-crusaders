import {inspectCoreWebP} from './image-metadata.js';
// HERMES CORE WebP publisher: uses the ALEA public asset bucket for shared
// developer images. User-owned Honors uploads stay in HERMES ALEA.
export function createWebPPublisher({reserveAsset,upload,stat,bucket='alea-hermes-public'}) {
 for(const [name,fn] of Object.entries({reserveAsset,upload,stat}))
  if(typeof fn!=='function') throw new TypeError('Missing publisher adapter: '+name);
 return async function publishWebP({target,webp,archive}) {
  if(!target||webp?.type!=='image/webp'||!webp.size) throw new Error('Invalid WebP publication');
  const isSystem=target.kind==='system';
  const selectedBucket=isSystem?'alea-hermes-public':bucket;
  const metadata=isSystem?await inspectCoreWebP(webp):null;
  const asset=await reserveAsset({target,archive,bytes:webp.size,mimeType:'image/webp',metadata});
  if(!asset?.key||!asset?.path) throw new Error('Image asset reservation failed');
  if(isSystem) {
   const prefix='hermes/system-asset/'+target.id+'/';
   if(metadata.sha256!==asset.path.slice(prefix.length,-5)) throw new Error('System image digest mismatch');
   if(asset.key!==asset.path||!asset.path.startsWith(prefix)||
      !/^[a-f0-9]{64}[.]webp$/.test(asset.path.slice(prefix.length)))
    throw new Error('Invalid ALEA system image path');
  }
  await upload({bucket:selectedBucket,path:asset.path,blob:webp,upsert:false});
  const info=await stat({bucket:selectedBucket,path:asset.path});
  if(Number(info?.size)!==webp.size||info?.mimeType!=='image/webp')
   throw new Error('WebP publication not verified');
  return {key:asset.key,verified:true,metadata:metadata??asset.metadata??null};
 };
}
