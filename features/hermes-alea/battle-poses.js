import {createHermesAleaClient} from './client.js';
import {BATTLE_POSE_IMAGE_PROFILE} from './profiles.js';

// Adapter only: authentication, conversion, intents and verification stay in ALEA.
export function createBattlePoseUploader({rpc,request,storage}){
 storage=storage===undefined?globalThis.sessionStorage:storage;
 const attempts=new Map();
 const client=createHermesAleaClient({rpc,request,storage,targetPolicies:{
  'combatant-pose':BATTLE_POSE_IMAGE_PROFILE,'race-pose':BATTLE_POSE_IMAGE_PROFILE
 }});
 return {async upload(args){
  if(!args.file?.size||args.file.size>BATTLE_POSE_IMAGE_PROFILE.maxBytes)throw Error('Cutouten får vara högst 12 MB.');
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await args.file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const key='alea:pose-upload:'+args.targetKind+':'+args.target.id+':'+sha;
  let target=attempts.get(key);
  try{target=target||JSON.parse(storage?.getItem(key)||'null');}catch{}
  target=target||{id:args.target.id,image_revision:args.target.image_revision||0,image_path:args.target.image_path||null};
  attempts.set(key,target);try{storage?.setItem(key,JSON.stringify(target));}catch{}
  const result=await client.upload({...args,target});
  attempts.delete(key);try{storage?.removeItem(key);}catch{}
  return result;
 }};
}
