import {it,expect} from 'vitest';
import profiles from '../config/hermes-system-assets.json';
import {database,run,sha,raw} from './helpers/hermes-publisher-harness.mjs';

const rows=()=>Object.entries(profiles.assets).map(([key,def])=>({id:def.id,asset_key:key,label:def.label,
 asset_path:null,app_sha256:null,app_bytes:null,width:null,height:null,alpha_preserved:null}));
const assets=()=>rows().map((row,i)=>({kind:'system-asset',target_key:row.asset_key,target_id:row.id,
 batch_index:i,archive_verified:true,archive_file_id:'archive-system-'+i,source_path:'drive://archive-system-'+i,
 source_sha256:String(i+1).repeat(64),source_bytes:1024,app_sha256:sha,
 app_file:`system-asset/${row.asset_key}/${sha}.webp`,app_bytes:raw.length,
 width:profiles.assets[row.asset_key].display_size[0],height:profiles.assets[row.asset_key].display_size[1],alpha_preserved:true}));

it('activates two system pointers through existing jobs, public Storage readback and idempotent retry',async()=>{
 const state=database({systemRows:rows()});const input=assets();
 // Harness bytes are the simulated output of the separately tested converter.
 const first=await run(state,{assets:input});expect(first.error).toBeUndefined();
 expect(first.report.items.map(x=>x.status)).toEqual(['active','active']);
 expect(state.jobs.size).toBe(2);
 expect(state.calls.uploads.every(x=>x.bucket==='alea-hermes-public'&&!x.upsert)).toBe(true);
 for(const a of input){const row=state.targets.get(a.target_id);
  expect(row.asset_path).toBe('hermes/'+a.app_file);expect(row.app_sha256).toBe(sha);
  expect(row.width).toBe(a.width);expect(row.alpha_preserved).toBe(true);
 }
 const retry=await run(state,{assets:input});expect(retry.error).toBeUndefined();
 expect(retry.report.items.every(x=>x.status==='already_active')).toBe(true);
 expect(state.calls.uploads).toHaveLength(2);expect(state.calls.targetWrites).toHaveLength(2);
});

it('rejects wrong keys, UUID, dimensions, alpha or missing batch archive before upload',async()=>{
 for(const patch of [{target_key:'other'},{target_id:rows()[1].id},{width:640},{alpha_preserved:false},{archive_verified:false}]){
  const state=database({systemRows:rows()});const a={...assets()[0],...patch};
  const result=await run(state,{assets:[a]});expect(result.error).toBeDefined();expect(state.calls.uploads).toEqual([]);
 }
});

it('pilot stores WebP without creating jobs or making rows visible',async()=>{
 const state=database({systemRows:rows()});const input=assets();
 const result=await run(state,{assets:input,mode:'pilot'});expect(result.error).toBeUndefined();
 expect(result.report.items.every(x=>x.status==='pilot_verified')).toBe(true);
 expect(state.jobs.size).toBe(0);expect(state.calls.targetWrites).toEqual([]);
});

it('corrupt upload or post-activation read failure cannot leave a published pointer',async()=>{
 for(const option of [{corruptId:rows()[0].asset_key},{postReadFailureId:rows()[0].id}]){
  const state=database({systemRows:rows(),...option});const input=assets();
   const result=await run(state,{assets:input});expect(result.error).toBeDefined();
  const failed=state.targets.get(rows()[0].id);expect(failed.asset_path).toBeNull();expect(failed.app_sha256).toBeNull();
  expect(state.targets.get(rows()[1].id).asset_path).toBeTruthy();
 }
});
