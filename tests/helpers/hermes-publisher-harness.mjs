import {expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {assertSpellCutoutWritable, systemAssetProfile} from '../../scripts/hermes2_asset_profiles.ts';

const code = stripTypeScriptTypes(readFileSync(new URL('../../scripts/hermes2_publish.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''));
const raw = new Uint8Array(Buffer.from('verified converter WebP bytes'));
const sha = createHash('sha256').update(raw).digest('hex');
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const asset = i => ({kind:'spell-cutout', target_key:`test-${i}`, target_id:id(i),
  batch_index:i, archive_file_id:`archive-source-${i}`, archive_verified:true,
  source_path:`drive://archive-source-${i}`, source_sha256:'a'.repeat(64), source_bytes:1024,
  app_file:`spell-cutout/test-${i}/${sha}.webp`, app_sha256:sha, app_bytes:raw.length,
  width:640, height:640, alpha_preserved:true});

function database({failId, corruptId, postReadFailureId, occupiedId, sourceNonempty=false, systemRows}={}) {
  const targets = new Map(Array.from({length:5}, (_,i)=>[id(i), {id:id(i),spell_key:`test-${i}`,cutout_path:occupiedId===id(i)?'existing.webp':null,icon_path:'icon.webp',illustration_path:'square.webp'}]));
  if(systemRows){targets.clear();for(const row of systemRows)targets.set(row.id,{...row})}
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
            if ((table==='rule_spells'||table==='arcane_system_assets')) calls.targetWrites.push({id:row.id,...body});
          }
        }
        return {data:rows.map(r=>({...r})),error:null};
      };
      const q = {
        select(){return q}, returns(){return q}, eq(k,v){filters.push([k,v]);return q}, is(k,v){return q.eq(k,v)},
        insert(value){operation='insert';body=value;return q}, update(value){operation='update';body=value;return q},
        async maybeSingle(){const r=await execute();return {...r,data:r.data?.[0]??null}},
        async single(){
          if ((table==='rule_spells'||table==='arcane_system_assets') && readFailurePending && filters.some(([k,v])=>k==='id'&&v===postReadFailureId) && (targets.get(postReadFailureId).cutout_path||targets.get(postReadFailureId).asset_path)) {
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
  const context={Uint8Array,ArrayBuffer,Blob,TextEncoder,crypto:webcrypto,Date,assertSpellCutoutWritable,systemAssetProfile,
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

export {database,run,asset,id,sha,raw};
