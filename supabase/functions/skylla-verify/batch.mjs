import {PROJECT,BUCKET,sha256,boundedBody} from './core.mjs';

const BASE=`https://${PROJECT}.supabase.co`;
const enc=value=>encodeURIComponent(value);
export const canonical=value=>JSON.stringify(value&&typeof value==='object'?(Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):
  Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))]))):value);
const hash=async value=>sha256(new TextEncoder().encode(canonical(value)));
const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const fail=code=>{throw Error(code);};
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');

export function normalizeInfo(i){
  return {id:i.id??null,version:i.version??null,etag:String(i.etag??i.eTag??i.metadata?.eTag??'').replace(/^"|"$/g,''),
    size_bytes:Number(i.size??i.metadata?.size),last_modified:date(i.last_modified??i.lastModified??i.metadata?.lastModified)};
}
function matchesExpected(info,e){
  return info.id===e.source_identity.id&&info.etag===String(e.source_identity.etag).replace(/^"|"$/g,'')&&
    info.size_bytes===e.size_bytes&&info.last_modified===date(e.source_identity.last_modified)&&
    !!info.version&&info.version===e.source_identity.version;
}
async function signature(payload,secret){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('SKYLLA-BYTE-RECEIPT/v2\n'+canonical(payload))));
}
function validEntry(e,folders){
  const parts=String(e.object_path).split('/'),d=e.dependency||{},drive=e.drive||{},src=e.source_identity||{};
  return e.bucket===BUCKET&&/^[a-f0-9]{64}$/.test(e.id)&&/^[a-f0-9]{64}$/.test(e.sha256)&&
    /^(spell(?:-cutout|-illustration(?:-wide)?)?|skill(?:-illustration(?:-wide)?)?)\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{64}\.png$/.test(e.object_path)&&
    parts[2]===e.sha256+'.png'&&Number.isInteger(e.size_bytes)&&e.size_bytes>0&&e.size_bytes<=8388608&&
    drive.sha256===e.sha256&&drive.size_bytes===e.size_bytes&&drive.parent_id===folders[parts[0]]&&
    /^[A-Za-z0-9_-]{10,}$/.test(drive.file_id||'')&&drive.file_id!==e.inbox_file_id&&
    /^[A-Za-z0-9_-]{10,}$/.test(drive.revision_id||'')&&e.complete_decode===true&&
    !!src.id&&!!src.version&&!!src.etag&&!!date(src.last_modified)&&src.size_bytes===e.size_bytes&&
    !!d.job_id&&d.kind===parts[0]&&d.target_key===parts[1]&&/^[a-f0-9]{64}$/.test(d.app_sha256||'')&&
    ['rule_spells','rule_skills'].includes(d.registry_table)&&
    ['icon_path','illustration_path','illustration_wide_path','cutout_path'].includes(d.registry_field)&&
    /^[a-zA-Z0-9_/-]+\.webp$/.test(d.app_path||'')&&!d.app_path.includes('..')&&!!d.registry_id;
}

/** Fixed manifest, own cryptographic auth, <=60 minutes, no general Storage API.
 * Verification receipts are HMAC signed inside Supabase and bind exact source
 * validators to the actual SHA-256 and the immutable Drive binary revision.
 */
