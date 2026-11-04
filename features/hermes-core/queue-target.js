// HERMES CORE queue targets are resolved through trusted, repository-owned profiles.
import {CORE_APP_IMAGE_KINDS,LEGACY_KIND_PROFILES,resolveCoreImageProfile} from "./app-image-targets.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYSTEM=/^[a-z0-9][a-z0-9_.-]*$/;
const APP_KEY=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CORE_TARGET_KINDS=Object.freeze(["system","honor-definition","honor-relief",...CORE_APP_IMAGE_KINDS,"app-image"]);

function normalizeTarget(kind, id, profileId, material) {
 const profile = profileId ? resolveCoreImageProfile(profileId) : null;
 const profileTargetKind = CORE_APP_IMAGE_KINDS.includes(kind) ? "app-image" : kind;
 if (CORE_APP_IMAGE_KINDS.includes(kind) && profileId !== LEGACY_KIND_PROFILES[kind])
  throw new Error("CORE_PROFILE_TARGET_MISMATCH");
 if (profileId && (!profile || profile.kind !== profileTargetKind)) throw new Error("CORE_PROFILE_TARGET_MISMATCH");
 const supported = ["system","honor-definition","honor-relief"].includes(kind) ||
  (kind === "app-image" && profile?.kind === "app-image") ||
  CORE_APP_IMAGE_KINDS.includes(kind);
 if (!supported) throw new Error("CORE_TARGET_KIND_UNSUPPORTED");
 const validId=kind==="system"?SYSTEM.test(id||"")
  :kind==="honor-definition"||kind==="honor-relief"?UUID.test(id||"")
  :APP_KEY.test(id||"");
 if(typeof id!=="string"||!validId)throw new Error("INVALID_CORE_TARGET_ID");
 if(kind==="honor-relief"&&!["enamel","metal","wood","stone","other"].includes(material))
  throw new Error("INVALID_RELIEF_MATERIAL");
 return {kind,id,...(profileId?{profile_id:profileId}:{}),...(material?{material}:{})};
}

export function normalizeCoreQueueTarget(request){
 if(!request||typeof request!=="object"||Array.isArray(request))throw new Error("INVALID_CORE_REQUEST");
 if(request.schema===1){
  if(typeof request.asset_key!=="string"||!SYSTEM.test(request.asset_key))throw new Error("INVALID_ASSET_KEY");
  return {kind:"system",id:request.asset_key,profile_id:"unrestricted-system",label:request.label};
 }
 if(request.schema!==2&&request.schema!==3)throw new Error("UNSUPPORTED_CORE_SCHEMA");
 const incoming=request.target?{...request.target}:null;
 if(!incoming||typeof incoming!=="object"||Array.isArray(incoming))throw new Error("CORE_TARGET_REQUIRED");
 if(incoming.kind==="honor-relief")incoming.material=({"metal_relief":"metal","carved_wood":"wood"})[incoming.material]??incoming.material;
 let kind=incoming.kind;
 let profileId=incoming.profile_id;
 if(request.schema===3){
  if(incoming.kind!=="profile")throw new Error("CORE_PROFILE_TARGET_REQUIRED");
  if(typeof profileId!=="string")throw new Error("CORE_PROFILE_REQUIRED");
  const profile=resolveCoreImageProfile(profileId);
  if(!profile)throw new Error("CORE_PROFILE_UNSUPPORTED");
  kind=profile.kind;
 } else if(CORE_APP_IMAGE_KINDS.includes(kind)){
  profileId=profileId??({
   spell:"spell-icon","spell-cutout":"spell-cutout","spell-illustration":"spell-illustration-square",
   "spell-illustration-wide":"spell-illustration-wide",symbol:"symbol-icon",skill:"skill-icon",
   "skill-illustration":"skill-illustration-square","skill-illustration-wide":"skill-illustration-wide"
  })[kind];
 } else if(kind==="system") {
  profileId=profileId??"unrestricted-system";
 } else if(kind==="honor-definition"||kind==="honor-relief") {
  profileId=profileId??kind;
 }
 const target=normalizeTarget(kind,incoming.id,profileId,incoming.material);
 return {...target,label:request.label};
}
