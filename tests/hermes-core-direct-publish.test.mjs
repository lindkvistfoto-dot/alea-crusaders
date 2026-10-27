import {describe,it,expect,vi} from 'vitest';
const calls=vi.hoisted(()=>[]);
vi.mock('../features/hermes-core/publish-from-drive.js',()=>({
 createArchivedSystemPublisher:({supabase,downloadOriginal})=>async args=>{
  calls.push({args,original:await downloadOriginal(),supabase});
  return {key:'published',archive:{id:args.driveFileId}};
 }
}));
import {createCoreDirectPublisher} from '../features/hermes-core/direct-publish.js';
const supabase={rpc:async()=>{},storage:{from:()=>({})}};
describe('CORE direct publication',()=>{
 it('uses archived original bytes and Drive receipt without a second download',async()=>{
  calls.length=0;
  const original=new Blob(['image'],{type:'image/png'});
  const publish=createCoreDirectPublisher({supabase});
  const result=await publish({original,driveFileId:'verified-drive-id',assetKey:'arcane-lion-badge-gold',label:'Badges Guld'});
  expect(calls).toHaveLength(1);
  expect(calls[0].original).toBe(original);
  expect(calls[0].args.assetKey).toBe('arcane-lion-badge-gold');
  expect(result.archive.id).toBe('verified-drive-id');
 });
 it('does not publish without an archived original reference',async()=>{
  calls.length=0;
  const publish=createCoreDirectPublisher({supabase});
  await expect(publish({original:new Blob(['x'],{type:'image/png'}),assetKey:'a',label:'A'})).rejects.toThrow('Verified Drive');
  expect(calls).toHaveLength(0);
 });
});
