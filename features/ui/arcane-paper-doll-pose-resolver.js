/* OPERATION ARCANE PAPER DOLL — pure equipment-to-pose resolver.
 * Visual only: never changes equipment, rules or combat state.
 * Character-specific asset lookup is deliberately left to the caller.
 */
export const POSES=Object.freeze([
  ['standard','Standard Front'],['sword','Svärd'],['sword_shield','Svärd och sköld'],
  ['two_handed_sword','Tvåhandssvärd'],['dagger','Dolk'],['dagger_shield','Dolk och sköld'],
  ['axe','Yxa'],['axe_shield','Yxa och sköld'],['two_handed_axe','Tvåhandsyxa'],
  ['spear','Spjut'],['spear_shield','Spjut och sköld'],['staff','Stav'],
  ['bow','Pilbåge'],['crossbow','Armborst'],['sling','Slunga'],
  ['club','Klubba'],['club_shield','Klubba och sköld'],['unarmed','Obeväpnad']
].map(([id,label])=>Object.freeze({id,label})));
export const POSE_IDS=Object.freeze(POSES.map(p=>p.id));
const CLASS_FAMILY=Object.freeze({
  enhandsvard:'sword',enhands_svard:'sword',ovriga_svard:'sword',tva_hands_svard:'two_handed_sword',
  dolkar:'dagger',dolk:'dagger',enhandsyxor:'axe',yxor:'axe',tvahandsyxor:'two_handed_axe',
  spjut:'spear',stavar:'staff',stav:'staff',pilbagar:'bow',armborst:'crossbow',
  slungor:'sling',klubbor:'club',stridshammare:'club'
});
const TWO_HANDED=new Set(['two_handed_sword','two_handed_axe','bow','crossbow','staff']);
const SHIELDABLE=new Set(['sword','dagger','axe','spear','club']);
const norm=x=>String(x??'').trim().toLowerCase().replace(/[åä]/g,'a').replace(/ö/g,'o').replace(/[ -]+/g,'_');
export function poseFamily(weaponClass){
  const key=norm(weaponClass);
  return CLASS_FAMILY[key]||null;
}
/** Input: {weaponClass,hasShield,handling,grip}; availablePoseIds are this combatant's uploaded poses. */
export function resolveBattlePose(equipment={},availablePoseIds=[]){
  const available=new Set(availablePoseIds);
  const family=poseFamily(equipment.weaponClass);
  const shield=!!equipment.hasShield;
  const grip=String(equipment.grip||'').toUpperCase();
  const handling=String(equipment.handling||'').toUpperCase();
  let wanted=family||'standard';
  if(family==='sword' && (grip==='2H'||(handling==='2H'&&!shield)))wanted='two_handed_sword';
  if(family==='axe' && (grip==='2H'||(handling==='2H'&&!shield)))wanted='two_handed_axe';
  if(shield&&SHIELDABLE.has(wanted))wanted+='_shield';
  const candidates=[wanted];
  if(wanted.endsWith('_shield'))candidates.push(wanted.slice(0,-7));
  if(wanted==='two_handed_sword')candidates.push('sword');
  if(wanted==='two_handed_axe')candidates.push('axe');
  candidates.push('standard');
  const selected=candidates.find(id=>available.has(id))||null;
  return Object.freeze({requestedPoseId:wanted,poseId:selected,match:selected===wanted?'exact':selected?'fallback':'missing',reason:family?'equipment':'unknown_weapon_class'});
}
