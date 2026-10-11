import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const configurator=read('features/equipment/magic-configurator.js');
const projection=read('features/character/item-spells.js');
const runtime=read('features/combat/runtime.js');
const characterUI=read('features/character/magic-items.js');
const artifactUI=read('features/equipment/magic-properties.js');
const migration=read('supabase/migrations/20261011150000_magic_battery_property.sql');
const spell={id:'eld',name:'ELD (F)',spell_key:'eld',kvick:false,damage_text:'1T6 per EG'};
const battery={id:'p1',property_key:'magic_battery',kind:'spell',
 battery_grade_mode:'chosen',battery_grade_dice:'1T3',activation:'action',
 cast_mode:'fixed',fixed_fv:null,psy_source:'none',effect_grade:1,charge_cost:0};
function fixture(){
 const root={window:{}};
 runInNewContext(configurator+'\n'+projection,root);
 return {magic:root.window.aleaMagicConfigurator,spells:root.window.aleaItemSpells,window:root.window};
}
function snippet(begin,end){
 const i=runtime.indexOf(begin),j=runtime.indexOf(end,i);
 if(i<0||j<=i)throw Error('Runtime section missing: '+begin);
 return runtime.slice(i,j);
}
describe('Magiskt batteri på unika föremål',()=>{
 it('registrerar en återanvändbar egenskap i både admin och föremålsvyn',()=>{
  expect(migration).toContain("'magic_battery','Magiskt batteri','spell'");
  expect(migration).toContain("power_key<>'magic_battery'");
  expect(artifactUI).toContain('id="mapBatteryMode"');
  expect(artifactUI).toContain('id="mapBatteryNotation"');
  expect(characterUI).toContain('id="cmpBatteryMode"');
  expect(characterUI).toContain('id="cmpBatteryNotation"');
  expect(characterUI).toContain('openCharacterBatteryCharger');
  expect(characterUI).toContain('chargeCharacterMagicBattery');
 });
 it('sparar självvald EG och får ett förbrukningsbart kast utan extra PSY',()=>{
  const {magic}=fixture();
  expect(magic.state(battery,10).ready).toBe(false);
  const charged=magic.chargeBattery(battery,spell,3,15,10);
  expect(charged.battery_loaded).toMatchObject({
   spell_id:'eld',spell_name:'ELD (F)',effect_grade:3,fv:15,charged_day:10
  });
  expect(magic.state(charged,10).ready).toBe(true);
  expect(magic.state(charged,10).charges).toBe(1);
  expect(()=>magic.chargeBattery(charged,spell,2,15,10)).toThrow('redan laddat');
  const spent=magic.markUsed(charged,10);
  expect(spent.battery_loaded).toBe(null);
  expect(magic.state(spent,10).ready).toBe(false);
  expect(magic.chargeBattery(spent,spell,2,15,10).battery_loaded.effect_grade).toBe(2);
 });
 it('slår 1T3 vid laddning och lagrar utfallet, inte en ny slump vid kast',()=>{
  const {magic}=fixture(),power={...battery,battery_grade_mode:'dice'};
  const one=magic.chargeBattery(power,spell,null,15,12,()=>0);
  const three=magic.chargeBattery(power,spell,null,15,12,()=>0.9999);
  expect(one.battery_loaded.effect_grade).toBe(1);
  expect(three.battery_loaded.effect_grade).toBe(3);
  expect(Array.from(three.battery_loaded.grade_rolls)).toEqual([3]);
  expect(three.battery_loaded.grade_roll).toBe('1T3');
  expect(()=>magic.chargeBattery({...power,battery_grade_dice:'9T20'},spell,null,15)).toThrow();
  expect(()=>magic.chargeBattery({...power,battery_grade_dice:'abc'},spell,null,15)).toThrow();
 });
 it('visar enbart laddade batterier under föremålsmagi och ändrar inte inlärda besvärjelser',()=>{
  const {magic,spells}=fixture();
  const character={weapons:[{equipId:'w1',name:'Svärd',isMagical:true,magicPowers:[battery]}],
   armor:[],shields:[],equipment:[],spells:[]};
  expect(spells.list(character,[spell],15)).toHaveLength(0);
  character.weapons[0].magicPowers[0]=magic.chargeBattery(battery,spell,2,14,15);
  const list=spells.list(character,[spell],15);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({battery:true,fv:14,effect_grade:2,psy_source:'none',ready:true});
  expect(character.spells).toHaveLength(0);
  magic.markUsed(character.weapons[0].magicPowers[0],15);
 });
 it('kastar som kvick även för en långsam ursprungsbesvärjelse',()=>{
  const code=snippet('function combatMagicCastingRules(', 'function combatMagicBinding(');
  const x={combatMagicBinding:()=>({supported:true}),
    combatMagicRuleProfile:()=>({category:'manual'})};
  runInNewContext(code+'\nthis.rules=combatMagicCastingRules;',x);
  expect(x.rules(spell,2).resolve_round_offset).toBe(1);
  expect(x.rules({...spell,item_spell:{battery:true}},2)).toMatchObject({
   quick:true,resolve_round_offset:0,effect_grade:2
  });
 });
 it('förbrukar laddningen vid magislag och drar inte bärarens PSY',async()=>{
  const {magic,window}=fixture();
  const charged=magic.chargeBattery(battery,spell,2,16,8);
  const item={equipId:'w1',isMagical:true,magicPowers:[charged]};
  const character={_dbId:'char1',weapons:[item]};
  let saved=0,psy=0;
  const env={window,chars:[character],campaignDayState:{day_number:8},save:()=>saved++,
   combatMagicPsyCost:(_outcome,eg)=>eg,
   combatSpendMagicPsy:async (_actor,cost)=>{psy+=cost}};
  const code=snippet('function combatSpellActualPsyCost(', 'async function combatSpendMagicPsy(');
  runInNewContext(code+'\nthis.pay=combatPayForSpell;this.actual=combatSpellActualPsyCost;',env);
  const action={source_data:{effect_grade:2,item_magic:{
   group:'weapons',item_id:'w1',power_id:'p1',psy_source:'none',battery:true,battery_spell_id:'eld'
  }}};
  const actual=env.actual(action,'failure',2);
  expect(actual).toBe(0);
  await env.pay({source_id:'char1'},actual,action);
  expect(saved).toBe(1);expect(psy).toBe(0);
  expect(item.magicPowers[0].battery_loaded).toBe(null);
  await expect(env.pay({source_id:'char1'},0,action)).rejects.toThrow();
 });
});
