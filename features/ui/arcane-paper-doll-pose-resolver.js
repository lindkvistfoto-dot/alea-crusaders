/* SISYFOS — Swedish pose catalog and equipment resolver. Visual only. */
(function(root){
'use strict';
const families=[
 ['enhandssvard','Enhandsvärd',true],['ovriga_svard','Övriga svärd',true],
 ['dolkar','Dolkar',true],['yxor','Yxor',true],['klubbor_hammare','Klubbor och hammare',true],
 ['slagor_gissel','Slagor och gissel',true],['spjut','Spjut',true],
 ['stangvapen','Stångvapen',false],['stavar','Stavar',false],['pilbagar','Pilbågar',false],
 ['armborst','Armborst',false],['slungor','Slungor',true],['kastvapen','Kastvapen',true],
 ['bola','Bola',true],['piskor','Piskor',true],['blasror','Blåsrör',false],
 ['lasso','Lasso',false],['slagsmal','Slagsmål',false]
];
const normalize=x=>String(x??'').trim().toLowerCase().replace(/å/g,'a').replace(/ä/g,'a').replace(/ö/g,'o').replace(/[ -]+/g,'_');
const catalog=[{id:'standard',label:'Standard Front'}];
for(const [id,label,shieldable] of families){
 catalog.push({id,label});
 if(shieldable)catalog.push({id:id+'_shield',label:label+' och sköld'});
}
const POSES=Object.freeze(catalog.map(p=>Object.freeze(p)));
const POSE_KEYS=Object.freeze(POSES.map(p=>p.id));
const POSE_NAMES=Object.freeze(Object.fromEntries(POSES.map(p=>[p.id,p.label])));
const ALIASES=Object.freeze({enhandsvard:'enhandssvard',enhands_svard:'enhandssvard',dolk:'dolkar',stav:'stavar',pilbage:'pilbagar',yxa:'yxor',klubbor:'klubbor_hammare'});
const shieldable=new Set(families.filter(f=>f[2]).map(f=>f[0]));
const valid=new Set(families.map(f=>f[0]));
function poseFamily(cls){const key=normalize(cls);return ALIASES[key]|| (valid.has(key)?key:null)}
function fromCharacter(character){
 const eq=character?.currentEquipment||character?.data?.currentEquipment||{};
 const weapons=character?.weapons||character?.data?.weapons||[];
 const hands=[eq.rightHand,eq.leftHand].filter(Boolean);
 const equipped=hands.find(h=>h.kind==='weapon');
 const item=weapons.find(w=>String(w.equipId||w.id)===String(equipped?.itemId||''));
 return {weaponClass:item?.weaponClass||item?.skillId||null,handling:item?.handling||'',grip:equipped?.hands===2?'2H':equipped?.hands===1?'1H':'',hasShield:hands.some(h=>h.kind==='shield'),hasWeapon:!!equipped};
}
// The combat snapshot is authoritative for NPCs, enemies and monsters.
function fromCombatant(actor,weaponClasses={}){
 const profile=actor?.state?.attack_profile||{};
 const eq=profile.currentEquipment||{};
 const hands=[eq.rightHand,eq.leftHand].filter(Boolean);
 const equipped=hands.find(hand=>hand.kind==='weapon');
 const item=equipped?(profile.weapons||[]).find(weapon=>String(weapon.equipId||weapon.id||weapon.weapon_id||'')===String(equipped.itemId||'')):null;
 const name=String(item?.name||'').toLowerCase();
 const inferred=/svärd|sword/.test(name)?'enhandssvard':/dolk|dagger/.test(name)?'dolkar':/yxa|axe/.test(name)?'yxor':/spjut|spear/.test(name)?'spjut':null;
 const cls=item?.weaponClass||item?.weapon_class||item?.skillId||weaponClasses[String(item?.weapon_id||item?.weaponTypeId||'')]||inferred;
 return {weaponClass:cls,handling:item?.handling||'',grip:equipped?.hands===2?'2H':equipped?.hands===1?'1H':'',hasShield:hands.some(hand=>hand.kind==='shield'),hasWeapon:!!equipped};
}
function resolve(equipment={},availablePoseIds=[]){
 const available=new Set(availablePoseIds);
 const rawFamily=poseFamily(equipment.weaponClass);
 // One-handed swords share the same visual pose, regardless of skill group.
 const family=rawFamily;
 const handling=String(equipment.handling||'').toUpperCase();
 const grip=String(equipment.grip||'').toUpperCase();
 const twoHanded=grip==='2H'||(grip!=='1H'&&handling==='2H');
 const visualFamily=family==='ovriga_svard'&&!twoHanded?'enhandssvard':family;
 const shield=!!equipment.hasShield&&!twoHanded;
 const requested=visualFamily?(shield&&shieldable.has(visualFamily)?visualFamily+'_shield':visualFamily):equipment.hasWeapon===false?'slagsmal':'standard';
 const candidates=[requested,'standard'];
 const selected=[...new Set(candidates)].find(key=>available.has(key))||null;
 return Object.freeze({requestedPoseId:requested,poseId:selected,match:selected===requested?'exact':selected?'fallback':'missing',reason:family?'equipment':'unknown-or-unarmed',twoHanded});
}
// Normalize legacy text race names to rule_races IDs before fetching inherited poses.
// Exact IDs are preferred; aliases are only for established spelling variations.
function raceIdFor(actor={},races=[]){
 const raw=actor.race_id||actor.raceId||actor.race||actor.data?.race_id||actor.data?.race||'';
 const normalized=normalize(raw).replace(/_/g,'');
 if(!normalized)return null;
 const found=races.find(r=>normalize(r.id).replace(/_/g,'')===normalized)
  ||races.find(r=>normalize(r.name).replace(/_/g,'')===normalized);
 return found?.id||null;
}
// Fetch only the race's own published variants; paging/filtering stays in the database.
function racePoseQuery(raceId){
 if(!raceId)return null;
 return 'race_battle_poses?select=id,race_id,gender_variant,pose_key,image_path,base_key,mounting_profile,is_active,publication_status&race_id=eq.'+encodeURIComponent(raceId)+'&is_active=eq.true&publication_status=eq.published';
}
// Resolve pose inheritance by ownership, never by copying image assets.
// Player characters intentionally do not inherit racial poses.
function resolveHierarchy({actorType='character',equipment={},ownPoses=[],racePoses=[],gender='neutral'}={}){
 const requested=resolve(equipment,[]).requestedPoseId;
 const npcKinds=new Set(['npc','enemy','monster','character-npc','slp']);
 const isNpc=npcKinds.has(String(actorType).toLowerCase());
 const genderAliases={man:'male',male:'male',m:'male',kvinna:'female',female:'female',f:'female',kvinnlig:'female',manlig:'male',neutral:'neutral',okand:'neutral',unknown:'neutral'};
 const genderKey=genderAliases[normalize(gender)]||'neutral';
 const matches=(poses,key,variant)=>poses.find(p=>p&&p.pose_key===key&&p.is_active!==false&&(!p.publication_status||p.publication_status==='published')&&!!p.image_path&&(!variant||normalize(p.gender_variant||'neutral')===variant));
 const own=matches(ownPoses,requested)||matches(ownPoses,'standard');
 if(own)return Object.freeze({pose:own,source:'own',requestedPoseId:requested});
 if(isNpc){
  for(const key of [...new Set([requested,'standard'])]){
   for(const variant of [...new Set([genderKey,'neutral'])]){
    const pose=matches(racePoses,key,variant);
    if(pose)return Object.freeze({pose,source:'race',requestedPoseId:requested});
   }
  }
 }
 return Object.freeze({pose:null,source:'portrait-stand',requestedPoseId:requested});
}
root.aleaBattlePoseCatalog=Object.freeze({POSES,POSE_KEYS,POSE_NAMES,poseFamily,fromCharacter,fromCombatant,resolve,resolveHierarchy,raceIdFor,racePoseQuery});
})(globalThis);
