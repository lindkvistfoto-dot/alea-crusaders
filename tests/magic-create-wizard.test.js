import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../features/character/magic-create.js',import.meta.url),'utf8');
const artifactId='a1111111-1111-4111-8111-111111111111';
const propertyId='b1111111-1111-4111-8111-111111111111';
const spellId='c1111111-1111-4111-8111-111111111111';
function context(type='weapon',templateId=artifactId){
 let seq=0,saves=0;
 const character={weapons:[],armor:[],shields:[],equipment:[]};
 const input={
  magicCreateType:{value:type},
  magicCreateBase:{value:type==='weapon'?'sword-id':''},
  magicCreateName:{value:type==='weapon'?'Dödsbringaren':'Nattens amulett'},
  magicCreateTemplate:{value:templateId}
 };
 const template={id:artifactId,name:'Dödsbringaren',item_type:'weapon',
  base_kind:'weapon',base_item_id:'sword-id',max_charges:null,active:true};
 const power={id:'p1',artifact_id:artifactId,property_id:propertyId,
  spell_id:spellId,effect_grade:1,effect_multiplier:4,
  cast_mode:'fixed',fixed_fv:5,recharge_rule:'next_day',
  charge_cost:0,activation:'action',active:true};
 const scope={
  current:character,
  canEditCharacter:()=>true,
  activeUser:()=>({admin:true}),
  newEquipItemId:kind=>kind+'-'+(++seq),
  save:()=>saves++,
  renderWeapons:()=>{},
  renderEquipment:()=>{},
  copyRuleWeaponToInstance:(target,rule)=>({...target,weaponTypeId:rule.id,name:rule.name}),
  applyCharacterShieldMaster:(target,rule)=>({...target,shieldTypeId:rule.id,name:rule.name}),
  ruleWeapons:[{id:'sword-id',name:'Bastardsvärd'}],
  ruleArmorTypes:[],
  ruleShields:[],
  ruleSpells:[{id:spellId,name:'FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F)',spell_key:'frammana-skicka-bort-elementar-eld'}],
  window:{
   aleaEquipmentCatalog:{all:()=>[]},
   aleaMagicArtifacts:{all:()=>[template]},
   aleaMagicProperties:{powersFor:()=>[power],
    definitionFor:()=>({property_key:'cast_spell',name:'Kasta besvärjelse',kind:'spell'})},
   openCharacterItemPowers:vi.fn(),
   editCharacterItemPower:vi.fn(async()=>{})
  },
  alert:vi.fn(),
  document:{getElementById:id=>input[id]||null}
 };
 runInNewContext(code,scope);
 return {scope,input,character,template,power,get saves(){return saves}};
}
describe('Skapa magiskt föremål',()=>{
 it('instansierar mallens besvärjelse med unika ID och oberoende återhämtning',async()=>{
  const t=context();await t.scope.window.aleaCharacterMagicCreate.create();
  const [item]=t.character.weapons;
  expect(item.name).toBe('Dödsbringaren');
  expect(item.weaponTypeId).toBe('sword-id');
  expect(item.isMagical).toBe(true);
  expect(item.magicPowers).toHaveLength(1);
  expect(item.magicPowers[0]).toMatchObject({
   effect_grade:1,effect_multiplier:4,fixed_fv:5,
   recharge_rule:'next_day',spell_id:spellId,last_used_day:null
  });
  expect(item.magicPowers[0].id).not.toBe(t.power.id);
  expect(t.scope.window.openCharacterItemPowers).toHaveBeenCalledWith('weapon',0);
  t.power.effect_multiplier=7;
  expect(item.magicPowers[0].effect_multiplier).toBe(4);
  expect(t.saves).toBe(1);
 });
 it('kan skapa en helt egen amulett utan grundföremål eller specialkod',async()=>{
  const t=context('amulet','');await t.scope.window.aleaCharacterMagicCreate.create();
  expect(t.character.equipment).toHaveLength(1);
  expect(t.character.equipment[0]).toMatchObject({
   itemSubtype:'amulet',isMagical:true,name:'Nattens amulett',count:1
  });
  expect(t.scope.window.editCharacterItemPower).toHaveBeenCalledWith('equipment',0,-1);
 });
});
