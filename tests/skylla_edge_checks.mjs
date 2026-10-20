import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createHandler, decodePNG, sha256, crc32, boundedBody, PROJECT, BUCKET} from '../supabase/functions/skylla-verify/core.mjs';
import {verifySkyllaPlan, createAleaSkyllaClient} from '../scripts/skylla_operator_verify.mjs';
const test = globalThis.Deno ? (name,fn) => Deno.test(name,fn) : nodeTest;

const chunk = (type, data) => {
  const out = Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length); out.write(type,4); out.set(data,8);
  out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);
  return out;
};
function fixture({channels=4,filter=0,brokenZlib=false,huge=false}={}) {
  const width=8, height=8, row=width*channels;
  const pixels=Buffer.from(Array.from({length:row*height},(_,i)=>(i*7+19)&255));
  const raw=Buffer.alloc((row+1)*height);
  for(let y=0;y<height;y++) {
    raw[y*(row+1)]=filter;
    for(let x=0;x<row;x++) {
      const at=y*row+x, a=x>=channels?pixels[at-channels]:0,
        b=y?pixels[at-row]:0, c=y&&x>=channels?pixels[at-row-channels]:0;
      const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
      const predict=[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:c][filter]||0;
      raw[y*(row+1)+x+1]=(pixels[at]-predict)&255;
    }
  }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=channels===4?6:2;
  const compressed=deflateSync(huge?Buffer.alloc(10000):raw);
  if(brokenZlib) compressed[compressed.length-1]^=255;
  return {bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',compressed),chunk('IEND',Buffer.alloc(0))]),pixels};
}
for(const channels of [3,4]) for(let filter=0;filter<5;filter++) test(`decode reconstructs ${channels} channels, filter ${filter}`,async()=>{
  const {bytes,pixels}=fixture({channels,filter}); const p=await decodePNG(bytes);
  assert.equal(p.complete_decode,true);assert.equal(p.pixel_sha256,await sha256(pixels));
  assert.equal(p.color_mode,channels===4?'RGBA':'RGB');
});
test('truncation, CRC, trailing bytes, invalid filter, zlib checksum and inflate overflow fail',async()=>{
  const {bytes}=fixture(); const bad=Buffer.from(bytes);bad[44]^=1;
  for(const raw of [bytes.subarray(0,-5),bad,Buffer.concat([bytes,Buffer.from([1])]),fixture({filter:5}).bytes,
    fixture({brokenZlib:true}).bytes,fixture({huge:true}).bytes]) await assert.rejects(decodePNG(raw));
});
test('unsupported PNG modes and missing/duplicate IHDR fail',async()=>{
  const {bytes}=fixture(); const header=Buffer.from(bytes.subarray(16,29));header[12]=1;
  await assert.rejects(decodePNG(Buffer.concat([bytes.subarray(0,8),chunk('IHDR',header),bytes.subarray(33)])));
  await assert.rejects(decodePNG(Buffer.concat([bytes.subarray(0,33),bytes.subarray(8)])));
  await assert.rejects(decodePNG(Buffer.concat([bytes.subarray(0,8),bytes.subarray(33)])));
});

const operator='12345678-1234-1234-1234-123456789abc';
const jwt='Bearer synthetic-operator-jwt-never-a-real-key';
async function setup({envOverride={},user=operator,admin=true,storage,planEdit,fetchError=false}={}) {
  const {bytes}=fixture(); const sha=await sha256(bytes);
  const entry={id:'a'.repeat(64),bucket:BUCKET,object_path:`spell/synthetic/${sha}.png`,sha256:sha,size_bytes:bytes.length,
    permanent_drive_file_id:'synthetic-drive-archive',drive_sha256:sha,drive_complete_decode:true};
  const plan={schema:'skylla-server-allowlist/v1',project_id:PROJECT,entries:[entry]};
  plan.plan_sha256=await sha256(new TextEncoder().encode(JSON.stringify(plan.entries)));
  if(planEdit) await planEdit(plan);
  const current=Date.parse('2026-10-20T12:00:00Z');
  const vars={SKYLLA_ENABLED:'true',SKYLLA_ENABLED_FROM:'2026-10-20T11:55:00Z',SKYLLA_ENABLED_UNTIL:'2026-10-20T12:10:00Z',
    SKYLLA_OPERATOR_ID:operator,SKYLLA_OPERATOR_ORIGIN:'https://synthetic.example',SUPABASE_ANON_KEY:'synthetic-anon',
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only',...envOverride};
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    if(fetchError) throw Error('sensitive-upstream-response-do-not-reflect');
    if(url.endsWith('/auth/v1/user')) return Response.json({id:user});
    if(url.includes('/rest/v1/profiles?')) {
      assert.equal(options.headers.authorization,jwt);return Response.json([{id:operator,is_admin:admin}]);
    }
    assert.equal(url,`https://${PROJECT}.supabase.co/storage/v1/object/authenticated/${BUCKET}/${entry.object_path}`);
    assert.equal(options.headers.authorization,'Bearer synthetic-server-only');
    return storage?storage(bytes):new Response(bytes);
  };
  const handler=createHandler({plan,env:k=>vars[k],fetcher,now:()=>current});
  const request=(body={id:entry.id,plan_sha256:plan.plan_sha256},headers={},method='POST')=>new Request('https://function.synthetic',{
    method,headers:{authorization:jwt,'content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  return {handler,request,calls,plan,entry,bytes};
}
test('server verifies actual bytes and Drive hash without exposing bytes/keys or authorizing deletion',async()=>{
  const s=await setup();const r=await s.handler(s.request());assert.equal(r.status,200);
  const p=await r.json();assert.equal(p.sha256,s.entry.sha256);assert.equal(p.complete_decode,true);
  assert.equal(p.safe_to_delete,false);assert.equal(p.deletion_authorized,false);
  assert.equal(p.permanent_drive_file_id,s.entry.permanent_drive_file_id);assert.equal(s.calls.length,3);
  assert.equal(JSON.stringify(p).includes('synthetic-server-only'),false);
});
for(const envOverride of [
  {SKYLLA_ENABLED:undefined},{SKYLLA_ENABLED_UNTIL:'2026-10-20T11:59:59Z'},
  {SKYLLA_ENABLED_FROM:'2026-10-20T12:01:00Z'},{SKYLLA_ENABLED_FROM:'2026-10-20T10:00:00Z'},
  {SKYLLA_ENABLED_FROM:'nonsense'},
]) test(`disabled/expired/invalid window blocks all upstream calls ${JSON.stringify(envOverride)}`,async()=>{
  const s=await setup({envOverride});assert.equal((await s.handler(s.request())).status,503);assert.equal(s.calls.length,0);
});
test('missing bearer, missing UUID, wrong user and non-admin cannot read Storage',async()=>{
  for(const config of [{envOverride:{SKYLLA_OPERATOR_ID:undefined}},{user:'other-user'},{admin:false},{}]) {
    const s=await setup(config);const r=await s.handler(s.request(undefined, Object.keys(config).length?{}:{authorization:''}));
    assert.ok([401,403].includes(r.status));assert.equal(s.calls.some(c=>c.url.includes('/storage/')),false);
  }
});
test('Auth failure and upstream messages are sanitized',async()=>{
  const s=await setup({fetchError:true});const r=await s.handler(s.request());
  assert.equal(r.status,422);assert.equal((await r.text()).includes('sensitive'),false);
  assert.equal(s.calls.length,1);
});
test('caller cannot change path, bucket, expected hash, plan, action or URL',async()=>{
  const s=await setup();
  for(const body of [{id:'b'.repeat(64),plan_sha256:s.plan.plan_sha256},
    {id:s.entry.id,plan_sha256:'0'.repeat(64)},
    ...['bucket','object_path','sha256','action','url'].map(key=>({id:s.entry.id,plan_sha256:s.plan.plan_sha256,[key]:'forbidden'}))]) {
    assert.ok([400,403].includes((await s.handler(s.request(body))).status));
  }
  assert.equal(s.calls.some(c=>c.url.includes('/storage/')),false);
});
test('forged bundled hash or bucket blocks Storage',async()=>{
  for(const planEdit of [p=>{p.entries[0].sha256='0'.repeat(64);},async p=>{
    p.entries[0].bucket='display-images';p.plan_sha256=await sha256(new TextEncoder().encode(JSON.stringify(p.entries)));
  }]) {
    const s=await setup({planEdit});assert.equal((await s.handler(s.request())).status,503);
    assert.equal(s.calls.some(c=>c.url.includes('/storage/')),false);
  }
});
test('missing, truncated, wrong SHA, oversized and interrupted source are blocked',async()=>{
  for(const storage of [()=>new Response('',{status:404}),b=>new Response(b.subarray(0,-1)),b=>{
    const bad=Buffer.from(b);bad[45]^=1;return new Response(bad);
  },b=>new Response(Buffer.concat([b,b])),b=>new Response(new ReadableStream({start(c){c.enqueue(b.subarray(0,4));c.error(Error('interrupted-secret'));}}))]) {
    const s=await setup({storage});const r=await s.handler(s.request());assert.equal(r.status,422);
    assert.equal((await r.json()).safe_to_delete,false);
  }
});
test('one failed object does not convert later success into a delete approval',async()=>{
  const s=await setup({storage:(()=>{let i=0;return b=>++i===1?new Response('',{status:503}):new Response(b);})()});
  assert.equal((await s.handler(s.request())).status,422);
  const good=await s.handler(s.request());assert.equal(good.status,200);assert.equal((await good.json()).safe_to_delete,false);
});
test('cross-origin, non-POST, oversized and malformed requests fail',async()=>{
  const s=await setup();assert.equal((await s.handler(s.request(undefined,{origin:'https://evil.synthetic'}))).status,403);
  assert.equal((await s.handler(s.request(undefined,{},'DELETE'))).status,405);
  assert.equal((await s.handler(s.request({id:'a'.repeat(600)}))).status,422);
  assert.equal((await s.handler(new Request('https://function.synthetic',{method:'POST',headers:{authorization:jwt,'content-type':'application/json'},body:'{bad'}))).status,422);
  assert.equal(s.calls.some(c=>c.url.includes('/storage/')),false);
});
test('bounded stream detects declared length mismatch',async()=>{
  await assert.rejects(boundedBody(new Response(new Uint8Array(3),{headers:{'content-length':'4'}}),8));
});
test('operator runner uses existing client session, retains partial results and never sends paths/keys',async()=>{
  const s=await setup();const plan={...s.plan,entries:[s.entry,{...s.entry,id:'b'.repeat(64)}]};
  const calls=[], saved=[];
  const client={functions:{invoke:async(name,options)=>{
    calls.push({name,options});assert.equal(name,'skylla-verify');
    assert.deepEqual(Object.keys(options.body).sort(),['id','plan_sha256']);
    if(calls.length===1) return {data:await (await s.handler(s.request())).json(),error:null};
    throw Error('sensitive-transport-failure');
  }}};
  const report=await verifySkyllaPlan(client,plan,{onReceipt:r=>saved.push(r)});
  assert.equal(calls.length,2);assert.equal(report.receipts[0].status,'verified_complete');
  assert.equal(report.receipts[1].status,'blocked');assert.equal(report.safe_to_delete,false);
  assert.equal(saved.length,2);assert.equal(JSON.stringify(report).includes('sensitive'),false);
});
test('operator runner blocks forged receipt and cancellation starts no further requests',async()=>{
  const s=await setup();let calls=0;
  const client={functions:{invoke:async()=>{calls++;return {data:{status:'verified_complete'},error:null};}}};
  assert.equal((await verifySkyllaPlan(client,s.plan)).receipts[0].status,'blocked');
  const cancelled=await verifySkyllaPlan(client,s.plan,{signal:AbortSignal.abort()});
  assert.equal(cancelled.receipts.length,0);assert.equal(calls,1);
});
test('Alea operator adapter refreshes its own session and pins the exact function',async()=>{
  let refreshed=0,requests=0;
  const client=createAleaSkyllaClient({getToken:async()=>{refreshed++;return 'synthetic-own-session';},
    getPublishableKey:()=> 'synthetic-public-key', fetcher:async(url,options)=>{
      requests++; assert.equal(url,`https://${PROJECT}.supabase.co/functions/v1/skylla-verify`);
      assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer synthetic-own-session');
      return Response.json({ok:true});
    }});
  const body={id:'a'.repeat(64),plan_sha256:'b'.repeat(64)};
  assert.equal((await client.functions.invoke('skylla-verify',{body})).error,null);
  await assert.rejects(client.functions.invoke('hermes-v2',{body}));
  await assert.rejects(client.functions.invoke('skylla-verify',{body:{...body,action:'delete'}}));
  assert.equal(refreshed,1);assert.equal(requests,1);
});
test('operator stops on access/expiry failure without repeating the whole manifest',async()=>{
  const s=await setup();let calls=0;
  const client={functions:{invoke:async()=>{calls++;return {data:null,error:{stop_batch:true}};}}};
  const result=await verifySkyllaPlan(client,{...s.plan,entries:[s.entry,s.entry,s.entry]});
  assert.equal(calls,1);assert.equal(result.receipts.length,1);assert.equal(result.receipts[0].status,'blocked');
});
test('explicit per-object verification failure retains later read-only results',async()=>{
  const s=await setup();const good=await (await s.handler(s.request())).json();let calls=0;
  const client={functions:{invoke:async()=>++calls===1?{data:null,error:{stop_batch:false}}:{data:good,error:null}}};
  const result=await verifySkyllaPlan(client,{...s.plan,entries:[s.entry,s.entry]});
  assert.equal(result.receipts[0].status,'blocked');assert.equal(result.receipts[1].status,'verified_complete');
});
