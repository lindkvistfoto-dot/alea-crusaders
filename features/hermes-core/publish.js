// HERMES CORE WebP publisher. Binary upload and metadata read use existing
// Supabase Storage adapters; no WASM, Edge Function, or HERMES 4 queue.
export function createWebPPublisher({upload,stat,bucket='hermes-alea-display'}) {
 if(typeof upload!=='function'||typeof stat!=='function') throw new TypeError('Storage adapters required');
 return async function publishWebP({target,webp}) {
  if(!target||webp?.type!=='image/webp'||!webp.size) throw new Error('Invalid WebP publication');
  const id=crypto.randomUUID();
  const path='core/'+id+'.webp';
  await upload({bucket,path,blob:webp,upsert:false});
  const info=await stat({bucket,path});
  if(Number(info?.size)!==webp.size || info?.mimeType!=='image/webp')
   throw new Error('WebP publication not verified');
  return {key:bucket+'/'+path,verified:true};
 };
}
