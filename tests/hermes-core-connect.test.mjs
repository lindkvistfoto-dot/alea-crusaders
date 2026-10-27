import {describe,it,expect} from 'vitest';
import {connectHermesCore} from '../features/hermes-core/connect.js';
describe('HERMES CORE runtime integration',()=>{
 it('requires authenticated connectors',()=>{
  expect(()=>connectHermesCore({})).toThrow('Authenticated Drive');
 });
 it('connects existing Drive and Supabase transports without changing a system image on initialization',()=>{
  const calls=[];
  const supabase={
   rpc:async()=>{calls.push('rpc');return {data:null,error:null};},
   storage:{from:()=>{calls.push('storage');return {};}}
  };
  const core=connectHermesCore({
   supabase,driveUpload:async()=>{},driveGet:async()=>{},
   queueArchiveRetry:async()=>{}
  });
  expect(typeof core.add).toBe('function');
  expect(typeof core.replace).toBe('function');
  expect(typeof core.remove).toBe('function');
  expect(calls).toEqual([]);
 });
});
