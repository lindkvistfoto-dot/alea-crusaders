// HERMES CORE storage adapter: uses an existing private originals bucket.
// The caller supplies authenticated binary upload and metadata read functions.
export function createOriginalRetention({upload,stat,bucket='hermes-alea-originals'}) {
 if(typeof upload!=='function'||typeof stat!=='function') throw new TypeError('Storage adapters required');
 return async function retainOriginal(file) {
  if(!file?.size) throw new Error('Original missing');
  const id=crypto.randomUUID();
  const path='core/'+id+'/original';
  await upload({bucket,path,blob:file,upsert:false});
  const info=await stat({bucket,path});
  if(Number(info?.size)!==file.size || info?.mimeType!==file.type)
   throw new Error('Original retention not verified');
  return {id:path,verified:true};
 };
}
