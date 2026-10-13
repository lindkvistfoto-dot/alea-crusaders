import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const admin=read('legacy/app.js');
const slice=(start,end)=>{
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a+start.length);
 if(a<0||b<0)throw Error('Combat loadout function missing: '+start);
 return runtime.slice(a,b);
};
const normalizedCode=slice('function combatNpcNormalizeProfile(','function combatSourceStats(');
const normalize=profile=>{
 const env={};runInNewContext(normalizedCode+'\nthis.normalize=combatNpcNormalizeProfile;',env);
 return env.normalize(profile);
};

describe('Handutrustning and ambidexterity on SLP, enemies and monsters',()=>{
 it('equips two distinct weapons, even if both reference the same master weapon',()=>{
  const result=normalize({
   ambidextrous:true,
   weapons:[
    {equipId:'sword-1',name:'Kortsvärd',weapon_id:'master-sword',fv:12,hand:'right'},
    {equipId:'sword-2',name:'Kortsvärd',weapon_id:'master-sword',fv:9,hand:'left'},
    {equipId:'spare',name:'Dolk',fv:11,hand:'none'}
   ]
  });
  expect(result.currentEquipment.rightHand.itemId).toBe('sword-1');
  expect(result.currentEquipment.leftHand.itemId).toBe('sword-2');
  expect(result.currentEquipment.rightHand.itemId).not.toBe(result.currentEquipment.leftHand.itemId);
  expect(result.ambidextrous).toBe(true);
  expect(result.weapons).toHaveLength(3);
 });
 it('equips a shield in its declared hand, leaving spare weapons out of the reaction',()=>{
  const result=normalize({
   weapons:[{equipId:'axe',name:'Yxa',hand:'right'}, {equipId:'spare',name:'Dolk',hand:'none'}],
   shields:[{equipId:'round-shield',name:'Rundsköld',fv:13,hand:'left'}]
  });
  expect(result.currentEquipment.rightHand).toMatchObject({kind:'weapon',itemId:'axe'});
  expect(result.currentEquipment.leftHand).toMatchObject({kind:'shield',itemId:'round-shield'});
 });
 it('supports legal two-handed grip with both slots occupied by one item',()=>{
  const result=normalize({
   weapons:[{equipId:'staff',name:'Stav',hand:'both',handling:'2H'}, {equipId:'dagger',name:'Dolk',hand:'left'}],
   shields:[{equipId:'shield',name:'Sköld',fv:10,hand:'right'}]
  });
  expect(result.currentEquipment.leftHand).toMatchObject({kind:'weapon',itemId:'staff',hands:2});
  expect(result.currentEquipment.rightHand).toMatchObject({kind:'weapon',itemId:'staff',hands:2});
 });
 it('offers backwards-compatible defaults for old NPC profiles without hand metadata',()=>{
  const weaponAndShield=normalize({weapons:[{name:'Kortsvärd',fv:10}],shields:[{name:'Liten sköld',fv:11}]});
  expect(weaponAndShield.currentEquipment.rightHand).toMatchObject({kind:'weapon',itemId:'npc-weapon-0'});
  expect(weaponAndShield.currentEquipment.leftHand).toMatchObject({kind:'shield',itemId:'npc-shield-0'});
  const twoWeapons=normalize({weapons:[{name:'Svärd',fv:12},{name:'Dolk',fv:9}]});
  expect(twoWeapons.currentEquipment.rightHand.itemId).toBe('npc-weapon-0');
  expect(twoWeapons.currentEquipment.leftHand.itemId).toBe('npc-weapon-1');
 });
 it('respects explicitly unequipped inventory without inventing held weapons',()=>{
  const profile=normalize({
   weapons:[{name:'Reservsvärd',hand:'none'}],
   shields:[{name:'Sköld',fv:13,hand:'none'}]
  });
  expect(profile.currentEquipment.leftHand).toBeNull();
  expect(profile.currentEquipment.rightHand).toBeNull();
 });
 it('restricts an enemy to independently equipped weapons for actual attack selection',()=>{
  const profile=normalize({ambidextrous:true,weapons:[
   {equipId:'right',hand:'right',name:'Svärd',fv:14,weaponCategory:'melee'},
   {equipId:'left',hand:'left',name:'Dolk',fv:8,weaponCategory:'melee'},
   {equipId:'backpack',hand:'none',name:'Klubba',fv:20,weaponCategory:'melee'}
  ]});
  const env={combatAttackProfile:()=>profile,combatWeaponProjectileKey:()=>'',combatAmmoStock:()=>0};
  runInNewContext(slice('function combatWeaponCategory(','function combatWeaponKey(')+
   '\nthis.weapons=combatAvailableWeapons;',env);
  const selected=env.weapons({source_type:'monster',state:{}},'melee');
  expect(selected.map(w=>w.equipId)).toEqual(['right','left']);
  expect(selected.map(w=>w.fv)).toEqual([14,8]);
 });
 it('offers only the equipped shield and both legal weapons for parrying',()=>{
  const profile=normalize({weapons:[
   {equipId:'right',hand:'right',name:'Svärd',fv:14,weaponCategory:'melee'},
   {equipId:'left',hand:'left',name:'Dolk',fv:9,weaponCategory:'melee'},
   {equipId:'backpack',hand:'none',name:'Klubba',fv:20,weaponCategory:'melee'}
  ]});
  const env={
   combatAttackProfile:()=>profile,
   combatAvailableWeapons:()=>profile.weapons.filter(w=>['right','left'].includes(w.equipId)),
   combatNumber:(value,fallback)=>value==null?fallback:Number(value),
   combatAttackFv:w=>w.fv,combatWeaponKey:w=>w.equipId
  };
  runInNewContext(slice('function combatParryOptions(','async function combatExpertRoll(')+
   '\nthis.parry=combatParryOptions;',env);
  const options=env.parry({source_type:'monster'});
  expect(options.map(o=>o.key)).toEqual(['weapon:right','weapon:left']);
 });
 it('provides editable hand placements, a shield, and ambidextrous flag in NPC admin',()=>{
  for(const method of ['setAdminNpcWeaponHand','setAdminNpcShieldHand','npcHandSelect'])expect(admin).toContain('function '+method+'(');
  expect(admin).toContain('id="npcAmbidextrous"');
  expect(admin).toContain('id="npcShieldHand"');
  expect(admin).toContain('equipId:r.equipId||crypto.randomUUID()');
  expect(admin).toContain('out.ambidextrous=');
  expect(runtime).toContain('name="ambidextrous"');
  expect(runtime).toContain('name="shield_hand"');
  expect(runtime).toContain('data-w="hand"');
 });
});
