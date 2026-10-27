import {describe,it,expect,vi} from 'vitest';
import {createCoreStorageTransport} from '../features/hermes-core/storage-transport.js';
import {createCoreSystemReservation} from '../features/hermes-core/system-reservation.js';
describe('CORE verified binary Storage',()=>{
 it('uploads and verifies WebP bytes by Storage readback and public URL',async()=>{
  const blob=new Blob(['webp'],{type:'image/webp'});
  const calls=[];
  const client={
   upload:async(path,data,opts)=>{calls.push('upload');expect(data).toBe(blob);expect(opts.upsert).toBe(false);return {error:null};},
   download:async()=>{calls.push('download');return {data:blob,error:null};},
   getPublicUrl:()=>({data:{publicUrl:'https://example.invalid/image.webp'}}),
   info:async()=>({data:{size:blob.size,mimetype:'image/webp'},error:null})
  };
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,blob:async()=>blob});
  try {
   const transport=createCoreStorageTransport({supabase:{storage:{from:()=>client}}});
   await transport.upload({bucket:'alea-hermes-public',path:'image.webp',blob});
   expect(calls).toEqual(['upload','download']);
   expect(fetcher).toHaveBeenCalledOnce();
   expect(await transport.stat({bucket:'alea-hermes-public',path:'image.webp'})).toEqual({size:blob.size,mimeType:'image/webp'});
  } finally {fetcher.mockRestore();}
 });
 it('rejects changed bytes on readback',async()=>{
  const transport=createCoreStorageTransport({supabase:{storage:{from:()=>({
   upload:async()=>({error:null}),download:async()=>({data:new Blob(['changed']),error:null})
  })}}});
  await expect(transport.upload({bucket:'alea-hermes-public',path:'image.webp',blob:new Blob(['original'],{type:'image/webp'})})).rejects.toThrow('SHA-256 mismatch');
 });
 it('propagates Storage errors',async()=>{
  const transport=createCoreStorageTransport({supabase:{storage:{from:()=>({upload:async()=>({error:new Error('Storage denied')})})}}});
  await expect(transport.upload({bucket:'b',path:'p',blob:new Blob(['x'])})).rejects.toThrow('Storage denied');
 });
 it('reserves correct path from actual digest',async()=>{
  const sha='b'.repeat(64);
  const asset=await createCoreSystemReservation()({target:{kind:'system',id:'arcane-lion-badge-gold'},metadata:{sha256:sha}});
  expect(asset.path).toBe('hermes/system-asset/arcane-lion-badge-gold/'+sha+'.webp');
 });
});
