import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createDeletePilotHandler} from '../supabase/functions/skylla-verify/delete-pilot.mjs';
import {crc32,sha256,PROJECT,BUCKET} from '../supabase/functions/skylla-verify/core.mjs';

const chunk=(name,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);b.set(data,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;};
function png(){const h=Buffer.alloc(13);h.writeUInt32BE(8);h.writeUInt32BE(8,4);h[8]=8;h[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc(8*33))),chunk('IEND',Buffer.alloc(0))]);}
async function setup(options={}){
  const bytes=png(),sha=await sha256(bytes),app=Buffer.from('synthetic-webp-predecoded'),appSHA=await sha256(app);
  const token='a'.repeat(43),clock=Date.parse('2026-10-20T13:00:00Z'),stamp=new Date(clock).toISOString();
  const entry={id:'1'.repeat(64),bucket:BUCKET,object_path:`spell/synthetic/${sha}.png`,sha256:sha,size_bytes:bytes.length,
    permanent_drive_file_id:'synthetic-drive-file',drive_sha256:sha,drive_complete_decode:true,drive_verified_at:stamp,
    dependencies_verified_at:stamp,app_verified_at:stamp,dependencies_clear:true,reference_paths_unchanged:true,workflow_idle:true,
    restore_plan_sha256:'2'.repeat(64),job_id:'synthetic-job',registry_table:'rule_spells',registry_field:'icon_path',registry_id:'synthetic-row',
    app_path:'hermes/spell/synthetic/image.webp',app_sha256:appSHA,app_bucket:'alea-hermes-public',app_size_bytes:app.length,...options.entry};
  const plan={schema:'skylla-approved-delete-pilot/v1',project_id:PROJECT,bucket:BUCKET,owner_approved:true,
    separate_approval_required_for_further_objects:true,approved_proposal_sha256:'3'.repeat(64),entries:[entry],...options.plan};
  plan.plan_sha256=await sha256(new TextEncoder().encode(JSON.stringify(plan.entries)));
  const capability={enabled:true,not_before:new Date(clock-1000).toISOString(),expires_at:new Date(clock+599000).toISOString(),
    token_sha256:await sha256(new TextEncoder().encode(token)),plan_sha256:plan.plan_sha256,...options.cap};
  let deleted=false,deletes=0;const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});assert.equal(opts.redirect,'error');assert.equal(opts.headers.apikey,'synthetic-server-only');
    if(opts.method==='DELETE'){
      deletes++;assert.equal(url,`https://${PROJECT}.supabase.co/storage/v1/object/${BUCKET}`);
      assert.deepEqual(JSON.parse(opts.body),{prefixes:[entry.object_path]});
      if(options.deleteError)throw Error('private-sensitive-upstream');
      deleted=true;return Response.json([{name:options.wrongDeleteName?'other.png':entry.object_path}]);
    }
    assert.equal(opts.method,'GET');
    if(url.includes('/hermes_jobs?select=id&'))return Response.json(options.pending?[{id:'running'}]:[]);
    if(url.includes('/hermes_jobs?'))return Response.json([{id:entry.job_id,status:options.changedJob?'processing':'active',source_path:entry.object_path,
      source_sha256:entry.sha256,app_path:entry.app_path,app_sha256:entry.app_sha256}]);
    if(url.includes('/rule_spells?'))return Response.json([{icon_path:options.changedRef?'changed.webp':entry.app_path}]);
    if(url.endsWith(entry.app_path))return new Response(options.changedApp?Buffer.from('changed'):app);
    assert.ok(url.endsWith('/'+entry.object_path));
    if(deleted||options.missing)return Response.json({statusCode:'404',error:'not_found'},{status:options.absenceStatus||400});
    if(options.readError)throw Error('private-sensitive-upstream');
    return new Response(options.corrupt?bytes.subarray(0,-8):options.badHash?Buffer.alloc(bytes.length):bytes);
  };
  const handler=createDeletePilotHandler({plan,capability,env:()=>options.noAuth?null:'synthetic-server-only',fetcher,now:()=>clock});
  const request=(action='delete',body={},headers={},method='POST')=>new Request('https://synthetic',{method,headers:{'content-type':'application/json',
    'x-skylla-capability':token,...headers},...(method==='POST'?{body:JSON.stringify({action,id:entry.id,plan_sha256:plan.plan_sha256,...body})}:{})});
  return {handler,request,calls,deletes:()=>deletes,entry};
}
test('deletes one exact approved path via Storage API and proves authenticated absence',async()=>{
  const s=await setup();const p=await (await s.handler(s.request())).json();assert.equal(p.status,'deleted_verified_absent');
  assert.equal(p.absent,true);assert.equal(p.source_proof.complete_decode,true);assert.equal(s.deletes(),1);
  assert.ok(!JSON.stringify(p).includes('synthetic-server-only'));
});
test('preflight is read only; absence check is read only',async()=>{
  const s=await setup();assert.equal((await (await s.handler(s.request('check'))).json()).status,'preflight_verified');
  assert.equal((await (await s.handler(s.request('absence'))).json()).absent,false);assert.equal(s.deletes(),0);
});
test('second call cannot delete twice',async()=>{
  const s=await setup();await s.handler(s.request());assert.equal((await (await s.handler(s.request())).json()).status,'skipped');assert.equal(s.deletes(),1);
});
for(const [name,options] of Object.entries({truncatedPNG:{corrupt:true},shaMismatch:{badHash:true},missing:{missing:true},
  missingAuth:{noAuth:true},interruptedRead:{readError:true},activeJob:{changedJob:true},queuedJob:{pending:true},
  referenceChanged:{changedRef:true},displayChanged:{changedApp:true},wrongCategory:{entry:{object_path:'symbol/other/a.png'}},
  staleDrive:{entry:{drive_verified_at:'2026-10-20T12:49:59Z'}},missingDrive:{entry:{permanent_drive_file_id:''}},
  backupRestoreMissing:{entry:{restore_plan_sha256:''}},ownerNotApproved:{plan:{owner_approved:false}},
  wrongBucket:{plan:{bucket:'alea-hermes-public'}},tooManyObjects:{plan:{entries:Array(6).fill({})}}})){
  test(`fails closed before deletion: ${name}`,async()=>{const s=await setup(options);const r=await s.handler(s.request());
    const p=await r.json();assert.notEqual(p.status,'deleted_verified_absent');assert.equal(s.deletes(),0);});
}
for(const [name,cap] of Object.entries({disabled:{enabled:false},expired:{expires_at:'2026-10-20T12:59:59Z'},
  excessiveWindow:{expires_at:'2026-10-20T13:20:00Z'},wrongPlan:{plan_sha256:'0'.repeat(64)}}))
  test(`capability rejected: ${name}`,async()=>{const s=await setup({cap});assert.equal((await s.handler(s.request())).status,503);assert.equal(s.calls.length,0);});
