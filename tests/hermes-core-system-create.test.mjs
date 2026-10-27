import {describe,it,expect} from 'vitest';
import {createSystemImageCreator} from '../features/hermes-core/system-create.js';
describe('HERMES CORE system image CREATE',()=>{
 it('registers a new gold lion badge frame using verified image metadata',async()=>{
  const sha='a'.repeat(64);let name,args;
  const create=createSystemImageCreator({rpc:async(n,a)=>{name=n;args=a;return {asset_key:a.p_asset_key,revision:1};}});
  const result=await create({id:'arcane-lion-badge-gold',label:'Badges – Guld',path:'hermes/system-asset/arcane-lion-badge-gold/'+sha+'.webp',metadata:{sha256:sha,bytes:100,width:724,height:724,alphaPreserved:true}});
  expect(name).toBe('hermes_core_system_image_create');
  expect(args.p_asset_key).toBe('arcane-lion-badge-gold');
  expect(result.revision).toBe(1);
 });
 it('rejects a path not matching the asset identity',async()=>{
  const create=createSystemImageCreator({rpc:async()=>{throw Error('must not call');}});
  await expect(create({id:'arcane-lion-badge-gold',label:'Gold',path:'wrong.webp',metadata:{sha256:'a'.repeat(64)}})).rejects.toThrow('Invalid system image path');
 });
});
