import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createBatchHandler,canonical,normalizeInfo} from '../supabase/functions/skylla-verify/batch.mjs';
import {sha256,crc32,decodePNG,PROJECT,BUCKET} from '../supabase/functions/skylla-verify/core.mjs';

function syntheticPNG(){
  const chunk=(name,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);b.set(data,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;};
  const h=Buffer.alloc(13);h.writeUInt32BE(8);h.writeUInt32BE(8,4);h[8]=8;h[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc(8*33))),chunk('IEND',Buffer.alloc(0))]);
}

async function setup(options={}){
  const bytes=syntheticPNG();assert.equal((await decodePNG(bytes)).complete_decode,true);
  const sha=await sha256(bytes),token='x'.repeat(43),clock=Date.parse('2026-10-20T14:00:00Z');
  const entry={id:'1'.repeat(64),bucket:BUCKET,object_path:`skill/synthetic/${sha}.png`,sha256:sha,size_bytes:bytes.length,
    inbox_file_id:'synthetic-inbox-file',complete_decode:true,
    source_identity:{id:'synthetic-storage-id',version:'v1',etag:'"content-v1"',size_bytes:bytes.length,last_modified:'2026-10-18T00:00:00Z'},
    drive:{file_id:'synthetic-archive-file',parent_id:'synthetic-parent',revision_id:'synthetic-revision',sha256:sha,size_bytes:bytes.length},
    dependency:{job_id:'synthetic-job',kind:'skill',target_key:'synthetic',app_path:'hermes/skill/synthetic/image.webp',app_sha256:'a'.repeat(64),registry_table:'rule_skills',registry_id:'synthetic',registry_field:'icon_path'},...options.entry};
  if(options.wrongFolder)entry.drive.parent_id='unapproved';
  const entries=options.count?Array.from({length:options.count},(_,i)=>({...entry,id:i.toString(16).padStart(64,'0'),object_path:`skill/synthetic-${i}/${sha}.png`,dependency:{...entry.dependency,target_key:`synthetic-${i}`}})):[entry];
  const plan={schema:'skylla-fast-lane-batch/v2',project_id:PROJECT,bucket:BUCKET,approval_required:true,entries,...options.plan};
  plan.manifest_sha256=await sha256(new TextEncoder().encode(canonical(plan)));
  const capability={enabled:true,operation:'execute',owner_approved_manifest_sha256:plan.manifest_sha256,
    manifest_sha256:plan.manifest_sha256,token_sha256:await sha256(new TextEncoder().encode(token)),
    not_before:'2026-10-20T13:59:59Z',expires_at:'2026-10-20T14:59:59Z',drive_checked_at:'2026-10-20T13:59:50Z',
    drive_revision_set_sha256:await sha256(new TextEncoder().encode(canonical(plan.entries.map(e=>({file_id:e.drive.file_id,revision_id:e.drive.revision_id})).sort((a,b)=>a.file_id<b.file_id?-1:a.file_id>b.file_id?1:0)))),...options.cap};
  let deleted=false;const calls=[];
  const info=()=>({id:entry.source_identity.id,version:options.changedVersion?'v2':'v1',etag:'"content-v1"',size:bytes.length,last_modified:entry.source_identity.last_modified});
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});assert.equal(opts.redirect,'error');assert.equal(opts.headers.apikey,'synthetic-server-secret');
    if(options.networkError)throw Error('private-sensitive-provider-data');
    if(options.deniedStorage)return Response.json({error:'denied'},{status:401});
    if(url.includes('/object/info/')){
      if(deleted||options.missing)return Response.json({statusCode:'404'},{status:400});
      return Response.json(info());
    }
    if(opts.method==='DELETE'){
      assert.equal(url,`https://${PROJECT}.supabase.co/storage/v1/object/${BUCKET}`);
      assert.deepEqual(JSON.parse(opts.body),{prefixes:[entry.object_path]});
      if(options.deleteError)throw Error('private-sensitive-provider-data');
      deleted=true;return Response.json([{name:options.badDeleteResponse?'unapproved.png':entry.object_path}]);
    }
    assert.equal(opts.method,'GET');
    if(url.includes('?select=id&or='))return Response.json(options.otherReference?[{id:'other-registry-record'}]:[]);
    if(url.includes('/rest/v1/hermes_jobs?select=id&kind='))return Response.json(options.pending?[{id:'running'}]:[]);
    if(url.includes('/rest/v1/hermes_jobs?'))return Response.json([{id:entry.dependency.job_id,status:options.active?'processing':'active',
      kind:'skill',target_key:'synthetic',source_path:entry.object_path,source_sha256:sha,
      app_path:entry.dependency.app_path,app_sha256:entry.dependency.app_sha256}]);
    if(url.includes('/rest/v1/rule_skills?'))return Response.json([{icon_path:options.changedRef?'different.webp':entry.dependency.app_path}]);
    assert.ok(url.endsWith('/'+entry.object_path));
    if(deleted||options.missing)return Response.json({statusCode:'404'},{status:400});
    return new Response(options.badSHA?Buffer.alloc(bytes.length):bytes);
  };
  const handler=createBatchHandler({plan,capability,folders:{skill:'synthetic-parent'},env:()=>options.noAuth?null:'synthetic-server-secret',fetcher,now:()=>clock});
  const request=(action='execute',receipt=null,body={},headers={},method='POST')=>new Request('https://synthetic-function',{
    method,headers:{'content-type':'application/json','x-skylla-capability':token,...headers},
    ...(method==='POST'?{body:JSON.stringify({id:entry.id,manifest_sha256:plan.manifest_sha256,action,receipt,...body})}:{})});
  return {handler,request,calls,entry,plan};
}
test('fixed approved object is deleted via Storage API and verified absent',async()=>{
  const s=await setup();const p=await(await s.handler(s.request())).json();assert.equal(p.status,'deleted');assert.equal(p.absence_verified,true);
  assert.equal(s.calls.filter(c=>c.opts.method==='DELETE').length,1);assert.ok(!JSON.stringify(p).includes('synthetic-server-secret'));
});
test('read-only preparation cannot delete; verifies and issues signed version-bound proof',async()=>{
  const s=await setup({cap:{operation:'verify_only',owner_approved_manifest_sha256:null}});
  assert.equal((await s.handler(s.request())).status,403);
  const p=await(await s.handler(s.request('verify'))).json();assert.equal(p.status,'verified');assert.equal(p.verification_receipt.payload.source_identity.version,'v1');
  assert.equal(s.calls.filter(c=>c.opts.method==='DELETE').length,0);
});
test('same unchanged signed byte proof is reused, without downloading source again',async()=>{
  const s=await setup();const p=await(await s.handler(s.request('verify'))).json();const count=s.calls.length;
  const r=await(await s.handler(s.request('verify',p.verification_receipt))).json();assert.equal(r.source_hash_receipt_reused,true);
  assert.equal(s.calls.slice(count).filter(c=>c.url.includes('/object/authenticated/')).length,0);
});
test('forged signature or wrong revision never establishes a cache hit',async()=>{
  const s=await setup();const p=await(await s.handler(s.request('verify'))).json();
  for(const mutate of [r=>{r.signature='0'.repeat(64);},r=>{r.payload.drive_revision_id='different-revision';}]){
    const r=structuredClone(p.verification_receipt);mutate(r);const v=await(await s.handler(s.request('verify',r))).json();
    assert.equal(v.status,'verified');assert.equal(v.source_hash_receipt_reused,false);
  }
});
test('missing object is skipped on execution; status independently verifies absence',async()=>{
  const s=await setup({missing:true});assert.equal((await(await s.handler(s.request())).json()).status,'skipped');
  assert.equal((await(await s.handler(s.request('status'))).json()).status,'absent');assert.ok(!s.calls.some(c=>c.opts.method==='DELETE'));
});
for(const [name,options] of Object.entries({changedVersion:{changedVersion:true},wrongSHA:{badSHA:true},activeConsumer:{active:true},
  pendingPublication:{pending:true},changedReference:{changedRef:true},otherRegisteredSourceReference:{otherReference:true},missingAuthentication:{noAuth:true},interruptedTransfer:{networkError:true},
  wrongCategory:{entry:{object_path:'symbol/synthetic/unknown.png'}},wrongDriveFolder:{wrongFolder:true}}))
  test(`unsafe object is skipped: ${name}`,async()=>{const s=await setup(options);const r=await s.handler(s.request());
    const p=await r.json();assert.notEqual(p.status,'deleted');assert.ok(!s.calls.some(c=>c.opts.method==='DELETE'));});
