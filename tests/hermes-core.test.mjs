import {describe,it,expect,vi} from 'vitest';
import {createHermesCore} from '../features/hermes-core/core.js';

function setup(fail) {
 const calls=[];
 const services={
  archiveOriginal:async()=>{calls.push('archive');if(fail==='archive')throw Error('archive failed');return {id:'drive-id'};},
  convertToWebP:async()=>{calls.push('convert');return new Blob(['webp'],{type:'image/webp'});},
  getTarget:async()=>{calls.push('read');return {revision:2};},
  publishWebP:async()=>{calls.push('publish');if(fail==='publish')throw Error('publish failed');return {key:'asset-new'};},
  setTarget:async args=>{calls.push('link');return args;}
 };
 return {core:createHermesCore(services),calls};
}
describe('HERMES CORE isolated lifecycle',()=>{
 it('archives before publishing and linking',async()=>{
  const {core,calls}=setup();
  expect((await core.add({target:'badge',file:new Blob(['original'])})).key).toBe('asset-new');
  expect(calls).toEqual(['archive','convert','read','publish','link']);
 });
 it('does not change image if archive fails',async()=>{
  const {core,calls}=setup('archive');
  await expect(core.replace({target:'badge',file:new Blob(['original'])})).rejects.toThrow('archive failed');
  expect(calls).toEqual(['archive']);
 });
 it('does not change image if publication fails',async()=>{
  const {core,calls}=setup('publish');
  await expect(core.replace({target:'badge',file:new Blob(['original'])})).rejects.toThrow('publish failed');
  expect(calls).not.toContain('link');
 });
 it('removal only detaches',async()=>{
  const {core,calls}=setup();
  expect((await core.remove({target:'badge'})).key).toBeNull();
  expect(calls).toEqual(['read','link']);
 });
});
