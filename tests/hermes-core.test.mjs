import {describe,it,expect} from 'vitest';
import {createHermesCore} from '../features/hermes-core/core.js';
function setup(fail) {
 const calls=[];
 const core=createHermesCore({
  archiveOriginal:async()=>{calls.push('drive');if(fail==='drive')throw Error('Drive unavailable');return {id:'drive-id',verified:true};},
  retainOriginal:async()=>{calls.push('retain');if(fail==='retain')throw Error('Private storage unavailable');return {id:'private-original',verified:true};},
  queueArchiveRetry:async()=>{calls.push('queue');if(fail==='queue')throw Error('Archive handoff unavailable');},
  convertToWebP:async()=>{calls.push('convert');return new Blob(['webp'],{type:'image/webp'});},
  getTarget:async()=>{calls.push('read');return {revision:2,key:'old'};},
  publishWebP:async()=>{calls.push('publish');if(fail==='publish')throw Error('Publication failed');return {key:'new',verified:true};},
  setTarget:async args=>{calls.push('link');return args;}
 });
 return {core,calls};
}
describe('HERMES CORE lifecycle',()=>{
 it('archives in Drive first, then publishes and activates',async()=>{
  const {core,calls}=setup();const result=await core.add({target:'badge',file:new Blob(['source'])});
  expect(result.archive.status).toBe('archived');
  expect(calls).toEqual(['drive','convert','read','publish','link']);
 });
 it('Drive failure falls back to private storage and Actions before activation',async()=>{
  const {core,calls}=setup('drive');const result=await core.replace({target:'badge',file:new Blob(['source'])});
  expect(result.archive.status).toBe('pending');
  expect(calls).toEqual(['drive','retain','queue','convert','read','publish','link']);
 });
 it('both archive paths failing leaves image unchanged',async()=>{
  const {core,calls}=setup('retain'); // simulate Drive failure explicitly below
  const failing=createHermesCore({
   archiveOriginal:async()=>{throw Error('Drive down');},
   retainOriginal:async()=>{throw Error('Private down');},
   queueArchiveRetry:async()=>{},convertToWebP:async()=>{},getTarget:async()=>{},
   publishWebP:async()=>{},setTarget:async()=>{calls.push('link');}
  });
  await expect(failing.add({target:'badge',file:new Blob(['source'])})).rejects.toThrow('Private down');
  expect(calls).not.toContain('link');
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