for(const [name,cap] of Object.entries({disabled:{enabled:false},expired:{expires_at:'2026-10-20T13:59:59Z'},
  excessiveWindow:{expires_at:'2026-10-20T15:59:59Z'},staleDriveAttestation:{drive_checked_at:'2026-10-20T13:40:00Z'},
  wrongManifest:{manifest_sha256:'0'.repeat(64)}}))
  test(`authorization fails closed: ${name}`,async()=>{const s=await setup({cap});assert.equal((await s.handler(s.request())).status,503);assert.equal(s.calls.length,0);});
test('unapproved batch cannot execute',async()=>{const s=await setup({cap:{owner_approved_manifest_sha256:'0'.repeat(64)}});assert.equal((await s.handler(s.request())).status,403);assert.equal(s.calls.length,0);});
test('upstream authorization failure stops at one Storage request',async()=>{
  const s=await setup({deniedStorage:true});assert.equal((await s.handler(s.request())).status,503);assert.equal(s.calls.length,1);
});
test('caller cannot inject a path, action, browser origin, token or object outside manifest',async()=>{
  const s=await setup();for(const r of [s.request('execute',null,{path:'other.png'}),s.request('execute',null,{id:'other'}),
    s.request('delete-bucket'),s.request('execute',null,{}, {origin:'https://browser'}),s.request('execute',null,{}, {'x-skylla-capability':''}),
    s.request('execute',null,{}, {},'GET')])assert.ok((await s.handler(r)).status>=400);
  assert.equal(s.calls.length,0);
});
test('100 entries are accepted, 101 are rejected before any Storage calls',async()=>{
  for(const count of [100,101]){const s=await setup({count});const r=await s.handler(s.request('status',null,{id:s.plan.entries[0].id}));
    if(count===100)assert.equal(r.status,200);else{assert.equal(r.status,503);assert.equal(s.calls.length,0);}}
});
test('interrupted delete and unexpected response report unknown, never success',async()=>{
  for(const opts of [{deleteError:true},{badDeleteResponse:true}]){const s=await setup(opts);const p=await(await s.handler(s.request())).json();
    assert.equal(p.status,'outcome_unknown');assert.equal(p.delete_api_invoked,true);assert.ok(!JSON.stringify(p).includes('private-sensitive'));}
});
test('provider metadata normalization keeps exact validators',()=>{
  const info=normalizeInfo({id:'one',metadata:{size:5,eTag:'"a"',lastModified:'2026-10-20T12:00:00Z'}});
  assert.deepEqual(info,{id:'one',version:null,etag:'a',size_bytes:5,last_modified:'2026-10-20T12:00:00.000Z'});
});
