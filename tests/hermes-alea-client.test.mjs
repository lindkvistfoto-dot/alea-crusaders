import {it,expect} from 'vitest';
import {createHermesAleaClient} from '../features/hermes-alea/client.js';
import {verifiedHonorImageUrl} from '../features/honors/honors-image-resolver.js';
const target={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',image_revision:0,image_asset_id:null};
function harness(fail=''){
 const calls=[];let meta;
 const client=createHermesAleaClient({storage:null,convert:async()=>new Blob(['webp'],{type:'image/webp'}),rpc:async(name,args)=>{
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
  storage:null,convert:async()=>new Blob(['not webp'],{type:'image/png'}),
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
