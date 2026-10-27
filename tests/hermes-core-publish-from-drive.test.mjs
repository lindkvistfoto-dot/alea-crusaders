import {describe,it,expect,vi} from 'vitest';
const calls=vi.hoisted(()=>[]);
vi.mock('../features/hermes-core/webp.js',()=>({
 convertCoreImageToWebP:async()=>{calls.push('convert');return new Blob(['webp'],{type:'image/webp'});}
}));
vi.mock('../features/hermes-core/storage-transport.js',()=>({
 createCoreStorageTransport:()=>({upload:async()=>{},stat:async()=>({size:4,mimeType:'image/webp'})})
}));
vi.mock('../features/hermes-core/publish.js',()=>({
 createWebPPublisher:()=>async()=>{calls.push('publish');return {
  key:'hermes/system-asset/arcane-lion-badge-gold/'+ 'a'.repeat(64)+'.webp',
  verified:true,metadata:{sha256:'a'.repeat(64),bytes:4,width:724,height:724,alphaPreserved:true}
 };}
}));
import {createArchivedSystemPublisher} from '../features/hermes-core/publish-from-drive.js';
const original=new Blob(['original'],{type:'image/png'});
function client(existing=false) {
 return {storage:{from:()=>({})},rpc:async(name,args)=>{
  calls.push(name);
  if(name==='hermes_core_system_image_read') {
   return existing?{data:{key:'old',revision:2},error:null}:
    {data:null,error:{message:'UNKNOWN_SYSTEM_ASSET'}};
  }
  return {data:{key:args.p_path??args.p_new_path,revision:existing?3:1},error:null};
 }};
}
describe('HERMES CORE publish existing Drive original',()=>{
 it('CREATE uses already archived PNG and activates only after publication',async()=>{
  calls.length=0;
  const publish=createArchivedSystemPublisher({
   supabase:client(),downloadOriginal:async()=>{calls.push('drive-download');return original;}
  });
  const result=await publish({driveFileId:'drive-id',assetKey:'arcane-lion-badge-gold',label:'Badges – Guld'});
  expect(result.archive.id).toBe('drive-id');
  expect(calls).toEqual(['drive-download','convert','hermes_core_system_image_read','publish','hermes_core_system_image_create']);
 });
 it('REPLACE preserves revision comparison',async()=>{
  calls.length=0;
  const publish=createArchivedSystemPublisher({supabase:client(true),downloadOriginal:async()=>original});
  await publish({driveFileId:'drive-id',assetKey:'arcane-lion-badge-gold',label:'Badges – Guld'});
  expect(calls.at(-1)).toBe('hermes_core_system_image_set');
 });
 it('missing Drive file never activates',async()=>{
  calls.length=0;
  const publish=createArchivedSystemPublisher({supabase:client(),downloadOriginal:async()=>null});
  await expect(publish({driveFileId:'drive-id',assetKey:'arcane-lion-badge-gold',label:'Gold'})).rejects.toThrow('Drive original unavailable');
  expect(calls).toEqual([]);
 });
});
