// HERMES ALEA V1.1: presentation profiles are independent of ALEA object types.
// Server-side limits remain authoritative; larger profiles require a reviewed backend rollout.
export const DEFAULT_IMAGE_PROFILE=Object.freeze({
  maxBytes:12_000_000,maxWidth:2048,maxHeight:2048,maxPixels:4_194_304,
  requireAlpha:false,allowedMimeTypes:Object.freeze(['image/png','image/jpeg','image/webp'])
});
export function resolveImageProfile(profile={}){
  const value={...DEFAULT_IMAGE_PROFILE,...profile};
  for(const key of ['maxBytes','maxWidth','maxHeight','maxPixels']){
    if(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>DEFAULT_IMAGE_PROFILE[key])
      throw Error('Bildprofilen överskrider HERMES ALEA:s servergränser: '+key);
  }
  if(typeof value.requireAlpha!=='boolean')throw Error('Ogiltigt transparenskrav.');
  if(!Array.isArray(value.allowedMimeTypes)||!value.allowedMimeTypes.length||
    value.allowedMimeTypes.some(type=>!DEFAULT_IMAGE_PROFILE.allowedMimeTypes.includes(type)))
    throw Error('Ogiltiga bildformat i profilen.');
  return value;
}