test('unknown id, injected path, browser origin, missing token and GET are rejected',async()=>{
  const s=await setup();for(const req of [s.request('delete',{id:'unapproved'}),s.request('delete',{path:'other.png'}),
    s.request('delete',{}, {origin:'https://browser'}),s.request('delete',{}, {'x-skylla-capability':''}),s.request('delete',{}, {},'GET')]){
    assert.ok((await s.handler(req)).status>=400);
  }assert.equal(s.deletes(),0);
});
test('interrupted DELETE is unknown and never blindly retried',async()=>{
  const s=await setup({deleteError:true});const p=await (await s.handler(s.request())).json();assert.equal(p.status,'outcome_unknown');
  assert.ok(!JSON.stringify(p).includes('private-sensitive'));await s.handler(s.request());assert.equal(s.deletes(),1);
});
test('unexpected delete result stops for reconciliation',async()=>{
  const s=await setup({wrongDeleteName:true});assert.equal((await (await s.handler(s.request())).json()).status,'outcome_unknown');assert.equal(s.deletes(),1);
});
test('partial batch: failed first object does not authorize a different object',async()=>{
  const s=await setup({badHash:true});await s.handler(s.request());assert.equal((await s.handler(s.request('delete',{id:'other-object'}))).status,403);assert.equal(s.deletes(),0);
});
