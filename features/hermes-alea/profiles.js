// HERMES ALEA V1.1: presentation profiles are independent of ALEA object types.
// Server-side limits remain authoritative; larger profiles require a reviewed backend rollout.
export const DEFAULT_IMAGE_PROFILE=Object.freeze({
  maxBytes:12_000_000,maxWidth:2048,maxHeight:2048,maxPixels:4_194_304,
  requireAlpha:false,allowedMimeTypes:Object.freeze(['image/png','image/jpeg','image/webp'])
});
export const BATTLE_POSE_IMAGE_PROFILE=Object.freeze({
 ...DEFAULT_IMAGE_PROFILE,kind:'battle-pose',maxWidth:4096,maxHeight:4096,maxPixels:16_777_216,
 requireAlpha:true,allowedMimeTypes:Object.freeze(['image/png','image/webp']),outputMaxEdge:1280,quality:.85
});
export function resolveImageProfile(profile={}){
  const value={...DEFAULT_IMAGE_PROFILE,...profile};
 const ceiling=profile.kind==='battle-pose'?BATTLE_POSE_IMAGE_PROFILE:DEFAULT_IMAGE_PROFILE;
  for(const key of ['maxBytes','maxWidth','maxHeight','maxPixels']){
    if(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>ceiling[key])
      throw Error('Bildprofilen överskrider HERMES ALEA:s servergränser: '+key);
  }
  if(typeof value.requireAlpha!=='boolean')throw Error('Ogiltigt transparenskrav.');
  if(!Array.isArray(value.allowedMimeTypes)||!value.allowedMimeTypes.length||
    value.allowedMimeTypes.some(type=>!DEFAULT_IMAGE_PROFILE.allowedMimeTypes.includes(type)))
    throw Error('Ogiltiga bildformat i profilen.');
  return value;
}
