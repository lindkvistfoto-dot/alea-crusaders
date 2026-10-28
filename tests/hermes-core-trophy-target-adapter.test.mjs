import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createTrophyTargetAdapter} from '../features/hermes-core/trophy-target-adapter.js';
const id='6a67121d-67ee-4943-82a3-83a15334d815';
const image='2ab9aa61-4b89-4d7f-8905-19ce644d9121';
const target={kind:'honor-relief',id,material:'enamel'};
test('honor relief uses existing registry and revision-checked activation',async()=>{
 const calls=[];
 const adapter=createTrophyTargetAdapter({
  readRow:async({table})=>{calls.push(table);return {material:'enamel',image_asset_id:null,image_revision:2}},
  registerImage:async({storagePath})=>{calls.push(storagePath);return image},
  compareAndSwap:async(args)=>{calls.push(args);return {updated:true,revision:3}}
 });
 const result=await adapter.write({target,expectedRevision:2,expectedKey:null,key:'hermes/trophy/hash.webp',metadata:{}});
 assert.deepEqual(result,{key:image,revision:3});
 assert.equal(calls[0],'honor_relief_variants');
 assert.equal(calls[2].expectedRevision,2);
 assert.equal(calls[2].imageId,image);
});
test('stale revision never registers image',async()=>{
 let registered=false;
 const adapter=createTrophyTargetAdapter({
  readRow:async()=>({material:'enamel',image_asset_id:null,image_revision:3}),
  registerImage:async()=>{registered=true;return image},
  compareAndSwap:async()=>({updated:true})
 });
 await assert.rejects(adapter.write({target,expectedRevision:2,expectedKey:null,key:'x'}),/CHANGED/);
 assert.equal(registered,false);
});
test('unknown targets and material mismatch fail closed',async()=>{
 const adapter=createTrophyTargetAdapter({
  readRow:async()=>({material:'other',image_revision:0}),
  registerImage:async()=>image,compareAndSwap:async()=>({updated:true})
 });
 await assert.rejects(adapter.read(target),/MATERIAL_MISMATCH/);
 await assert.rejects(adapter.read({kind:'other',id}),/INVALID_TROPHY_TARGET/);
});
test('invalid registry response cannot activate target',async()=>{
 let activated=false;
 const adapter=createTrophyTargetAdapter({
  readRow:async()=>({material:'enamel',image_asset_id:null,image_revision:0}),
  registerImage:async()=> 'hermes/path.webp',
  compareAndSwap:async()=>{activated=true;return {updated:true}}
 });
 await assert.rejects(adapter.write({target,expectedRevision:0,expectedKey:null,key:'x'}),/INVALID_REGISTERED_IMAGE_ID/);
 assert.equal(activated,false);
});
