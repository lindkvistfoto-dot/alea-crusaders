import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('legacy/app.js');
const css=read('src/styles/app.css');
const start=app.indexOf('/* v0.35.06 — character shields');
const end=app.indexOf('function renderWeapons(){',start);
if(start<0||end<=start)throw new Error('Character shield registry picker missing');
const source=app.slice(start,end);
function harness(){
 const rules=[
  {id:'r1',shield_key:'shield_small',name:'Liten sköld',bv:8,bep:1,absorption:8,price:90,size_class:'small',skill_id:'skoldar',icon_key:'shield-small',projectile_block_min:1,projectile_block_max:2},
  {id:'r2',shield_key:'shield_large',name:'Stor sköld',bv:16,bep:3,absorption:16,price:190,size_class:'large',skill_id:'skoldar',icon_key:'shield-large',projectile_block_min:1,projectile_block_max:6}
 ];
 const current={shields:[{equipId:'eq-1',name:'Liten sköld',fv:12,erf:8,bep:99,bv:0}]};
 const counts={save:0,render:0,bep:0};
 const context={
  ruleShields:rules,current,canEditCharacter:()=>true,
  save:()=>counts.save++,renderWeapons:()=>counts.render++,
  refreshTotalBep:()=>counts.bep++,
  escAttr:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
 };
 runInNewContext(source+'this.api={characterShieldRule,characterShieldMasterOptions,applyCharacterShieldMaster,setCharacterShieldMaster};',context);
 return {rules,current,counts,api:context.api};
}
describe('Rollpersonens sköld väljs från masterregistret',()=>{
 test('mastervalet kopierar BV, BEP och skydd utan att skriva över FV/ERF eller utrustnings-ID',()=>{
  const {rules,current,api}=harness();
  api.setCharacterShieldMaster(0,'r2');
  const shield=current.shields[0];
  expect(shield).toMatchObject({
   name:'Stor sköld',shieldTypeId:'r2',shieldKey:'shield_large',
   shield_id:'r2',equipId:'eq-1',fv:12,erf:8,
   bv:16,bep:3,abs:16,price:190,projectile_block_max:6
  });
  expect(api.characterShieldRule(shield).id).toBe(rules[1].id);
 });
 test('befintlig äldre sköld kan kopplas efter namn utan att skapa nya registerposter',()=>{
  const {api,current}=harness();
  expect(api.characterShieldRule(current.shields[0])?.id).toBe('r1');
  const options=api.characterShieldMasterOptions(current.shields[0]);
  expect(options).toContain('selected');
  expect(options).toContain('Liten sköld');
  expect(options).toContain('Stor sköld');
  expect(options).toContain('BV 16 · BEP 3');
  expect(api.characterShieldMasterOptions({name:'Okänd äldre sköld'})).toContain('Tidigare: Okänd äldre sköld');
 });
 test('valet sparar och uppdaterar BEP, men ogiltigt val gör ingenting',()=>{
  const {api,counts,current}=harness();
  api.setCharacterShieldMaster(0,'r2');
  expect(counts).toEqual({save:1,render:1,bep:1});
  api.setCharacterShieldMaster(0,'unknown');
  expect(current.shields[0].shieldTypeId).toBe('r2');
  expect(counts).toEqual({save:1,render:2,bep:1});
 });
 test('ny sköld läggs bara till genom registerväljaren',()=>{
  expect(source).toContain("if(!ruleShieldsLoaded)await loadRuleShields()");
  expect(source).toContain("ruleShields.map(r=>");
  expect(source).toContain("confirmCharacterShieldPick()");
  expect(source).toContain("current.shields.push(applyCharacterShieldMaster(");
  expect(app).not.toContain("current.shields.push({equipId:newEquipItemId('shield'),name:''");
 });
 test('projektil, rustning och sköld visas som redigeringskort med korrekt antal fält',()=>{
  expect(app).toContain("character-equip-edit-row projectile-edit-row");
  expect(app).toContain("character-equip-edit-row armor-edit-row");
  expect(app).toContain("character-equip-edit-row shield-edit-row");
  expect(app).toContain("characterEquipmentEditField('Sköld ur grundtabellen'");
  expect(app).toContain("characterEquipmentEditField('BV'");
  expect(app).toContain("characterEquipmentEditField('BEP'");
  expect(app).toContain("characterEquipmentEditField('FV'");
  expect(app).toContain("characterEquipmentEditField('ERF'");
  expect(app).toContain("characterEquipmentEditField('Antal',projectileStepper(");
  expect(css).toContain("body.editing #view #weaponsPanel #shieldtable");
  expect(css).toContain(".character-equip-edit-row");
  expect(css).toContain("grid-template-columns:repeat(2,minmax(0,1fr))!important");
  expect(css).toContain("body.editing header #editBtn");
  expect(app).toContain("erfDisplay('shields',i,x.erf)");
 });
});
