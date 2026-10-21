/* Metadata bridge only. This does not extend the publisher's allowed kinds or activate an asset. */
(function(api){
 'use strict';
 function readHermesCandidate(metadata,{assetId,bucket,path,layouts=[]}={}){
  if(!metadata||metadata.schema!==1||typeof metadata.app_file!=='string'||
   !metadata.app_file.endsWith('/'+metadata.app_sha256+'.webp'))return null;
  // Reuse HERMES prepare_bytes fields. Drive/archive/source metadata stays outside the client manifest.
  const asset={id:assetId,bucket,path,app_sha256:metadata.app_sha256,app_bytes:metadata.app_bytes,
   width:metadata.width,height:metadata.height,alpha_preserved:metadata.alpha_preserved===true,
   status:'draft',verified:false,layouts:JSON.parse(JSON.stringify(api.list(layouts)))};
  return api.validAsset({...asset,status:'active',verified:true})?asset:null;
 }
 Object.assign(api,{readHermesCandidate});
})(globalThis.AleaBattleArt);
