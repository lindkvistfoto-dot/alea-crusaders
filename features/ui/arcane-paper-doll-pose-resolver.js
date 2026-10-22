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
const ALIASES=Object.freeze({enhandsvard:'enhandssvard',enhands_svard:'enhandssvard',dolk:'dolkar',stav:'stavar',pilbage:'pilbagar',yxa:'yxor',klubbor:'klubbor_hammare'});
const shieldable=new Set(families.filter(f=>f[2]).map(f=>f[0]));
const valid=new Set(families.map(f=>f[0]));
function poseFamily(cls){const key=normalize(cls);return ALIASES[key]|| (valid.has(key)?key:null)}
function fromCharacter(character){
 const eq=character?.currentEquipment||character?.data?.currentEquipment||{};
 const weapons=character?.weapons||character?.data?.weapons||[];
 const hands=[eq.leftHand,eq.rightHand].filter(Boolean);
 const equipped=hands.find(h=>h.kind==='weapon');
 const item=weapons.find(w=>String(w.equipId||w.id)===String(equipped?.itemId||''));
 return {weaponClass:item?.weaponClass||item?.skillId||null,handling:item?.handling||'',grip:equipped?.hands===2?'2H':equipped?.hands===1?'1H':'',hasShield:hands.some(h=>h.kind==='shield'),hasWeapon:!!equipped};
}
function resolve(equipment={},availablePoseIds=[]){
 const available=new Set(availablePoseIds);
 const family=poseFamily(equipment.weaponClass);
 const handling=String(equipment.handling||'').toUpperCase();
 const grip=String(equipment.grip||'').toUpperCase();
 const twoHanded=handling==='2H'||(handling==='1-2H'&&grip==='2H');
 const shield=!!equipment.hasShield&&!twoHanded;
 const requested=family?(shield&&shieldable.has(family)?family+'_shield':family):'standard';
 const candidates=[requested];
 if(requested.endsWith('_shield'))candidates.push(family);
 candidates.push('standard');
 const selected=[...new Set(candidates)].find(key=>available.has(key))||null;
 return Object.freeze({requestedPoseId:requested,poseId:selected,match:selected===requested?'exact':selected?'fallback':'missing',reason:family?'equipment':'unknown-or-unarmed',twoHanded});
}
root.aleaBattlePoseCatalog=Object.freeze({POSES,poseFamily,fromCharacter,resolve});
})(globalThis);
