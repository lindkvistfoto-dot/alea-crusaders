import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverAbandonedStaging} from '../supabase/functions/hermes-alea/recovery.mjs';
import {sha256} from '../supabase/functions/hermes-alea/validation.mjs';

const owner='66e4fd1b-ccd1-49a5-bbed-2b7264981732';
const jobId='afa51e49-1709-4e77-8858-2885a4465d8b';
const sourcePath=owner+'/'+jobId+'/original';
const outputPath='trophy/'+jobId+'.webp';
const source=new TextEncoder().encode('verified original bytes');
const output=new TextEncoder().encode('verified webp bytes');

function response(status,data,headers={}){
 const body=data instanceof Uint8Array?data:typeof data==='string'?data:JSON.stringify(data);
 return new Response(body,{status,headers});
}

test('recovers only expired, hash-matching staging objects through the two-phase RPC',async()=>{
 const objects=new Map([
  ['hermes-alea-originals/'+sourcePath,source],
  ['hermes-alea-display/'+outputPath,output]
 ]);
 const calls=[];
 const job={id:jobId,requested_by:owner,target_kind:'relief',target_id:'00000000-0000-4000-8000-000000000001',
  operation:'CREATE',state:'uploading',created_at:'2026-10-26T17:49:34.713Z',lease_until:null,
  archive_state:'not_required',archive_drive_id:null,source_path:sourcePath,output_path:outputPath,
  source_bytes:source.length,output_bytes:output.length,source_sha256:await sha256(source),output_sha256:await sha256(output),
  source_deleted_at:null,output_deleted_at:null};
 const fetcher=async(url,options={})=>{
  const path=new URL(url).pathname;
  const method=options.method||'GET';
  if(path==='/rest/v1/hermes_alea_jobs')return response(200,[job]);
  if(path==='/rest/v1/hermes_alea_cleanup_report')return response(200,[{id:jobId,abandoned_candidate:true}]);
  if(path==='/rest/v1/rpc/hermes_alea_cleanup'){
   const input=JSON.parse(options.body);calls.push(input);
   if(input.action==='ack'){job.state='abandoned';job.source_deleted_at='now';job.output_deleted_at='now';}
   return response(200,job);
  }
  if(path==='/storage/v1/object/hermes-alea-originals'||path==='/storage/v1/object/hermes-alea-display'){
   if(method==='DELETE'){
    const bucket=path.endsWith('originals')?'hermes-alea-originals':'hermes-alea-display';
    for(const key of JSON.parse(options.body).prefixes)objects.delete(bucket+'/'+key);
    return response(200,{});
   }
  }
  if(path.startsWith('/storage/v1/object/')){
   const key=decodeURIComponent(path.replace('/storage/v1/object/','').split('/').map(decodeURIComponent).join('/'));
   const bytes=objects.get(key);
   return bytes?response(200,bytes,{'content-type':'application/octet-stream'}):response(404,'Object not found');
  }
  throw Error('Unexpected request '+method+' '+path);
 };
 const result=await recoverAbandonedStaging({
  url:'https://dev.example.test',headers:{apikey:'service-key',Authorization:'Bearer service-key'},requesterId:owner,fetcher,now:Date.parse('2026-11-06T18:00:00Z')
 });
 assert.deepEqual(result,{recovered:1,released_bytes:12000000});
 assert.equal(job.state,'abandoned');
 assert.equal(objects.size,0);
 assert.deepEqual(calls.map(call=>call.action),['reserve','ack']);
 assert.equal(calls.every(call=>call.kind==='abandoned'&&call.job_id===jobId),true);
});

test('does not delete any object when the job is not an abandoned candidate',async()=>{
 const objects=new Map([['hermes-alea-originals/'+sourcePath,source]]);
 const fetcher=async(url)=>{
  const path=new URL(url).pathname;
  if(path==='/rest/v1/hermes_alea_jobs')return response(200,[{id:jobId}]);
  if(path==='/rest/v1/hermes_alea_cleanup_report')return response(200,[{id:jobId,abandoned_candidate:false}]);
  throw Error('Unexpected request '+path);
 };
 const result=await recoverAbandonedStaging({
  url:'https://dev.example.test',headers:{apikey:'service-key',Authorization:'Bearer service-key'},requesterId:owner,fetcher,now:Date.parse('2026-11-06T18:00:00Z')
 });
 assert.deepEqual(result,{recovered:0,released_bytes:0});
 assert.equal(objects.size,1);
});

test('keeps mismatched staging objects and fails closed',async()=>{
 const fetcher=async(url,options={})=>{
  const path=new URL(url).pathname;
  if(path==='/rest/v1/hermes_alea_jobs')return response(200,[{
   id:jobId,requested_by:owner,target_kind:'relief',target_id:'00000000-0000-4000-8000-000000000001',
   operation:'CREATE',state:'uploading',created_at:'2026-10-26T17:49:34.713Z',lease_until:null,
   archive_state:'not_required',archive_drive_id:null,source_path:sourcePath,output_path:outputPath,
   source_bytes:source.length,output_bytes:output.length,source_sha256:'0'.repeat(64),output_sha256:await sha256(output),
   source_deleted_at:null,output_deleted_at:null
  }]);
  if(path==='/rest/v1/hermes_alea_cleanup_report')return response(200,[{id:jobId,abandoned_candidate:true}]);
  if(path==='/rest/v1/rpc/hermes_alea_cleanup')return response(200,{});
  if(path==='/storage/v1/object/hermes-alea-originals/'+owner+'/'+jobId+'/original')return response(200,source);
  throw Error('Unexpected request '+path);
 };
 await assert.rejects(()=>recoverAbandonedStaging({
  url:'https://dev.example.test',headers:{apikey:'service-key',Authorization:'Bearer service-key'},requesterId:owner,fetcher,now:Date.parse('2026-11-06T18:00:00Z')
 }),/STAGING_OBJECT_MISMATCH/);
});

