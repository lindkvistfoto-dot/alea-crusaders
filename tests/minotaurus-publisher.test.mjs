import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';

const publisher=readFileSync(new URL('../scripts/hermes2_publish.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(publisher.replace(/^import .*;\n/gm,''));
const raw=new Uint8Array(Buffer.from('verified app bytes'));
const sha=createHash('sha256').update(raw).digest('hex');
const asset={kind:'symbol',target_key:'stopp',source_path:'drive://verified-source-id',source_sha256:'a'.repeat(64),source_bytes:1024,app_file:`symbol/stopp/${sha}.webp`,app_sha256:sha,app_bytes:raw.length,width:640,height:640,alpha_preserved:true};

async function run({mode='pilot',entry=asset,conflict=false,corrupt=false,status=null,ref='refs/heads/main'}={}){
 const calls={uploads:[],writes:[],deliveries:[],events:[]};
 let target={id:'test-symbol',icon_path:'unchanged.webp'};
 let job={id:'test-job',previous_icon_path:target.icon_path,app_path:`hermes/symbol/stopp/${sha}.webp`,app_sha256:sha,status};
 if(status==='active')target.icon_path=job.app_path;
 const db={
  from(table){
   let op='select',body;
   const q={
    select(){return q},eq(){return q},is(){return q},returns(){return q},
    insert(value){op='insert';body=value;calls.writes.push([table,op,value]);return q},
    update(value){op='update';body=value;calls.writes.push([table,op,value]);return q},
    async maybeSingle(){return {data:table==='hermes_jobs'?(status?job:null):{...target},error:null}},
    async single(){
     if(table==='hermes_jobs')return {data:job,error:null};
     return {data:{...target},error:null};
    },
    then(resolve,reject){
     if(table==='rule_magic_symbols'&&op==='update'&&!conflict)target={...target,...body};
     return Promise.resolve({data:table==='rule_magic_symbols'?(conflict?[]:[{...target}]):null,error:null}).then(resolve,reject);
    }
   };return q;
  },
  storage:{from(bucket){return {
   async upload(path,blob,options){calls.uploads.push({bucket,path,mime:blob.type,upsert:options.upsert});return {error:null}},
   async download(){return {data:new Blob([corrupt?new Uint8Array([0]):raw]),error:null}},
   getPublicUrl(path){return {data:{publicUrl:'https://storage.test/'+path}}},
   async createSignedUrl(path){return {data:{signedUrl:'https://storage.test/'+path},error:null}}
  }}}
 };
 const manifest={schema:2,publication_mode:mode,assets:[entry]};
 const env={SUPABASE_URL:'https://storage.test',SUPABASE_SERVICE_ROLE_KEY:'test-secret',GITHUB_REPOSITORY:'lindkvistfoto-dot/alea-crusaders',GITHUB_REF:ref,GITHUB_RUN_ID:'12345678',GITHUB_SHA:'b'.repeat(40)};
 const context={Uint8Array,ArrayBuffer,Blob,TextEncoder,crypto:webcrypto,createClient:()=>db,assertSpellCutoutWritable(){},
  Deno:{env:{get:key=>env[key]},args:['manifest','output'],readTextFile:async()=>JSON.stringify(manifest),readFile:async()=>raw},
  console:{log(...args){calls.events.push(args)},error(){}},
  fetch:async url=>{calls.deliveries.push(url);return new Response(raw)}
 };
 let error;try{await vm.runInNewContext('(async()=>{'+code+'})()',context)}catch(e){error=e}
 return {calls,target,error};
}

it('pilot uploads only isolated WebP, verifies Storage and URL, and never writes jobs or target rows',async()=>{
 const {calls,target,error}=await run();expect(error).toBeUndefined();
 expect(calls.uploads).toEqual([{bucket:'alea-hermes-public',path:`hermes/minotaurus-pilot/symbol/stopp/${sha}.webp`,mime:'image/webp',upsert:false}]);
 expect(calls.writes).toEqual([]);expect(target.icon_path).toBe('unchanged.webp');expect(calls.deliveries).toHaveLength(1);
 expect(calls.events.some(e=>e[0]==='HERMES_DIRECT_PILOT_VERIFIED')).toBe(true);
});
it('publish uses the existing target slot and never uploads an original',async()=>{
 const {calls,target,error}=await run({mode:'publish'});expect(error).toBeUndefined();
 expect(calls.uploads.every(u=>u.mime==='image/webp'&&u.bucket!=='alea-hermes-source'&&!u.upsert)).toBe(true);
 expect(target.icon_path).toBe(`hermes/symbol/stopp/${sha}.webp`);
 expect(calls.writes.filter(([table])=>table==='rule_magic_symbols')).toEqual([['rule_magic_symbols','update',{icon_path:`hermes/symbol/stopp/${sha}.webp`}]]);
});
it('rejects a corrupt readback and CAS conflict without changing an active pointer',async()=>{
 for(const options of [{corrupt:true},{mode:'publish',conflict:true}]){
  const {error,target}=await run(options);expect(error).toBeDefined();expect(target.icon_path).toBe('unchanged.webp');
 }
});
it('rechecks already-active optimized bytes without changing existing job provenance',async()=>{
 const {calls,error}=await run({mode:'publish',status:'active'});expect(error).toBeUndefined();expect(calls.writes).toEqual([]);expect(calls.uploads).toEqual([]);expect(calls.deliveries).toHaveLength(1);
});
it('fails closed on legacy manifests, path traversal, and non-main contexts',async()=>{
 for(const options of [{entry:{...asset,source_path:'assets/hermes/originals/symbol/stopp/a.png'}},{entry:{...asset,app_file:'../secret'}},{mode:'unknown'},{ref:'refs/heads/untrusted'}]){
  const {calls,error}=await run(options);expect(error).toBeDefined();expect(calls.uploads).toEqual([]);expect(calls.writes).toEqual([]);
 }
});

it('legacy endpoint rejects original upload/import/retry before Storage or GitHub access',async()=>{
 const edge=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/hermes-v2/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 let handler;
 const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id:'admin',is_admin:true},error:null})};return q}};
 vm.runInNewContext(edge,{Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},createClient:()=>client,Response,console});
 const request=(type='application/json',body={})=>({method:'POST',headers:new Headers({'authorization':'Bearer valid','content-type':type}),json:async()=>body});
 for(const action of ['import_osakerhet','retry']){
  const response=await handler(request('application/json',{action}));expect(response.status).toBe(410);
 }
 expect((await handler(request('multipart/form-data'))).status).toBe(410);
 expect((await handler({method:'GET'})).status).toBe(405);
 expect((await handler({method:'POST',headers:new Headers()})).status).toBe(401);
 expect(await (await handler(request('application/json',{action:'diagnostics'}))).json()).toMatchObject({publication_enabled:false,source_uploads_enabled:false});
});
