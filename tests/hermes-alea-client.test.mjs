import {it,expect} from 'vitest';
import {createHermesAleaClient} from '../features/hermes-alea/client.js';
import {verifiedHonorImageUrl} from '../features/honors/honors-image-resolver.js';
const target={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',image_revision:0,image_asset_id:null};
function harness(fail=''){
 const calls=[];let meta;
 const client=createHermesAleaClient({storage:null,targetPolicies:{definition:{},relief:{requireAlpha:true}},convert:async()=>new Blob(['webp'],{type:'image/webp'}),rpc:async(name,args)=>{
  calls.push(name);
  if(name==='hermes_alea_begin'){meta=args.request;return {id:target.id,state:'uploading',source_path:'user/job/original',output_path:'trophy/job.webp'};}
  if(name==='hermes_alea_finalize')return {id:target.id,state:'activated',result_revision:1};
  if(name==='hermes_alea_remove')return {state:'removed',result_revision:1};
 },request:async(path)=>{calls.push(path);return path.includes(fail)&&fail?Response.json({error:'TEST_FAILURE'},{status:500}):Response.json({verified:true});}});
 return {client,calls,getMeta:()=>meta};
}
it('creates intent before either upload, then verifies before finalize without Actions',async()=>{
 const h=harness();const result=await h.client.upload({targetKind:'definition',target,file:new Blob(['original'],{type:'image/png'})});
 expect(result.state).toBe('activated');expect(h.calls).toEqual(['hermes_alea_begin','/storage/v1/object/hermes-alea-display/trophy/job.webp','/storage/v1/object/hermes-alea-originals/user/job/original','/functions/v1/hermes-alea','hermes_alea_finalize']);
 expect(h.getMeta().source_sha256).not.toBe(h.getMeta().output_sha256);
});
it('failed original upload never finalizes or changes caller target',async()=>{
 const h=harness('hermes-alea-originals');const t={...target,image_asset_id:'old'};
 await expect(h.client.upload({targetKind:'definition',target:t,file:new Blob(['source'],{type:'image/png'})})).rejects.toThrow();
 expect(h.calls).not.toContain('hermes_alea_finalize');expect(t.image_asset_id).toBe('old');expect(h.getMeta().operation).toBe('REPLACE');
});
it('repeated attempts reuse idempotency and REMOVE never sends storage requests',async()=>{
 const h=harness();const file=new Blob(['source'],{type:'image/png'});await h.client.upload({targetKind:'definition',target,file});const key=h.getMeta().idempotency_key;
 await h.client.upload({targetKind:'definition',target,file});expect(h.getMeta().idempotency_key).toBe(key);
 h.calls.length=0;await h.client.remove({targetKind:'definition',target});expect(h.calls).toEqual(['hermes_alea_remove']);
});
it('accepts only the dedicated signed display path while preserving old image resolver',()=>{
 const asset={asset_key:'hermes-alea:'+target.id,hermes_alea_signed_path:'/object/sign/hermes-alea-display/trophy/'+target.id+'.webp?token=abc.xyz'};
 expect(verifiedHonorImageUrl(asset)).toContain('/storage/v1/object/sign/hermes-alea-display/');
 expect(verifiedHonorImageUrl({...asset,hermes_alea_signed_path:'https://evil.test/image.webp'})).toBeNull();
 expect(verifiedHonorImageUrl({asset_path:'hermes/system-asset/test/a.webp'})).toContain('/object/public/alea-hermes-public/');
});

it('rejects invalid output from an injected converter before creating a job',async()=>{
 const calls=[];
 const client=createHermesAleaClient({
  storage:null,targetPolicies:{definition:{},relief:{requireAlpha:true}},convert:async()=>new Blob(['not webp'],{type:'image/png'}),
  rpc:async name=>{calls.push(name);throw Error('unexpected rpc');},
  request:async()=>{throw Error('unexpected request');}
 });
 await expect(client.upload({targetKind:'definition',target,file:new Blob(['source'],{type:'image/png'})})).rejects.toThrow(/giltig WebP/);
 expect(calls).toEqual([]);
});
it('rejects profile violations before creating an upload intent',async()=>{
 const h=harness();
 await expect(h.client.upload({targetKind:'definition',target,file:new Blob(['source'],{type:'image/png'}),profile:{allowedMimeTypes:['image/jpeg']}})).rejects.toThrow(/bildprofilen/);
 expect(h.calls).toEqual([]);
});

it('rejects unregistered ALEA image target before RPC or storage',async()=>{
 const h=harness();
 await expect(h.client.upload({targetKind:'character_portrait',target,file:new Blob(['source'],{type:'image/png'})})).rejects.toThrow(/Spara posten/);
 await expect(h.client.remove({targetKind:'character_portrait',target})).rejects.toThrow(/Okänd bildplats/);
 expect(h.calls).toEqual([]);
});

it('adapter alpha requirement cannot be disabled by caller profile',async()=>{
 let passed;
 const client=createHermesAleaClient({
  storage:null,
  targetPolicies:{relief:{requireAlpha:true}},
  convert:async(_file,options)=>{passed=options;throw Error('TEST_STOP');},
  rpc:async()=>{throw Error('RPC_NOT_EXPECTED');},
  request:async()=>{throw Error('REQUEST_NOT_EXPECTED');}
 });
 await expect(client.upload({targetKind:'relief',target,file:new Blob(['x'],{type:'image/png'}),profile:{requireAlpha:false}})).rejects.toThrow('TEST_STOP');
 expect(passed.requireAlpha).toBe(true);
});
it('caller cannot widen adapter size or accepted MIME types',async()=>{
 const h=harness();
 await expect(h.client.upload({targetKind:'definition',target,file:new Blob(['1234'],{type:'image/png'}),profile:{maxBytes:2}})).rejects.toThrow(/bildprofilen/);
 expect(h.calls).toEqual([]);
 const calls=[];
 const client=createHermesAleaClient({
  storage:null,targetPolicies:{definition:{allowedMimeTypes:['image/png']}},
  convert:async()=>{calls.push('convert');throw Error('SHOULD_NOT_CONVERT');},
  rpc:async()=>{calls.push('rpc');throw Error('SHOULD_NOT_RPC');},
  request:async()=>{calls.push('request');throw Error('SHOULD_NOT_REQUEST');}
 });
 await expect(client.upload({targetKind:'definition',target,file:new Blob(['jpeg'],{type:'image/jpeg'}),profile:{allowedMimeTypes:['image/jpeg']}})).rejects.toThrow(/bildformat/);
 expect(calls).toEqual([]);
});

it('reports progress and completes only after verification and finalize',async()=>{
 const h=harness();const stages=[];
 await h.client.upload({targetKind:'definition',target,file:new Blob(['source'],{type:'image/png'}),onStatus:s=>stages.push(s)});
 expect(stages).toEqual(['preparing','uploading','verifying','activating','completed']);
});
it('verification timeout never finalizes or reports completion',async()=>{
 const calls=[];const stages=[];
 const client=createHermesAleaClient({
  storage:null,targetPolicies:{definition:{}},convert:async()=>new Blob(['webp'],{type:'image/webp'}),
  rpc:async(name)=>{calls.push(name);return {id:target.id,state:'uploading',source_path:'user/job/original',output_path:'trophy/job.webp'};},
  request:async(path,options={})=>{
   calls.push(path);
   if(path.includes('/functions/v1/hermes-alea'))return new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
   });
   return Response.json({ok:true});
  }
 });
 await expect(client.upload({targetKind:'definition',target,file:new Blob(['source'],{type:'image/png'}),verificationTimeoutMs:5,onStatus:s=>stages.push(s)})).rejects.toThrow(/tog för lång tid/);
 expect(calls).not.toContain('hermes_alea_finalize');
 expect(stages).not.toContain('completed');
});
