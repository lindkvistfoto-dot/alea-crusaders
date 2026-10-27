// HERMES CORE: derive publication metadata from the actual WebP bytes.
// Browser-native APIs only; no WASM or secondary image engine.
export async function inspectCoreWebP(webp) {
 if(!webp || webp.type!=='image/webp' || !webp.size) throw new Error('Invalid WebP');
 const bytes=new Uint8Array(await webp.arrayBuffer());
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const sha256=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
 const bitmap=await createImageBitmap(webp);
 try {
  const canvas=document.createElement('canvas');
  canvas.width=bitmap.width; canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap,0,0);
  const rgba=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
  let alphaPreserved=false;
  for(let i=3;i<rgba.length;i+=4) {
   if(rgba[i]<255) {alphaPreserved=true;break;}
  }
  return {sha256,bytes:webp.size,width:bitmap.width,height:bitmap.height,alphaPreserved};
 } finally {bitmap.close();}
}
