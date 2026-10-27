// HERMES CORE: authenticated binary Storage transport with verified readback.
// Adapted from the proven HERMES publisher; caller supplies authenticated client.
async function sha256(blob) {
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}
export function createCoreStorageTransport({supabase}) {
 if(!supabase?.storage?.from) throw new TypeError('Authenticated Supabase Storage client required');
 return {
  async upload({bucket,path,blob,upsert=false}) {
   if(!bucket||!path||!blob?.size) throw new Error('Storage upload requires binary file');
   const client=supabase.storage.from(bucket);
   const expected=await sha256(blob);
   const {error}=await client.upload(path,blob,{
    contentType:blob.type,upsert,cacheControl:'31536000'
   });
   if(error && !(!upsert && /already exists|duplicate|409|resource already/i.test(error.message||'')))
    throw error;
   const {data, error:readError}=await client.download(path);
   if(readError||!data) throw readError||new Error('Storage readback failed');
   if(await sha256(data)!==expected) throw new Error('Storage SHA-256 mismatch');
   if(bucket==='alea-hermes-public') {
    const publicUrl=client.getPublicUrl(path)?.data?.publicUrl;
    if(!publicUrl) throw new Error('Public image URL unavailable');
    const response=await fetch(publicUrl,{cache:'no-store'});
    if(!response.ok) throw new Error('Public image unavailable');
    if(await sha256(await response.blob())!==expected) throw new Error('Public image SHA-256 mismatch');
   }
  },
  async stat({bucket,path}) {
   if(!bucket||!path) throw new Error('Storage object path required');
   const {data,error}=await supabase.storage.from(bucket).info(path);
   if(error) throw error;
   const size=Number(data?.size??data?.metadata?.size);
   const mimeType=data?.mimetype??data?.metadata?.mimetype;
   if(!Number.isFinite(size)||!mimeType) throw new Error('Storage object metadata unavailable');
   return {size,mimeType};
  }
 };
}
