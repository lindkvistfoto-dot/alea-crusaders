import {describe,it,expect} from 'vitest';
import {createTrophyTargetAdapter} from '../features/hermes-core/target-adapter.js';
describe('Troferummet target adapter isolation',()=>{
 it('routes system images separately from Honors',async()=>{
  const calls=[];
  const adapter=createTrophyTargetAdapter({
   readHonor:async()=>{calls.push('honor-read');return {revision:0,key:null};},
   writeHonor:async()=>{calls.push('honor-write');},
   readSystem:async()=>{calls.push('system-read');return {revision:1,key:'old'};},
   writeSystem:async args=>{calls.push('system-write');return args;}
  });
  const target={kind:'system',id:'arcane-lion-badge-gold'};
  expect((await adapter.getTarget(target)).key).toBe('old');
  expect((await adapter.setTarget({target,expectedRevision:1,expectedKey:'old',key:'new'})).key).toBe('new');
  expect(calls).toEqual(['system-read','system-write']);
 });
 it('rejects unknown target types',async()=>{
  const adapter=createTrophyTargetAdapter({readHonor:async()=>{},writeHonor:async()=>{},readSystem:async()=>{},writeSystem:async()=>{}});
  await expect(adapter.getTarget({kind:'arbitrary',id:'x'})).rejects.toThrow('Unsupported');
 });
});