export function createBatchHandler({plan,capability,folders,env,fetcher=fetch,now=Date.now}){
  const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  return async req=>{
    if(req.method!=='POST')return json({error:'POST_REQUIRED'},405);
    if(req.headers.has('origin'))return json({error:'BROWSER_ORIGIN_DENIED'},403);
    const start=Date.parse(capability.not_before),until=Date.parse(capability.expires_at),checked=Date.parse(capability.drive_checked_at);
    if(capability.enabled!==true||![start,until,checked].every(Number.isFinite)||until<=start||until-start>3600000||
       now()<start||now()>=until||checked>now()||start-checked>600000||
       capability.manifest_sha256!==plan.manifest_sha256||!['verify_only','execute'].includes(capability.operation))
      return json({error:'BATCH_CAPABILITY_DISABLED_OR_EXPIRED'},503);
    const token=req.headers.get('x-skylla-capability')||'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)||await sha256(new TextEncoder().encode(token))!==capability.token_sha256)
      return json({error:'BATCH_CAPABILITY_REQUIRED'},401);
    let entry,deleteInvoked=false;
    try{
      const payload={...plan};delete payload.manifest_sha256;
      if(plan.schema!=='skylla-fast-lane-batch/v2'||plan.project_id!==PROJECT||plan.bucket!==BUCKET||plan.approval_required!==true||
         !Array.isArray(plan.entries)||plan.entries.length<1||plan.entries.length>100||!plan.entries.every(e=>validEntry(e,folders))||
         new Set(plan.entries.map(e=>e.id)).size!==plan.entries.length||new Set(plan.entries.map(e=>e.object_path)).size!==plan.entries.length||
         await hash(payload)!==plan.manifest_sha256)throw Error('INVALID_FIXED_MANIFEST');
      const revisionSet=plan.entries.map(e=>({file_id:e.drive.file_id,revision_id:e.drive.revision_id})).sort((a,b)=>a.file_id<b.file_id?-1:a.file_id>b.file_id?1:0);
      if(await hash(revisionSet)!==capability.drive_revision_set_sha256)throw Error('CURRENT_DRIVE_REVISION_ATTESTATION_REQUIRED');
      if(!(req.headers.get('content-type')||'').startsWith('application/json'))return json({error:'JSON_REQUIRED'},400);
      const body=JSON.parse(new TextDecoder().decode(await boundedBody(new Response(req.body),12288)));
      if(Object.keys(body).sort().join(',')!=='action,id,manifest_sha256,receipt'||body.manifest_sha256!==plan.manifest_sha256||
         !['verify','execute','status'].includes(body.action))return json({error:'FIXED_BATCH_REQUEST_REQUIRED'},400);
      entry=plan.entries.find(e=>e.id===body.id);
      if(!entry)return json({error:'OBJECT_OUTSIDE_BATCH'},403);
      if(body.action==='execute'&&(capability.operation!=='execute'||capability.owner_approved_manifest_sha256!==plan.manifest_sha256))
        return json({error:'EXACT_BATCH_OWNER_APPROVAL_REQUIRED'},403);
      const identity={manifest_sha256:plan.manifest_sha256,id:entry.id,bucket:BUCKET,object_path:entry.object_path,
        sha256:entry.sha256,size_bytes:entry.size_bytes};
      const secret=env('SUPABASE_SERVICE_ROLE_KEY');if(!secret)return json({error:'SERVER_CONFIGURATION_REQUIRED'},503);
      const request=async(path,options={})=>{
        const response=await fetcher(BASE+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
          ...options,headers:{authorization:'Bearer '+secret,apikey:secret,...options.headers}});
        if([401,403].includes(response.status))throw Error('SERVER_AUTHORIZATION_UNAVAILABLE');
        return response;
      };
      const getJSON=async path=>JSON.parse(new TextDecoder().decode(await boundedBody(await request(path),131072)));
      const isMissing=async response=>{
        if(response.ok)return false;
        const raw=await boundedBody(new Response(response.body),4096);let code;
        try{code=JSON.parse(new TextDecoder().decode(raw)).statusCode;}catch{}
        return response.status===404||(response.status===400&&String(code)==='404');
      };
      const absent=async()=>{
        const r=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+entry.object_path,
          {headers:{range:'bytes=0-0','cache-control':'no-cache'}});
        if(r.ok){await r.body?.cancel();return false;}return isMissing(r);
      };
      const response=await request('/storage/v1/object/info/'+BUCKET+'/'+entry.object_path);
      if(!response.ok){
        if(await isMissing(response)&&await absent())return json({...identity,
          status:body.action==='status'?'absent':'skipped',absence_verified:true,
          reason:'ALREADY_ABSENT_NO_DELETE_SENT',delete_api_invoked:false,observed_at:new Date(now()).toISOString()});
        throw Error('SOURCE_INFO_UNAVAILABLE');
      }
      const info=normalizeInfo(JSON.parse(new TextDecoder().decode(await boundedBody(response,16384))));
      if(!matchesExpected(info,entry))return json({...identity,status:'skipped',reason:'SOURCE_VERSION_CHANGED',
        identity_unchanged:false,source_identity:info,delete_api_invoked:false,observed_at:new Date(now()).toISOString()});
      if(body.action==='status')return json({...identity,status:'present',identity_unchanged:true,
        source_identity:info,delete_api_invoked:false,observed_at:new Date(now()).toISOString()});
      const expected={schema:'skylla-signed-byte-proof/v2',project_id:PROJECT,bucket:BUCKET,
        object_path:entry.object_path,sha256:entry.sha256,size_bytes:entry.size_bytes,
        source_identity:info,drive_file_id:entry.drive.file_id,drive_revision_id:entry.drive.revision_id};
      const old=body.receipt;let reused=false,proof;
      if(old?.payload&&typeof old.signature==='string'){
        const p={...old.payload};delete p.verified_at;
        reused=canonical(p)===canonical(expected)&&await signature(old.payload,secret)===old.signature&&
          Number.isFinite(Date.parse(old.payload.verified_at))&&Date.parse(old.payload.verified_at)<=now();
      }
      if(reused)proof=old;
      else{
        const bytes=await boundedBody(await request('/storage/v1/object/authenticated/'+BUCKET+'/'+entry.object_path),entry.size_bytes);
        if(bytes.length!==entry.size_bytes||await sha256(bytes)!==entry.sha256)throw Error('ACTUAL_SHA256_MISMATCH');
        // Complete decoding was already proved for these exact SHA-256 bytes.
        // Repeating the decoder cannot change that result and wastes CPU.
        const signed={...expected,verified_at:new Date(now()).toISOString()};
        proof={payload:signed,signature:await signature(signed,secret)};
      }
      const dep=entry.dependency;
      const jobs=await getJSON('/rest/v1/hermes_jobs?select=id,status,kind,target_key,source_path,source_sha256,app_path,app_sha256&source_path=eq.'+enc(entry.object_path));
      if(!Array.isArray(jobs)||jobs.length!==1||jobs[0].id!==dep.job_id||jobs[0].status!=='active'||
         jobs[0].kind!==dep.kind||jobs[0].target_key!==dep.target_key||jobs[0].source_sha256!==entry.sha256||
         jobs[0].app_path!==dep.app_path||jobs[0].app_sha256!==dep.app_sha256)throw Error('ACTIVE_OR_CHANGED_SOURCE_DEPENDENCY');
      const pending=await getJSON('/rest/v1/hermes_jobs?select=id&kind=eq.'+enc(dep.kind)+'&target_key=eq.'+enc(dep.target_key)+'&status=not.in.(active,failed)&limit=1');
      if(!Array.isArray(pending)||pending.length)throw Error('ACTIVE_OR_CHANGED_SOURCE_DEPENDENCY');
      const registry=await getJSON('/rest/v1/'+dep.registry_table+'?select='+dep.registry_field+'&id=eq.'+enc(dep.registry_id));
      if(!Array.isArray(registry)||registry.length!==1||registry[0][dep.registry_field]!==dep.app_path)throw Error('REGISTRY_REFERENCE_CHANGED');
      // Check other registered image fields as well as the expected target.
      // These three independent reads run together; no application bytes/tests.
      const registries={rule_spells:['image_path','icon_path','effect_image_path','cutout_path','illustration_path','illustration_wide_path'],
        rule_skills:['icon_path','illustration_path','illustration_wide_path'],rule_magic_symbols:['icon_path']};
      const references=await Promise.all(Object.entries(registries).map(([table,fields])=>
        getJSON('/rest/v1/'+table+'?select=id&or='+enc('('+fields.map(f=>f+'.like.*'+entry.object_path+'*').join(',')+')')+'&limit=1')));
      if(references.some(rows=>!Array.isArray(rows)||rows.length))throw Error('REGISTERED_SOURCE_REFERENCE');
      // Re-read validators after hashing/dependency work, even with cached proof.
      const again=normalizeInfo(await getJSON('/storage/v1/object/info/'+BUCKET+'/'+entry.object_path));
      if(canonical(again)!==canonical(info))throw Error('SOURCE_CHANGED_DURING_CHECK');
      if(now()>=until)throw Error('AUTHORIZATION_EXPIRED');
      const evidence={verification_receipt:proof,source_identity:info,source_hash_receipt_reused:reused,
        drive_revision_id:entry.drive.revision_id,dependencies_clear:true};
      if(body.action==='verify')return json({...identity,...evidence,status:'verified',delete_api_invoked:false,observed_at:new Date(now()).toISOString()});
      deleteInvoked=true;
      const deleted=await request('/storage/v1/object/'+BUCKET,{method:'DELETE',headers:{'content-type':'application/json'},
        body:JSON.stringify({prefixes:[entry.object_path]})});
      const names=JSON.parse(new TextDecoder().decode(await boundedBody(deleted,65536)));
      if(!Array.isArray(names)||names.length!==1||names[0].name!==entry.object_path)throw Error('UNKNOWN_DELETE_RESPONSE');
      const gone=await absent();
      return json({...identity,...evidence,status:gone?'deleted':'outcome_unknown',absence_verified:gone,
        delete_api_invoked:true,storage_api_removed_paths:names.map(n=>n.name),observed_at:new Date(now()).toISOString()});
    }catch(error){
      if(error.message==='SERVER_AUTHORIZATION_UNAVAILABLE')return json({error:'SERVER_AUTHORIZATION_UNAVAILABLE'},503);
      const known=['ACTUAL_SHA256_MISMATCH','ACTIVE_OR_CHANGED_SOURCE_DEPENDENCY','REGISTRY_REFERENCE_CHANGED',
        'SOURCE_CHANGED_DURING_CHECK','AUTHORIZATION_EXPIRED','SOURCE_INFO_UNAVAILABLE','REGISTERED_SOURCE_REFERENCE'];
      if(!entry)return json({error:'INVALID_SERVER_BATCH'},503);
      return json({manifest_sha256:plan.manifest_sha256,id:entry.id,bucket:BUCKET,object_path:entry.object_path,
        sha256:entry.sha256,size_bytes:entry.size_bytes,status:deleteInvoked?'outcome_unknown':'skipped',
        reason:known.includes(error.message)?error.message:'SAFETY_OR_TRANSFER_CHECK_FAILED',
        delete_api_invoked:deleteInvoked,observed_at:new Date(now()).toISOString()});
    }
  };
}
