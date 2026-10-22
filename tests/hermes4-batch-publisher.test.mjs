import {it, expect} from 'vitest';
import {database,run,asset,id} from './helpers/hermes-publisher-harness.mjs';

it('publishes five cutouts with one client, private readbacks and only the five cutout fields',async()=>{
  const state=database();const {error,report}=await run(state);
  expect(error).toBeUndefined();expect(state.calls.clients).toBe(1);
  expect(report.items.map(i=>i.status)).toEqual(Array(5).fill('active'));
  expect(report.source_bucket_empty).toBe(true);expect(state.calls.sourceChecks).toBe(2);
  expect(state.calls.uploads).toHaveLength(5);expect(state.calls.deliveries).toBe(5);
  expect(state.calls.uploads.every(u=>u.bucket==='alea-spell-art'&&u.mime==='image/webp'&&!u.upsert)).toBe(true);
  expect(state.calls.targetWrites).toHaveLength(5);
  for(const target of state.targets.values()){
    expect(target.cutout_path).toMatch(new RegExp('^spell/'+target.id+'/[a-f0-9-]+\\.webp$'));
    expect(target.icon_path).toBe('icon.webp');expect(target.illustration_path).toBe('square.webp');
  }
});

it('isolates one failed upload and a failed-only retry leaves all four successes untouched',async()=>{
  const state=database({failId:id(2)});
  const first=await run(state);expect(first.error).toBeDefined();
  expect(first.report.items.map(i=>i.status)).toEqual(['active','active','failed','active','active']);
  expect(state.targets.get(id(2)).cutout_path).toBeNull();
  const successfulPaths=[0,1,3,4].map(i=>state.targets.get(id(i)).cutout_path);
  // Clear the simulated outage while retaining the real job and storage state.
  const original=state.db.storage.from;
  state.db.storage.from=bucket=>{
    const client=original(bucket);
    client.upload=async(path,blob,options)=>{
      state.calls.uploads.push({bucket,path,mime:blob.type,upsert:options.upsert});
      state.storage.set(bucket+'/'+path,new Uint8Array(await blob.arrayBuffer()));return {error:null};
    };
    return client;
  };
  const before=state.calls.uploads.length;
  const retry=await run(state,{assets:[asset(2)]});expect(retry.error).toBeUndefined();
  expect(state.calls.uploads.length-before).toBe(1);
  expect([0,1,3,4].map(i=>state.targets.get(id(i)).cutout_path)).toEqual(successfulPaths);
});

it('a full rerun verifies already active objects without uploads or target writes',async()=>{
  const state=database();expect((await run(state)).error).toBeUndefined();
  const uploads=state.calls.uploads.length,writes=state.calls.targetWrites.length;
  const retry=await run(state);expect(retry.error).toBeUndefined();
  expect(retry.report.items.every(i=>i.status==='already_active')).toBe(true);
  expect(state.calls.uploads).toHaveLength(uploads);expect(state.calls.targetWrites).toHaveLength(writes);
});

it('corrupt Storage bytes and protected existing cutouts cannot change their references',async()=>{
  const state=database({corruptId:id(1),occupiedId:id(3)});
  const {error,report}=await run(state);expect(error).toBeDefined();
  expect(report.items.filter(i=>i.status==='failed').map(i=>i.index)).toEqual([1,3]);
  expect(state.targets.get(id(1)).cutout_path).toBeNull();
  expect(state.targets.get(id(3)).cutout_path).toBe('existing.webp');
});

it('restores this invocation’s previous slot if a post-activation readback fails',async()=>{
  const state=database({postReadFailureId:id(2)});
  const {error,report}=await run(state);expect(error).toBeDefined();
  expect(report.items[2].status).toBe('failed');expect(state.targets.get(id(2)).cutout_path).toBeNull();
  expect(report.items.filter(i=>i.status==='active')).toHaveLength(4);
});

it('requires the pinned spell UUID and verified archive before uploading the affected image',async()=>{
  const state=database();const assets=Array.from({length:5},(_,i)=>asset(i));
  assets[0].target_id=id(99);assets[1].archive_verified=false;
  const {error,report}=await run(state,{assets});expect(error).toBeDefined();
  expect(report.items[0].error).toContain('TARGET_ID_MISMATCH');
  expect(report.items[1].error).toContain('VERIFIED_DRIVE_ARCHIVE_REQUIRED');
  expect(state.calls.uploads).toHaveLength(3);
});

it('rejects a nonempty source bucket and duplicate targets before any publication',async()=>{
  for(const options of [{sourceNonempty:true},{}]){
    const state=database(options);
    const result=await run(state, options.sourceNonempty?{}:{assets:[asset(0),asset(0)]});
    expect(result.error).toBeDefined();expect(state.calls.uploads).toEqual([]);
    expect(state.calls.targetWrites).toEqual([]);
  }
});

it('pilot mode verifies all five files without job creation or active pointer changes',async()=>{
  const state=database();const {error,report}=await run(state,{mode:'pilot'});
  expect(error).toBeUndefined();expect(report.items.every(i=>i.status==='pilot_verified')).toBe(true);
  expect(state.jobs.size).toBe(0);expect(state.calls.targetWrites).toEqual([]);
  expect([...state.targets.values()].every(t=>t.cutout_path===null)).toBe(true);
});
