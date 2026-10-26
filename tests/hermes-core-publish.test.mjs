import {describe,it,expect} from 'vitest';
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
 it('does not report success if storage metadata differs',async()=>{
  const publish=createWebPPublisher({
   reserveAsset:async()=>({key:'key',path:'trophy/a.webp'}),
   upload:async()=>{},stat:async()=>({size:999,mimeType:'image/webp'})
  });
  await expect(publish({target:'badge',webp})).rejects.toThrow('not verified');
 });
});
