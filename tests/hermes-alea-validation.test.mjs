import {beforeAll,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {initializeImageMagick,ImageMagick,MagickColors,MagickColor,MagickFormat} from '@imagemagick/magick-wasm';
import {decodeImage} from '../supabase/functions/hermes-alea/codec.mjs';
import {validatePair,sha256} from '../supabase/functions/hermes-alea/validation.mjs';
import {createVerifyHandler} from '../supabase/functions/hermes-alea/handler.mjs';
beforeAll(async()=>initializeImageMagick(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')))));
function pair(color=MagickColors.Transparent){
 const source=ImageMagick.read(typeof color==='string'?new MagickColor(color):color,16,16,image=>image.write(MagickFormat.Png,b=>new Uint8Array(b)));
 const output=ImageMagick.read(source,image=>image.write(MagickFormat.WebP,b=>new Uint8Array(b)));
 return {source,output};
}
async function jobFor({source,output},kind='relief'){return {target_kind:kind,source_mime:'image/png',source_bytes:source.length,output_bytes:output.length,source_sha256:await sha256(source),output_sha256:await sha256(output)};}
it('fully decodes real PNG and WebP, preserves actual alpha',async()=>{
 const p=pair();const receipt=await validatePair(await jobFor(p),p.source,p.output,decodeImage);
 expect(receipt.width).toBe(16);expect(receipt.alpha_preserved).toBe(true);
});
it('preserves semitransparent alpha and rejects opaque reliefs',async()=>{
 const p=pair('rgba(100,50,20,0.5)');expect(decodeImage(p.source).alpha[0]).toBeGreaterThan(0);expect(decodeImage(p.source).alpha[0]).toBeLessThan(255);
 await expect(validatePair(await jobFor(p,'definition'),p.source,p.output,decodeImage)).resolves.toMatchObject({alpha_preserved:true});
 const opaque=pair(MagickColors.Red);await expect(validatePair(await jobFor(opaque),opaque.source,opaque.output,decodeImage)).rejects.toThrow('TRUE_ALPHA_REQUIRED');
});
it('rejects altered bytes, corrupt images, MIME spoofing and alpha removal',async()=>{
 const p=pair(),job=await jobFor(p);const wrong=p.output.slice();wrong[wrong.length-1]^=1;
 await expect(validatePair(job,p.source,wrong,decodeImage)).rejects.toThrow('HASH_MISMATCH');
 expect(()=>decodeImage(p.source.slice(0,24))).toThrow();
 await expect(validatePair({...job,source_mime:'image/jpeg'},p.source,p.output,decodeImage)).rejects.toThrow('INVALID_MIME');
 const opaque=pair(MagickColors.White);await expect(validatePair({...job,output_bytes:opaque.output.length,output_sha256:await sha256(opaque.output)},p.source,opaque.output,decodeImage)).rejects.toThrow('ALPHA_CHANGED');
});
it('does not call trusted APIs for unauthenticated requests or blocked origins',async()=>{
 let called=false;const handler=createVerifyHandler({env:()=>'',decode:decodeImage,fetcher:async()=>{called=true;throw Error('unexpected');}});
 expect((await handler(new Request('https://example.test',{method:'POST',body:'{}'}))).status).toBe(401);
 expect((await handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'}))).status).toBe(403);
 expect(called).toBe(false);
});
it('authenticates caller, verifies real bytes, and only then records a service receipt',async()=>{
 const p=pair(),job={...await jobFor(p),id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requested_by:'user',source_path:'user/job/original',output_path:'trophy/job.webp',state:'uploading',operation:'CREATE'};
 const calls=[];
 const handler=createVerifyHandler({env:k=>({SUPABASE_URL:'https://project.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'secret'}[k]),decode:decodeImage,fetcher:async(url,opt)=>{
  calls.push({url,opt});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'user'});
  if(url.includes('/hermes_alea_jobs?'))return Response.json([job]);
  if(url.endsWith('/hermes_alea_capabilities'))return Response.json({enabled:true});
  if(url.includes('/storage/v1/object/hermes-alea-originals/'))return new Response(p.source);
  if(url.includes('/storage/v1/object/hermes-alea-display/'))return new Response(p.output);
  if(url.endsWith('/hermes_alea_verify')){expect(opt.headers.Authorization).toBe('Bearer secret');return Response.json(null);}
  throw Error('UNEXPECTED');
 }});
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer caller'},body:JSON.stringify({job_id:job.id})}));
 expect(await response.json()).toEqual({verified:true});expect(calls.at(-1).url).toContain('hermes_alea_verify');
 expect(calls[1].opt.headers.Authorization).toBe('Bearer caller');
});
it('rejects oversized input before invoking a codec and rejects APNG animation metadata',async()=>{
 const source=new Uint8Array(12000001),output=new Uint8Array(1);
 await expect(validatePair({source_bytes:source.length,output_bytes:1},source,output,()=>{throw Error('CODEC_MUST_NOT_RUN')})).rejects.toThrow('INVALID_SIZE');
 const p=pair();const animated=new Uint8Array(p.source.length+20);animated.set(p.source.slice(0,33));
 new DataView(animated.buffer).setUint32(33,8);animated.set(new TextEncoder().encode('acTL'),37);animated.set(p.source.slice(33),53);
 expect(()=>decodeImage(animated)).toThrow('ANIMATION_NOT_SUPPORTED');
});
