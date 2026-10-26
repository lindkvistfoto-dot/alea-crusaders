// Codec injected by the Edge entrypoint and tests. Never treats client metadata as proof.
export const MAX_BYTES=12_000_000;
export async function sha256(bytes){
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function validatePair(job,source,output,decode){
 if(source.length!==job.source_bytes||output.length!==job.output_bytes||!source.length||source.length>MAX_BYTES||!output.length||output.length>MAX_BYTES)throw Error('INVALID_SIZE');
 const [sourceHash,outputHash]=await Promise.all([sha256(source),sha256(output)]);
 if(sourceHash!==job.source_sha256||outputHash!==job.output_sha256)throw Error('HASH_MISMATCH');
 const a=await decode(source),b=await decode(output);
 if(a.mime!==job.source_mime||b.mime!=='image/webp')throw Error('INVALID_MIME');
 for(const img of [a,b])if(img.frames!==1||img.width<1||img.height<1||img.width>2048||img.height>2048||img.width*img.height>4194304)throw Error('INVALID_DIMENSIONS_OR_ANIMATION');
 if(a.width!==b.width||a.height!==b.height)throw Error('DIMENSIONS_CHANGED');
 let transparent=false;
 for(let i=0;i<a.alpha.length;i++){
  if(a.alpha[i]===0)transparent=true;
  if(a.alpha[i]!==b.alpha[i])throw Error('ALPHA_CHANGED');
 }
 if(job.target_kind==='relief'&&!transparent)throw Error('TRUE_ALPHA_REQUIRED');
 return {source_sha256:sourceHash,output_sha256:outputHash,source_bytes:source.length,output_bytes:output.length,source_mime:a.mime,width:b.width,height:b.height,alpha_preserved:true};
}
