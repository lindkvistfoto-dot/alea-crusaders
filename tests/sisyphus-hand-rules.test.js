import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ctx={};runInNewContext(read('src/features/combat/hand-rules.js'),ctx);
const rules=ctx.aleaHandRules;
const sword={equipId:'sword',weaponTypeId:'master-sword',name:'Bastardsvärd',handling:'1-2H',strengthGroup:4,weaponCategory:'melee',fv:18};
const dagger={equipId:'dagger',weaponTypeId:'master-dagger',name:'Dolk',handling:'1H',strengthGroup:1,weaponCategory:'melee',fv:16};
function profile(overrides={}){
 return {swordHand:'rightHand',weapons:[{...sword},{...dagger}],shields:[],equipment:[],
  skills:[{skillId:'tva_vapen',fv:22,specializations:[{swordWeaponId:'master-sword',shieldWeaponId:'master-dagger'}]}],
  currentEquipment:{rightHand:{kind:'weapon',itemId:'sword'},leftHand:{kind:'weapon',itemId:'dagger'}},...overrides};
}
const resolve=(p,group=5,disabled=[])=>rules.resolveHands(p,group,()=>null,disabled);

describe('SISYPHUS hand preference and SQL-defined grip',()=>{
 it.each([['Höger','rightHand'],['Vänster','leftHand'],['Båda','both'],['Ambidextriös','both'],
  ['Vänsterhänt','leftHand'],['högerhänt','rightHand'],['left','leftHand'],['rightHand','rightHand'],['','rightHand'],[null,'rightHand']])('%s normalizes to %s',(raw,expected)=>expect(rules.swordHand(raw)).toBe(expected));
 it('retains NPC ambidexterity but explicit character preference takes precedence',()=>{
  expect(rules.swordHand(null,true)).toBe('both');expect(rules.swordHand('Höger',true)).toBe('rightHand');
 });
 it.each([
  ['1H',5,true,1,1],['1H',4,true,1,1],['1H',3,true,1,.5],['1H',2,false,1,0],
  ['2H',5,true,2,1],['2H',4,true,2,1],['2H',3,true,2,.5],['2H',2,false,2,0],
  ['1-2H',6,true,1,1],['1-2H',5,true,1,1],['1-2H',4,true,2,1],['1-2H',3,true,2,.5],['1-2H',2,false,2,0]
 ])('%s at STY group %s: usable %s, hands %s, GL %s',(handling,group,canUse,hands,glMultiplier)=>
  expect(rules.grip(handling,4,group)).toMatchObject({canUse,hands,glMultiplier}));
 it.each([null,undefined,'',-1,1.5,'bad'])('rejects invalid strength group %s',group=>expect(rules.grip('1H',4,group).canUse).toBe(false));
 it('does not treat missing master strength as group zero',()=>{
  const p=profile();p.weapons[0].strengthGroup=null;
  const h=resolve(p);expect(h.hands.rightHand.linked).toBe(false);
  expect(rules.twoWeapons(p,h).eligible).toBe(false);
 });
});

