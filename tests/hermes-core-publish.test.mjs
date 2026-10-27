import {describe,it,expect,vi} from 'vitest';
vi.mock('../features/hermes-core/image-metadata.js',()=>({inspectCoreWebP:async webp=>({sha256:'a'.repeat(64),bytes:webp.size,width:1,height:1,alphaPreserved:true})}));
import {createWebPPublisher} from '../features/hermes-core/publish.js';
const webp=new Blob(['webp'],{type:'image/webp'});
describe('HERMES CORE Supabase publisher',()=>{
 it('uses reserved ALEA key and verifies binary upload before returning success',async()=>{
  const calls=[];
  const publish=createWebPPublisher({
   reserveAsset:async()=>({key:'hermes-alea:00000000-0000-4000-8000-000000000001',path:'trophy/00000000-0000-4000-8000-000000000001.webp'}),
   upload:async({blob,upsert})=>{calls.push('upload');expect(blob).toBe(webp);expect(upsert).toBe(false);},
   stat:async()=>{calls.push('stat');return {size:String(webp.size),mimeType:'image/webp'};}
  });
  const result=await publish({target:{id:'target'},webp});
  expect(result.verified).toBe(true);
  expect(result.key).toMatch(/^hermes-alea:/);
  expect(calls).toEqual(['upload','stat']);
 });
 it('routes system images to existing ALEA public bucket',async()=>{
  const key='hermes/system-asset/arcane-lion-badge-gold/'+ 'a'.repeat(64)+'.webp';
  const buckets=[];
  const publish=createWebPPublisher({
   reserveAsset:async()=>({key,path:key,metadata:{sha256:'a'.repeat(64),bytes:webp.size,width:1,height:1,alphaPreserved:true}}),
   upload:async({bucket})=>{buckets.push(bucket);},
   stat:async({bucket})=>{buckets.push(bucket);return {size:webp.size,mimeType:'image/webp'};}
  });
  const result=await publish({target:{kind:'system',id:'arcane-lion-badge-gold'},webp});
  expect(buckets).toEqual(['alea-hermes-public','alea-hermes-public']);
  expect(result.key).toBe(key);
 });
 it('does not report success if storage metadata differs',async()=>{
  const publish=createWebPPublisher({
   reserveAsset:async()=>({key:'key',path:'trophy/a.webp'}),
   upload:async()=>{},stat:async()=>({size:999,mimeType:'image/webp'})
  });
  await expect(publish({target:'badge',webp})).rejects.toThrow('not verified');
 });
});
