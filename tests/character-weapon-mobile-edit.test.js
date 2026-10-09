import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const legacy=read('legacy/app.js');
const css=read('src/styles/app.css');
const start=legacy.indexOf('function renderWeapons(){');
const end=legacy.indexOf('function projectileStepper(',start);
if(start<0||end<=start)throw new Error('Weapon renderer not found');
const renderer=legacy.slice(start,end);

function preview(editing=true){
 const els=Object.fromEntries(['weapontable','projectiletable','armortable','shieldtable']
  .map(name=>[name,{innerHTML:''}]));
 const context={
  editing,
  current:{
   weapons:[
    {name:'Dolk',damage:'1T4+1',bv:9,length:15,range:'Beröring',bep:1,erf:3,fv:12},
    {name:'Bastardsvärd',damage:'1T10+1',bv:15,length:120,range:'',bep:2,erf:5,fv:13}
   ],
   projectiles:[],armor:[],shields:[]
  },
  ensureEquipmentState:()=>{},
  $:name=>els[name],
  weaponMasterOptions:item=>'<option value="master" selected>'+item.name+'</option>',
  weaponLinkedFvHtml:item=>'<div class="skillnum"><span class="calculated-value">'+item.fv+'</span></div>',
  weaponLinkedErfHtml:item=>'<div class="skillnum"><span class="calculated-value">'+item.erf+'</span></div>',
  characterEquipmentEditField:(label,input,more='')=>'<label class="character-equip-field '+more+'"><span>'+label+'</span>'+input+'</label>',
  escAttr:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
  erfDisplay:()=>'',characterShieldRule:()=>null
 };
 runInNewContext(renderer+'\nrenderWeapons();',context);
 return els.weapontable.innerHTML;
}
describe('mobile weapon editing',()=>{
 test('editing uses one full-width card per weapon, no table header or broken grid rows',()=>{
  const html=preview();
  expect((html.match(/class="character-equip-edit-row weapon-edit-row"/g)||[])).toHaveLength(2);
  expect(html).not.toContain('class="weapon-head"');
  expect(html).not.toContain('class="weapon-row"');
  expect(html).toContain('Vapentyp ur grundtabellen');
  expect(html).toContain('Vapennamn');
  for(const label of ['FV','Skada','BV','Vapenlängd','Räckvidd','BEP','ERF']){
   expect(html).toContain('<span>'+label+'</span>');
  }
  expect(html).toContain('Dolk');
  expect(html).toContain('Bastardsvärd');
  expect(html).toContain('1T4+1');
  expect(html).toContain('1T10+1');
 });
 test('all weapon operations keep their original handlers and row index',()=>{
  const html=preview();
  for(const handler of [
   'setCharacterWeaponMaster(0,this.value)',
   "setWeapon(0,'name',this.value)",
   "setWeapon(0,'damage',this.value)",
   "setWeapon(0,'bv',this.value)",
   "setWeapon(0,'length',this.value)",
   "setWeapon(0,'range',this.value)",
   "setWeapon(0,'bep',this.value)",
   "openWeaponInstanceEditor('character',0)",
   'confirmRow(this)','removeWeapon(0)',
   'setCharacterWeaponMaster(1,this.value)','removeWeapon(1)'
  ])expect(html).toContain(handler);
  expect(renderer).toContain('weaponLinkedFvHtml(x,i,true)');
  expect(renderer).toContain('weaponLinkedErfHtml(x,i,true)');
 });
 test('read-only weapons retain the detailed original table',()=>{
  const html=preview(false);
  expect(html).toContain('class="weapon-head"');
  expect((html.match(/class="weapon-row"/g)||[])).toHaveLength(2);
  expect(html).not.toContain('weapon-edit-row');
  expect(html).toContain('1T4+1');
 });
 test('CSS makes edit cards narrow-screen friendly without changing normal tables',()=>{
  expect(css).toContain('body.editing #view #weaponsPanel #weapontable{');
  expect(css).toContain('display:flex!important;flex-direction:column!important');
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))!important');
  expect(css).toContain('body.editing #view #weaponsPanel #weapontable .weapon-edit-row');
  expect(css).toContain('body.editing #view #weaponsPanel .section:has(> #weapontable)');
 });
});
