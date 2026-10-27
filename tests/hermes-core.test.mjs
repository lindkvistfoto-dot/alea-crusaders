import {describe,it,expect} from 'vitest';
import {createHermesCore} from '../features/hermes-core/core.js';
function setup(fail) {
 const calls=[];
 const core=createHermesCore({
  archiveOriginal:async()=>{calls.push('drive');if(fail==='drive')throw Error('Drive unavailable');return {id:'drive-id',verified:true};},
  convertToWebP:async()=>{calls.push('convert');return new Blob(['webp'],{type:'image/webp'});},
  getTarget:async()=>{calls.push('read');return {revision:2,key:'old'};},
  publishWebP:async()=>{calls.push('publish');if(fail==='publish')throw Error('Publication failed');return {key:'new',verified:true};},
  setTarget:async args=>{calls.push('link');return args;}
 });
 return {core,calls};
}
describe('HERMES CORE lifecycle',()=>{
 it('creates a previously unknown system asset without calling replace',async()=>{
  const calls=[];
  const core=createHermesCore({
   archiveOriginal:async()=>({id:'drive',verified:true}),
   convertToWebP:async()=>new Blob(['webp'],{type:'image/webp'}),
   getTarget:async()=>null,
   publishWebP:async()=>({key:'system-path',verified:true,metadata:{sha256:'a'.repeat(64)}}),
   setTarget:async()=>{calls.push('replace');},
   createTarget:async args=>{calls.push('create');return args;}
  });
  const result=await core.add({target:{kind:'system',id:'new-badge'},file:new Blob(['original'])});
  expect(calls).toEqual(['create']);
  expect(result.activation.key).toBe('system-path');
 });
 it('archives in Drive first, then publishes and activates',async()=>{
  const {core,calls}=setup();const result=await core.add({target:'badge',file:new Blob(['source'])});
  expect(result.archive.status).toBe('archived');
  expect(calls).toEqual(['drive','convert','read','publish','link']);
 });
 it('Drive archive failure stops before conversion or publication',async()=>{
  const {core,calls}=setup('drive');
  await expect(core.replace({target:'badge',file:new Blob(['source'])})).rejects.toThrow('Drive unavailable');
  expect(calls).toEqual(['drive']);
 });
 it('publication failure does not change pointer',async()=>{
  const {core,calls}=setup('publish');
  await expect(core.replace({target:'badge',file:new Blob(['source'])})).rejects.toThrow('Publication failed');
  expect(calls).not.toContain('link');
 });
 it('remove only detaches',async()=>{
  const {core,calls}=setup();const result=await core.remove({target:'badge'});
  expect(result.key).toBeNull();expect(calls).toEqual(['read','link']);
 });
});
