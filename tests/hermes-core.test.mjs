import {describe,it,expect} from 'vitest';
import {createHermesCore} from '../features/hermes-core/core.js';
function setup(fail) {
 const calls=[];
 const core=createHermesCore({
  archiveOriginal:async()=>{calls.push('archive');if(fail==='archive')throw Error('Drive unavailable');return {id:'drive-id',verified:true};},
  convertToWebP:async()=>{calls.push('convert');return new Blob(['webp'],{type:'image/webp'});},
  getTarget:async()=>{calls.push('read');return {revision:2,key:'old'};},
  publishWebP:async()=>{calls.push('publish');if(fail==='publish')throw Error('Supabase unavailable');return {key:'new',verified:true};},
  setTarget:async args=>{calls.push('link');return args;}
 });
 return {core,calls};
}
describe('HERMES CORE lifecycle',()=>{
 it('activates then archives',async()=>{
  const {core,calls}=setup();const result=await core.add({target:'badge',file:new Blob(['source'])});
  expect(result.activation.key).toBe('new');expect(result.archive.status).toBe('archived');
  expect(calls).toEqual(['convert','read','publish','link','archive']);
 });
 it('archive failure does not roll back active image',async()=>{
  const {core,calls}=setup('archive');const result=await core.replace({target:'badge',file:new Blob(['source'])});
  expect(result.activation.key).toBe('new');expect(result.archive.status).toBe('pending');
  expect(calls).toEqual(['convert','read','publish','link','archive']);
 });
 it('publication failure leaves image unchanged',async()=>{
  const {core,calls}=setup('publish');
  await expect(core.replace({target:'badge',file:new Blob(['source'])})).rejects.toThrow('Supabase unavailable');
  expect(calls).not.toContain('link');expect(calls).not.toContain('archive');
 });
 it('remove only detaches',async()=>{
  const {core,calls}=setup();const result=await core.remove({target:'badge'});
  expect(result.key).toBeNull();expect(calls).toEqual(['read','link']);
 });
});
