import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const magic=read('features/character/magic-items.js');
const app=read('legacy/app.js');
const html=read('index.html');
const css=read('features/character/magic-items.css');

function context(canEdit=true){
 let saves=0,renders=0,seq=0;
 const current={
  weapons:[{equipId:'w1',name:'Dödsbringaren',weaponTypeId:'ordinary_sword'}],
  armor:[{equipId:'a1',name:'Ringbrynja'}],
  shields:[{equipId:'s1',name:'Sköld'}],
  equipment:[{equipId:'e1',name:'Fackla',count:5}],
  currentEquipment:{leftHand:{kind:'weapon',itemId:'w1'}}
 };
 const inputs={
  cmpProperty:{value:'cast_spell'},
  cmpSpell:{value:'spell_eld'},
  cmpEg:{value:'3'},
  cmpCastMode:{value:'wearer'},
  cmpFixedFv:{value:'16'},
  cmpPsy:{value:'artifact'},
  cmpSummonCount:{value:'4'},
  cmpSummonCreature:{value:'Eldsalamander'},
  cmpMaxCharges:{value:'4'},
  cmpChargeCost:{value:'1'},
  cmpUses:{value:'1'},
  cmpBonus:{value:'0'},
  cmpTarget:{value:'fyra fria hex'},
  cmpDuration:{value:'4 SR'},
  cmpDetails:{value:'Frammanar fyra eldsalamandrar'},
  cmpActivation:{value:'action'},
  cmpTargetAttr:{value:''},
  currentEquipmentModal:{classList:{contains:()=>true}},
  skillModalTitle:{textContent:''},
  skillModalBody:{innerHTML:''},
  skillModal:{classList:{remove:()=>{}}}
 };
 const scope={
  current,
  canEditCharacter:()=>canEdit,
  equipmentItemCount:x=>Number(x.count??x.quantity??1),
  newEquipItemId:kind=>'unique_'+kind+'_'+(++seq),
  save:()=>saves++,
  renderEquipment:()=>renders++,
  renderWeapons:()=>renders++,
  document:{getElementById:id=>inputs[id]||null},
  ruleSpells:[{id:'spell_eld',name:'FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F)',spell_key:'frammana-skicka-bort-elementar-eld'}],
  window:{},
  alert:vi.fn(),
  askConfirm:vi.fn(async()=>true)
 };
 runInNewContext(magic,scope);
 return {scope,current,inputs,api:scope.window.aleaCharacterItemMagic,get saves(){return saves},get renders(){return renders}};
}

describe('Unika föremål med magiska egenskaper',()=>{
 it('ger varje privat föremål en egen Magisk-kryssruta utan att påverka grundregistret',()=>{
  for(const [kind,field] of [['weapon','weapontable'],['armor','armortable'],['shield','shieldtable'],['equipment','inventorytable']]){
   expect(app).toContain("aleaCharacterItemMagic?.control('"+kind+"'");
   expect(app).toContain("aleaCharacterItemMagic?.badge('"+kind+"'");
  }
  expect(html).toContain('features/character/magic-items.js?v=');
  expect(html).toContain('features/character/magic-items.css?v=');
  expect(css).toContain('.character-item-magic-control');
  expect(magic).not.toContain("dbJson('rule_weapons");
  expect(magic).not.toContain("dbJson('rule_armor_types");
 });
 it('låter bara ett exemplar av fem facklor bli magiskt och bevarar equipId',()=>{
  const t=context();
  t.scope.window.setCharacterItemMagical('equipment',0,true);
  expect(t.current.equipment).toHaveLength(2);
  expect(t.current.equipment[0]).toMatchObject({equipId:'e1',count:1,isMagical:true});
  expect(t.current.equipment[1]).toMatchObject({count:4,isMagical:undefined});
  expect(t.current.equipment[1].equipId).not.toBe('e1');
  expect(t.current.currentEquipment.leftHand.itemId).toBe('w1');
  expect(t.saves).toBe(1);
 });
 it('vapen, rustningar och sköldar får individuella markeringar',()=>{
  const t=context();
  t.scope.window.setCharacterItemMagical('weapon',0,true);
  t.scope.window.setCharacterItemMagical('armor',0,true);
  t.scope.window.setCharacterItemMagical('shield',0,true);
  expect(t.current.weapons[0].isMagical).toBe(true);
  expect(t.current.armor[0].isMagical).toBe(true);
  expect(t.current.shields[0].isMagical).toBe(true);
  expect(t.current.equipment[0].isMagical).toBeUndefined();
  expect(t.api.badge('weapon',0)).toContain('Magisk');
 });
 it('sparar Dödsbringaren med registrerad eldbesvärjelse och exakt fyra eldsalamandrar',()=>{
  const t=context();
  t.scope.window.setCharacterItemMagical('weapon',0,true);
  t.scope.window.saveCharacterItemPower('weapon',0,-1);
  const [power]=t.current.weapons[0].magicPowers;
  expect(power.property_key).toBe('cast_spell');
  expect(power.spell_id).toBe('spell_eld');
  expect(power.spell_key).toBe('frammana-skicka-bort-elementar-eld');
  expect(power.summon_count).toBe(4);
  expect(power.summon_creature).toBe('Eldsalamander');
  expect(power.effect_grade).toBe(3);
  expect(power.charge_cost).toBe(1);
  expect(power.uses_per_day).toBe(1);
  expect(t.api.summary(t.current.weapons[0])).toContain('FRAMMANA');
  expect(t.saves).toBe(2);
 });
 it('kräver en verklig besvärjelse när föremålet ska kasta magi',()=>{
  const t=context();
  t.scope.window.setCharacterItemMagical('weapon',0,true);
  t.inputs.cmpSpell.value='not-a-spell';
  t.scope.window.saveCharacterItemPower('weapon',0,-1);
  expect(t.scope.alert).toHaveBeenCalledWith(expect.stringContaining('Välj en besvärjelse'));
  expect(t.current.weapons[0].magicPowers).toHaveLength(0);
 });
 it('låter inte obehöriga spelare ändra magin',()=>{
  const t=context(false);
  t.scope.window.setCharacterItemMagical('weapon',0,true);
  expect(t.current.weapons[0].isMagical).toBeUndefined();
  expect(t.saves).toBe(0);
 });
});
