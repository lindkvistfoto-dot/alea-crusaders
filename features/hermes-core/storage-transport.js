// HERMES CORE binary Storage transport. Uses an already authenticated Supabase client.
// Never embed a service-role key or use SQL for file bytes.
export function createCoreStorageTransport({supabase}) {
 if(!supabase?.storage?.from) throw new TypeError('Authenticated Supabase Storage client required');
 return {
  async upload({bucket,path,blob,upsert=false}) {
   if(!bucket||!path||!blob?.size) throw new Error('Storage upload requires binary file');
   const {error}=await supabase.storage.from(bucket).upload(path,blob,{
    contentType:blob.type,upsert,cacheControl:'3600'
   });
   if(error) throw error;
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
