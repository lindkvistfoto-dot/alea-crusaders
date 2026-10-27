import {describe,it,expect,vi} from 'vitest';
import {createCoreStorageTransport} from '../features/hermes-core/storage-transport.js';
import {createCoreSystemReservation} from '../features/hermes-core/system-reservation.js';
describe('CORE binary Storage integration',()=>{
 it('uploads raw Blob to authorized Storage and reads metadata',async()=>{
  const blob=new Blob(['webp'],{type:'image/webp'});const calls=[];
  const supabase={storage:{from:bucket=>({
   upload:async(path,data,opts)=>{calls.push({bucket,path,data,opts});return {error:null};},
   info:async()=>({data:{size:blob.size,mimetype:'image/webp'},error:null})
  })}};
  const transport=createCoreStorageTransport({supabase});
  await transport.upload({bucket:'alea-hermes-public',path:'test.webp',blob});
  expect(calls[0].data).toBe(blob);
  expect(calls[0].opts.upsert).toBe(false);
  expect(await transport.stat({bucket:'alea-hermes-public',path:'test.webp'})).toEqual({size:blob.size,mimeType:'image/webp'});
 });
 it('propagates Storage upload failures',async()=>{
  const transport=createCoreStorageTransport({supabase:{storage:{from:()=>({upload:async()=>({error:new Error('Storage denied')})})}}});
  await expect(transport.upload({bucket:'b',path:'p',blob:new Blob(['x'])})).rejects.toThrow('Storage denied');
 });
 it('reserves correct path from actual digest without an extra registry',async()=>{
  const sha='b'.repeat(64);
  const asset=await createCoreSystemReservation()({target:{kind:'system',id:'arcane-lion-badge-gold'},metadata:{sha256:sha}});
  expect(asset.path).toBe('hermes/system-asset/arcane-lion-badge-gold/'+sha+'.webp');
 });
});
