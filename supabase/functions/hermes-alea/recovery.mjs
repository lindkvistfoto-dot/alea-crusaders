import {sha256} from './validation.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS=24*60*60*1000;
const RESERVATION_BYTES=12000000;

function objectUrl(base,bucket,path){
 return base+'/storage/v1/object/'+encodeURIComponent(bucket)+'/'+path.split('/').map(encodeURIComponent).join('/');
}
async function missingOrBytes(response){
 if(response.ok)return new Uint8Array(await response.arrayBuffer());
 const body=await response.text();
 if(response.status===404 || (response.status===400 && /not found|404/i.test(body)))return null;
 throw Error('STAGING_OBJECT_READ_FAILED');
}

export async function recoverAbandonedStaging({url,headers,requesterId,fetcher=fetch,now=Date.now()}){
 if(!UUID.test(String(requesterId||'')))throw Error('INVALID_RECOVERY_OWNER');
 const base=String(url||'').replace(/\/$/,'');
 if(!base||!headers?.apikey||!headers?.Authorization)throw Error('RECOVERY_NOT_CONFIGURED');
 async function api(path,options={}){
  const response=await fetcher(base+path,{headers,...options});
  const body=await response.text();
  let data=null;try{data=body?JSON.parse(body):null}catch{}
  if(!response.ok){
   const code=data?.message||data?.error||'STAGING_RECOVERY_FAILED';
   throw Error(/^[A-Z_0-9]+$/.test(code)?code:'STAGING_RECOVERY_FAILED');
  }
  return data;
 }
 async function readStored(bucket,path,bytes,hash){
  const response=await fetcher(objectUrl(base,bucket,path),{headers});
  const stored=await missingOrBytes(response);
  if(stored===null)return false;
  if(stored.byteLength!==Number(bytes)||await sha256(stored)!==hash)throw Error('STAGING_OBJECT_MISMATCH');
  return true;
 }
 async function removeStored(bucket,path){
  const response=await fetcher(base+'/storage/v1/object/'+encodeURIComponent(bucket),{
   method:'DELETE',headers,body:JSON.stringify({prefixes:[path]})
  });
  if(!response.ok)throw Error('STAGING_OBJECT_DELETE_FAILED');
  const verify=await fetcher(objectUrl(base,bucket,path),{headers});
  const bytes=await missingOrBytes(verify);
  if(bytes!==null)throw Error('STAGING_OBJECT_DELETE_UNVERIFIED');
 }
 async function cleanup(jobId,action){
  return api('/rest/v1/rpc/hermes_alea_cleanup',{
   method:'POST',body:JSON.stringify({job_id:jobId,kind:'abandoned',action})
  });
 }

 const cutoff=new Date(now-MAX_AGE_MS).toISOString();
 const query=new URLSearchParams({
  requested_by:'eq.'+requesterId,state:'eq.uploading',created_at:'lte.'+cutoff,
  select:'id,requested_by,target_kind,target_id,operation,state,created_at,lease_until,archive_state,archive_drive_id,source_path,output_path,source_bytes,output_bytes,source_sha256,output_sha256,source_deleted_at,output_deleted_at'
 });
 const jobs=await api('/rest/v1/hermes_alea_jobs?'+query.toString());
 if(!Array.isArray(jobs)||jobs.length===0)return {recovered:0,released_bytes:0};
 const ids=jobs.slice(0,5).map(job=>job.id);
 const reportQuery=new URLSearchParams({
  id:'in.('+ids.join(',')+')',select:'id,abandoned_candidate'
 });
 const reports=await api('/rest/v1/hermes_alea_cleanup_report?'+reportQuery.toString());
 const eligible=new Set((reports||[]).filter(row=>row.abandoned_candidate===true).map(row=>row.id));
 const candidates=jobs.slice(0,5).filter(job=>
  eligible.has(job.id)&&job.requested_by===requesterId&&job.state==='uploading'
  &&job.operation!=='REMOVE'&&job.archive_state==='not_required'&&!job.archive_drive_id
  &&(!job.lease_until||Date.parse(job.lease_until)<=now)
  &&Date.parse(job.created_at)<=now-MAX_AGE_MS
  &&typeof job.source_path==='string'&&typeof job.output_path==='string'
 );
 let recovered=0,released=0;
 for(const job of candidates){
  const hadReservation=job.source_deleted_at==null;
  await cleanup(job.id,'reserve');
  const sourceExists=await readStored('hermes-alea-originals',job.source_path,job.source_bytes,job.source_sha256);
  const outputExists=await readStored('hermes-alea-display',job.output_path,job.output_bytes,job.output_sha256);
  if(sourceExists)await removeStored('hermes-alea-originals',job.source_path);
  if(outputExists)await removeStored('hermes-alea-display',job.output_path);
  await cleanup(job.id,'ack');
  recovered++;
  if(hadReservation)released+=RESERVATION_BYTES;
 }
 return {recovered,released_bytes:released};
}