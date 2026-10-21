import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

export const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
export function createApi(){
 const context={URL};
 for(const name of ['contracts','owners','loadout','resolver','delivery','hermes']){
  runInNewContext(read('features/battle-art/'+name+'.js'),context,{filename:name+'.js'});
 }
 return context.AleaBattleArt;
}
export const id=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
export const flags={battlePoses:true};
export const rules=[
 {id:id(10),name:'Svärd',category:'melee',handling:'1H',skill_id:'same-skill'},
 {id:id(11),name:'Dolk',category:'melee',handling:'1H',skill_id:'same-skill'},
 {id:id(12),name:'Båge',category:'projectile',handling:'2H',projectile_key:'arrow'},
 {id:id(13),name:'Stav',category:'melee',handling:'2H'},
 {id:id(14),name:'Kastkniv',category:'thrown',handling:'1H',projectile_key:'knife'}
];
export const ref=(kind,itemId,hands=1)=>({kind,itemId,hands});
export function profile(){return {
 weapons:[{equipId:'sword',weapon_id:id(10),weaponCategory:'melee'},{equipId:'dagger',weaponTypeId:id(11),category:'melee'},
  {equipId:'bow',weapon_id:id(12),weaponCategory:'projectile'},{equipId:'staff',weapon_id:id(13),category:'melee'},
  {equipId:'sword2',weapon_id:id(10),category:'melee'},{equipId:'knife',weapon_id:id(14),category:'thrown'}],
 shields:[{equipId:'shield',shield_id:id(20),name:'Sköld'}],
 equipment:[{equipId:'lantern',name:'Lykta'}],projectiles:[],
 currentEquipment:{rightHand:ref('weapon','sword'),leftHand:ref('shield','shield')}
}}
export function asset(n=100){return {
 id:id(n),status:'active',verified:true,bucket:'campaign-actor-images',path:'battle-art/synthetic/'+n+'.webp',
 app_sha256:'a'.repeat(64),app_bytes:2048,width:900,height:1000,alpha_preserved:true,
 layouts:[{profile:'single-v1',shape:'single',facing:null,anchor:{x:450,y:900},groundWidthPx:200,groundWidthHex:1,scale:1}]
}}
export function declaration(loadout){return Object.fromEntries(['rightHand','leftHand'].map(name=>{
 const hand=loadout.hands[name];
 return [name,hand.kind==='empty'?{kind:'empty'}:{kind:hand.kind,masterId:hand.masterId,
  ...(hand.masterId?{}:{instanceId:hand.instanceId}),...(hand.kind==='weapon'?{grip:hand.grip,category:hand.category}:{})}];
}))}
export function fixture(api=createApi()){
 const loadout=api.readBattleLoadout(profile(),{}, {ruleWeapons:rules});
 const pose={id:id(200),kind:'battle_pose',role:'specific',status:'active',verified:true,reviewed:true,
  posture:'standing',view:'front',supportedFacings:[],fallbackFacings:[0,1,2,3,4,5],assetId:id(100),
  loadouts:[declaration(loadout)],baseMode:'embedded',shadowMode:'baked'};
 const manifest={contractVersion:1,setId:id(30),versionId:id(31),revision:1,status:'active',
  owner:{characterId:id(1)},campaignId:id(2),combatantId:id(3),accessKey:'member:synthetic:v1',
  slots:[pose],assets:[asset(),asset(101),asset(102),asset(103)],
  portrait:{assetId:id(101),reviewed:true,equipmentNeutral:true},
  systemArt:{'arcane-portrait-stand':id(102),'arcane-paper-doll-hexagon-base':id(103)}};
 const request={owner:{...manifest.owner},campaignId:manifest.campaignId,combatantId:manifest.combatantId,
  accessKey:manifest.accessKey,visible:true,loadout,manifest,posture:'standing',shape:'single',facing:null};
 return {api,loadout,pose,manifest,request};
}
export function freeze(value){
 if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}
 return value;
}
export function combatContext(extra={}){
 const source=read('features/combat/runtime.js');
 const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const context={...extra,combatEffectiveAttribute:()=>null,combatNumber:(n,f)=>n==null?f:Number(n)};
 runInNewContext(slice('function combatNpcNormalizeProfile(','function combatSourceStats(')+
  slice('function combatAttackProfile(','function combatWeaponCategory(')+
  '\nthis.authority={attackProfile:combatAttackProfile,normalizeNpc:combatNpcNormalizeProfile};',context);
 return context;
}
