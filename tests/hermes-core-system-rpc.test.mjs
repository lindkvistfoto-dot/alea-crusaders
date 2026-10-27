import {describe,it,expect} from 'vitest';
import {createSystemImageRpcAdapter} from '../features/hermes-core/system-rpc.js';
const path='trophy/00000000-0000-4000-8000-000000000001.webp';
describe('HERMES CORE system image RPC',()=>{
 it('uses existing asset key and forwards verified metadata',async()=>{
  const calls=[];
  const adapter=createSystemImageRpcAdapter({rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='hermes_core_system_image_read')return {key:null,revision:0};
   return {key:path,revision:1};
  }});
  expect(await adapter.readSystem('arcane-lion-badge-gold')).toEqual({key:null,revision:0});
  const result=await adapter.writeSystem({id:'arcane-lion-badge-gold',expectedRevision:0,expectedKey:null,key:path,metadata:{sha256:'a'.repeat(64),bytes:20,width:32,height:32,alphaPreserved:true}});
  expect(result).toEqual({key:path,revision:1});
  expect(calls[1].args.p_new_path).toBe(path);
  expect(calls[1].args.p_bytes).toBe(20);
 });
 it('does not call RPC when metadata is missing',async()=>{
  let called=false;
  const adapter=createSystemImageRpcAdapter({rpc:async()=>{called=true;}});
  await expect(adapter.writeSystem({id:'badge',expectedRevision:0,expectedKey:null,key:path})).rejects.toThrow('Verified image metadata required');
  expect(called).toBe(false);
 });
 it('removes image by detaching pointer',async()=>{
  const adapter=createSystemImageRpcAdapter({rpc:async()=>({key:null,revision:2})});
  expect((await adapter.writeSystem({id:'badge',expectedRevision:1,expectedKey:path,key:null})).key).toBeNull();
 });
});
