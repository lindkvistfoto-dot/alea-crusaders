import {it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {assertSpellCutoutWritable} from '../scripts/hermes2_asset_profiles.ts';

const code = stripTypeScriptTypes(readFileSync(new URL('../scripts/hermes2_publish.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''));
const raw = new Uint8Array(Buffer.from('verified converter WebP bytes'));
const sha = createHash('sha256').update(raw).digest('hex');
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const asset = i => ({kind:'spell-cutout', target_key:`test-${i}`, target_id:id(i),
  batch_index:i, archive_file_id:`archive-source-${i}`, archive_verified:true,
  source_path:`drive://archive-source-${i}`, source_sha256:'a'.repeat(64), source_bytes:1024,
  app_file:`spell-cutout/test-${i}/${sha}.webp`, app_sha256:sha, app_bytes:raw.length,
  width:640, height:640, alpha_preserved:true});

function database({failId, corruptId, postReadFailureId, occupiedId, sourceNonempty=false}={}) {
  const targets = new Map(Array.from({length:5}, (_,i)=>[id(i), {id:id(i),spell_key:`test-${i}`,cutout_path:occupiedId===id(i)?'existing.webp':null,icon_path:'icon.webp',illustration_path:'square.webp'}]));
  const jobs = new Map(), storage = new Map();
  const calls = {uploads:[], targetWrites:[], sourceChecks:0, clients:0, deliveries:0};
  let readFailurePending = !!postReadFailureId;
  const db = {
    from(table) {
      const filters = [];
      let operation = 'select', body;
      const matches = row => filters.every(([k,v])=>row[k]===v);
      const execute = async () => {
        if (table==='hermes_job_events') return {data:null,error:null};
        const rows = [...(table==='hermes_jobs'?jobs:targets).values()].filter(matches);
        if (operation==='insert') {
          const row = {...body,id:'job-'+jobs.size}; jobs.set(row.id,row);
          return {data:[{...row}],error:null};
        }
        if (operation==='update') {
          for (const row of rows) {
            Object.assign(row,body);
            if (table==='rule_spells') calls.targetWrites.push({id:row.id,...body});
          }
        }
        return {data:rows.map(r=>({...r})),error:null};
      };
      const q = {
        select(){return q}, returns(){return q}, eq(k,v){filters.push([k,v]);return q}, is(k,v){return q.eq(k,v)},
        insert(value){operation='insert';body=value;return q}, update(value){operation='update';body=value;return q},
        async maybeSingle(){const r=await execute();return {...r,data:r.data?.[0]??null}},
        async single(){
          if (table==='rule_spells' && readFailurePending && filters.some(([k,v])=>k==='id'&&v===postReadFailureId) && targets.get(postReadFailureId).cutout_path) {
            readFailurePending=false;return {data:null,error:{message:'simulated post-activation read failure'}};
          }
          return q.maybeSingle();
        },
        then(resolve,reject){return execute().then(resolve,reject)}
      };
      return q;
    },
    storage:{from(bucket){return {
      async list(){calls.sourceChecks++;return {data:sourceNonempty?[{name:'unexpected-original.png'}]:[],error:null}},
      async upload(path,blob,options){
        calls.uploads.push({bucket,path,mime:blob.type,upsert:options.upsert});
        if(path.includes(failId))return {error:{message:'simulated upload failure'}};
        const key=bucket+'/'+path;
        if(storage.has(key))return {error:{message:'already exists'}};
        storage.set(key,new Uint8Array(await blob.arrayBuffer()));return {error:null};
      },
      async download(path){return {data:new Blob([path.includes(corruptId)?new Uint8Array([0]):storage.get(bucket+'/'+path)]),error:null}},
      async createSignedUrl(path){return {data:{signedUrl:'https://storage.test/'+bucket+'/'+path},error:null}},
      getPublicUrl(path){return {data:{publicUrl:'https://storage.test/'+bucket+'/'+path}}}
    }}}
  };
  return {db,targets,jobs,storage,calls};
}

async function run(state, {assets=Array.from({length:5},(_,i)=>asset(i)), mode='publish'}={}) {
  let report;
  const manifest = {schema:2,publication_mode:mode,archive_required:true,assets};
  const env={SUPABASE_URL:'https://storage.test',SUPABASE_SERVICE_ROLE_KEY:'test-secret',GITHUB_REPOSITORY:'lindkvistfoto-dot/alea-crusaders',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'12345678',GITHUB_SHA:'b'.repeat(40),HERMES_REPORT_PATH:'output/publisher-report.json'};
  const context={Uint8Array,ArrayBuffer,Blob,TextEncoder,crypto:webcrypto,Date,assertSpellCutoutWritable,
    createClient(){state.calls.clients++;return state.db},
    Deno:{env:{get:key=>env[key]},args:['manifest','output'],readTextFile:async()=>JSON.stringify(manifest),readFile:async()=>raw,
      writeTextFile:async(path,text)=>{expect(path).toBe('output/publisher-report.json');report=JSON.parse(text)}},
    console:{log(){},error(){}},
    fetch:async url=>{state.calls.deliveries++;return new Response(state.storage.get(new URL(url).pathname.slice(1)))}
  };
  let error;
  try{await vm.runInNewContext('(async()=>{'+code+'})()',context)}catch(e){error=e}
  return {error,report};
}

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
