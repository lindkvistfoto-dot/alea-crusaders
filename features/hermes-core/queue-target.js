// HERMES CORE queue target normalization. Database target adapters remain explicit.
import {CORE_APP_IMAGE_KINDS} from "./app-image-targets.js";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYSTEM=/^[a-z0-9][a-z0-9_.-]*$/;
const APP_KEY=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CORE_TARGET_KINDS=Object.freeze(["system","honor-definition","honor-relief",...CORE_APP_IMAGE_KINDS]);
export function normalizeCoreQueueTarget(request){
 if(!request||typeof request!=="object"||Array.isArray(request))throw new Error("INVALID_CORE_REQUEST");
 if(request.schema===1){
  if(typeof request.asset_key!=="string"||!SYSTEM.test(request.asset_key))throw new Error("INVALID_ASSET_KEY");
  return {kind:"system",id:request.asset_key,label:request.label};
 }
 if(request.schema!==2)throw new Error("UNSUPPORTED_CORE_SCHEMA");
 const target=request.target?{...request.target}:null;
 if(target?.kind==="honor-relief")target.material=({"metal_relief":"metal","carved_wood":"wood"})[target.material]??target.material;
 if(!target||typeof target!=="object"||Array.isArray(target))throw new Error("CORE_TARGET_REQUIRED");
 if(!CORE_TARGET_KINDS.includes(target.kind))throw new Error("CORE_TARGET_KIND_UNSUPPORTED");
 const validId=target.kind==="system"?SYSTEM.test(target.id||"")
  :target.kind==="honor-definition"||target.kind==="honor-relief"?UUID.test(target.id||"")
  :APP_KEY.test(target.id||"");
 if(typeof target.id!=="string"||!validId)throw new Error("INVALID_CORE_TARGET_ID");
 if(target.kind==="honor-relief"&&target.material!==undefined&&!["enamel","metal","wood","stone","other"].includes(target.material))throw new Error("INVALID_RELIEF_MATERIAL");
 return {kind:target.kind,id:target.id,label:request.label,...(target.material?{material:target.material}:{})};
}
