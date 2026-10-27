import {describe,it,expect} from 'vitest';
import {connectHermesCore} from '../features/hermes-core/connect.js';
describe('CORE ALEA-wide target routing',()=>{
 const supabase={rpc:async()=>({data:null,error:null}),storage:{from:()=>({})}};
 const base={supabase,driveUpload:async()=>{},driveGet:async()=>{}};
 it('accepts authorized target adapters without restricting categories to Trophy Room',()=>{
  const core=connectHermesCore({...base,targets:{
   read:async target=>({revision:0,key:target.id}),
   write:async args=>args,
   create:async args=>args,
   reserveAsset:async()=>({key:'asset',path:'asset'})
  }});
  expect(typeof core.add).toBe('function');
  expect(typeof core.replace).toBe('function');
  expect(typeof core.remove).toBe('function');
 });
 it('does not write arbitrary target without a configured adapter',async()=>{
  const core=connectHermesCore(base);
  await expect(core.remove({target:{kind:'map',id:'map-1'}})).rejects.toThrow('Target adapter not configured');
 });
});
