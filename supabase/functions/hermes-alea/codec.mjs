import {ImageMagick,MagickFormat,MagickReadSettings,ResourceLimits} from '@imagemagick/magick-wasm';
export function decodeImage(bytes){
 // Select only allowed decoders; never dispatch SVG, delegates, URLs or arbitrary formats.
 let format;
 if(bytes[0]===137&&String.fromCharCode(...bytes.slice(1,4))==='PNG')format=MagickFormat.Png;
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)format=MagickFormat.Jpeg;
 else if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')format=MagickFormat.WebP;
 else throw Error('INVALID_MIME');
 // Reject animation markers even if a codec would read only its first frame.
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(format===MagickFormat.Png){
  for(let p=8;p+12<=bytes.length;){
   const size=view.getUint32(p);if(size>bytes.length-p-12)throw Error('CORRUPT_IMAGE');
   const type=String.fromCharCode(...bytes.slice(p+4,p+8));
   if(type==='acTL')throw Error('ANIMATION_NOT_SUPPORTED');
   p+=size+12;
  }
 }else if(format===MagickFormat.WebP){
  if(view.getUint32(4,true)+8!==bytes.length)throw Error('CORRUPT_IMAGE');
  for(let p=12;p+8<=bytes.length;){
   const size=view.getUint32(p+4,true);if(size>bytes.length-p-8)throw Error('CORRUPT_IMAGE');
   const type=String.fromCharCode(...bytes.slice(p,p+4));
   if(type==='ANIM'||type==='ANMF'||(type==='VP8X'&&(bytes[p+8]&2)))throw Error('ANIMATION_NOT_SUPPORTED');
   p+=8+size+(size%2);
  }
 }
 ResourceLimits.width=2048n;ResourceLimits.height=2048n;ResourceLimits.area=4194304n;
 ResourceLimits.memory=96n*1024n*1024n;ResourceLimits.disk=0n;ResourceLimits.listLength=2n;
 const settings=new MagickReadSettings();settings.format=format;
 return ImageMagick.readCollection(bytes,settings,images=>{
  if(images.length!==1)throw Error('ANIMATION_NOT_SUPPORTED');
  const image=images[0];image.autoOrient();
  if(image.width>2048||image.height>2048)throw Error('INVALID_DIMENSIONS');
  const alpha=new Uint8Array(image.width*image.height);
  if(!image.hasAlpha)alpha.fill(255);
  else image.getPixels(pixels=>{
   for(let y=0;y<image.height;y++){
    const row=pixels.toByteArray(0,y,image.width,1,'A');
    if(!row)throw Error('ALPHA_DECODE_FAILED');
    alpha.set(row,y*image.width);
   }
  });
  return {width:image.width,height:image.height,frames:1,mime:format===MagickFormat.Png?'image/png':format===MagickFormat.Jpeg?'image/jpeg':'image/webp',alpha};
 });
}