describe('SISYPHUS authoritative, dynamically resolved equipment',()=>{
 it('allows Bastardsvärd + Dolk only at sufficient strength and never mutates refs',()=>{
  const p=profile(),before=JSON.stringify(p);
  expect(resolve(p,5).weapons).toHaveLength(2);
  expect(resolve(p,4).weapons).toHaveLength(0);
  expect(resolve(p,4).issues[0]).toContain('båda händerna');
  expect(JSON.stringify(p)).toBe(before);
 });
 it('reserves both hands for a single 2H weapon without creating a second weapon',()=>{
  const p=profile({currentEquipment:{rightHand:{kind:'weapon',itemId:'sword'},leftHand:null}});
  const h=resolve(p,4);expect(h.weapons).toHaveLength(1);
  expect(h.hands.leftHand.grip.hands).toBe(2);expect(h.hands.leftHand.virtual).toBe(true);
  expect(rules.twoWeapons(p,h).eligible).toBe(false);
 });
 it('releases a legacy duplicated reference only in the calculated 1H view',()=>{
  const ref={kind:'weapon',itemId:'sword',hands:2,primaryHand:'leftHand'};
  const p=profile({currentEquipment:{rightHand:{...ref},leftHand:{...ref}}}),before=JSON.stringify(p);
  const h=resolve(p,5);expect(h.hands.rightHand).toBe(null);expect(h.hands.leftHand.item.equipId).toBe('sword');
  expect(JSON.stringify(p)).toBe(before);
 });
 it('allows normal sword/shield but a shield is never a second weapon',()=>{
  const p=profile({shields:[{equipId:'shield',name:'Sköld',fv:15}],currentEquipment:{rightHand:{kind:'weapon',itemId:'sword'},leftHand:{kind:'shield',itemId:'shield'}}});
  expect(resolve(p).shields).toHaveLength(1);expect(resolve(p).weapons).toHaveLength(1);
  expect(rules.twoWeapons(p,resolve(p)).eligible).toBe(false);
  expect(resolve(p,4).shields).toHaveLength(0);
 });
 it.each(['sword','dagger'])('removes dropped or broken %s without changing inventory',disabled=>{
  const p=profile(),h=resolve(p,5,[disabled]);expect(h.weapons).toHaveLength(1);
  expect(h.weapons[0].equipId).not.toBe(disabled);expect(p.weapons).toHaveLength(2);
  expect(rules.twoWeapons(p,h).eligible).toBe(false);
 });
 it('does not invent an inventory weapon when both hands are empty',()=>{
  const p=profile({currentEquipment:{rightHand:null,leftHand:null}});
  expect(resolve(p).weapons).toHaveLength(0);
 });
 it('keeps an offhand dagger available with the dominant hand empty',()=>{
  const p=profile({currentEquipment:{rightHand:null,leftHand:{kind:'weapon',itemId:'dagger'}}});
  expect(resolve(p).weapons.map(w=>w.equipId)).toEqual(['dagger']);
 });
});

describe('SISYPHUS Två vapen specializations, orientation and FV',()=>{
 it('caps each weapon at the trained specialization FV',()=>{
  const p=profile();p.skills[0].specializations[0].fv=14;
  const c=rules.twoWeapons(p,resolve(p));expect(c.eligible).toBe(true);expect(c.trained).toBe(true);
  expect(rules.actionFv(18,c)).toBe(14);expect(rules.actionFv(9,c)).toBe(9);
 });
 it('applies -15 to skill FV for an untrained combination',()=>{
  const p=profile();p.skills[0].specializations=[];
  const c=rules.twoWeapons(p,resolve(p));expect(c.eligible).toBe(true);expect(c.modifier).toBe(-15);
  expect(rules.actionFv(18,c)).toBe(7);
 });
 it.each([{skills:[]},{skills:[{skillId:'tva_vapen',fv:0}]},{skills:[{skillId:'tva_vapen',fv:''}]}])('never grants an extra action without training (%j)',({skills})=>{
  const p=profile({skills,ambidextrous:true});expect(rules.twoWeapons(p,resolve(p)).eligible).toBe(false);
 });
 it('orders a left-handed combination by actual sword/shield hands',()=>{
  const p=profile({swordHand:'leftHand'}),c=rules.twoWeapons(p,resolve(p));
  expect(c.firstWeapon.equipId).toBe('dagger');expect(c.trained).toBe(false);
  p.skills[0].specializations=[{swordWeaponId:'master-dagger',shieldWeaponId:'master-sword'}];
  expect(rules.twoWeapons(p,resolve(p)).trained).toBe(true);
 });
 it('lets an ambidextrous character select either first hand with the same specialization',()=>{
  const p=profile({swordHand:'both',ambidextrous:true});
  for(const hand of ['rightHand','leftHand']){
   const c=rules.twoWeapons(p,resolve(p),hand);expect(c.firstHand).toBe(hand);expect(c.trained).toBe(true);
  }
 });
 it('movement/magic or spent slots cannot be turned into another available secondary action',()=>{
  const rows=[{slot_key:'primary',status:'resolved'},{slot_key:'secondary',status:'planned'}];
  expect(rules.remainingActions(rows,true)).toHaveLength(1);
  expect(rules.remainingActions(rows,false)).toHaveLength(0);
  expect(rules.remainingActions([{slot_key:'primary',status:'reserved'}])).toHaveLength(1);
 });
});
