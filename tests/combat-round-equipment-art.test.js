import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('src/styles/app.css');
const start=runtime.indexOf('function combatTurnEquipmentHtml(combatant){');
const end=runtime.indexOf('function combatTurnPanelHtml(){',start);
const source=runtime.slice(start,end);

const ruleWeapons=[
 {id:'bow',category:'projectile',name:'Långbåge',projectile_key:'arrow',image_path:'weapon/bow.webp'},
 {id:'xbow',category:'projectile',name:'Arbalest',projectile_key:'bolt',image_path:'weapon/xbow.webp'},
 {id:'sword',category:'melee',name:'Tvåhandssvärd',image_path:'weapon/sword.webp'},
 {id:'dagger',category:'melee',name:'Dolk',image_path:'weapon/dagger.webp'},
 {id:'axe',category:'thrown',name:'Kastyxa',projectile_key:'throwing_axe',image_path:'weapon/axe.webp'}
];
const shields=[{id:'shield',name:'Rundsköld',image_path:'shield/round.webp'}];
const armorTypes=[{id:'leather',name:'Nitläder',image_torso_path:'armor/torso/leather.webp',image_path:'armor/old.webp'}];
const ammo=[
 {projectile_key:'arrow',name:'Pilar',image_path:'projectile/arrow.webp'},
 {projectile_key:'bolt',name:'Skäktor',image_path:'projectile/bolt.webp'},
 {projectile_key:'throwing_axe',name:'Kastyxor',image_path:'projectile/duplicate.webp'}
];
const weapons=ruleWeapons.map(w=>({equipId:w.id,weaponTypeId:w.id,name:w.name}));
const ref=(kind,id,hands=1)=>({kind,itemId:id,hands});
function setup(){
 const combatant={source_type:'character',profile:{
  weapons,shields:[{equipId:'shield',shieldTypeId:'shield',name:'Rundsköld'}],
  armor:[{equipId:'leather',armorTypeId:'leather',name:'Nitläder',slot:'torso'}],
  projectiles:[{projectileKey:'arrow',count:9},{projectileKey:'bolt',count:4},{projectileKey:'throwing_axe',count:2}],
  currentEquipment:{leftHand:null,rightHand:null,torso:ref('armor','leather')}
 }};
 const ctx={
  combatAttackProfile:actor=>actor.profile,
  combatAmmoStock:(actor,key)=>actor.profile.projectiles.filter(p=>p.projectileKey===key).reduce((n,p)=>n+p.count,0),
  window:{aleaEquipmentArt:{src:path=>path?'https://equipment.test/'+path:''}},
  ruleWeaponForItem:item=>ruleWeapons.find(w=>w.id===item.weaponTypeId),
  characterShieldRule:item=>shields.find(s=>s.id===item.shieldTypeId),
  ruleArmorTypes:armorTypes,
  ruleProjectileFromKey:key=>ammo.find(p=>p.projectile_key===key),
  projectileMasterImagePath:p=>p?.projectile_key==='throwing_axe'?'weapon/axe.webp':p?.image_path||null,
  canonicalWeaponProjectileKey:()=>null,
  escAttr:value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
 };
 runInNewContext(source+';globalThis.makeCombatEquipment=combatTurnEquipmentHtml;',ctx);
 return {combatant,render:()=>ctx.makeCombatEquipment(combatant)};
}
describe('Rundans utrustning använder riktiga masterbilder',()=>{
 it('shows equipped sword, shield and the chest/torso illustration instead of generic SVG icons',()=>{
  const {combatant,render}=setup();
  combatant.profile.currentEquipment.leftHand=ref('weapon','dagger');
  combatant.profile.currentEquipment.rightHand=ref('shield','shield');
  const html=render();
  expect(html).toContain('weapon/dagger.webp');
  expect(html).toContain('shield/round.webp');
  expect(html).toContain('armor/torso/leather.webp');
  expect(html).not.toContain('armor/old.webp');
  expect(html).not.toContain('./assets/weapon-icons/');
  expect(html).not.toContain('./assets/armor-icons/');
  expect(html).toContain('Vänster hand');
  expect(html).toContain('Höger hand');
 });
 it('lets a twohand weapon fill exactly two hand slots with one horizontal image',()=>{
  const {combatant,render}=setup();
  combatant.profile.currentEquipment.leftHand=ref('weapon','sword',2);
  combatant.profile.currentEquipment.rightHand=ref('weapon','sword',2);
  const html=render();
  expect(html).toContain('combat-turn-equip-art weapon twohand');
  expect(html).toContain('Båda händerna');
  expect((html.match(/weapon\/sword\.webp/g)||[]).length).toBe(1);
  expect((html.match(/class="combat-turn-equip combat-turn-equip-art weapon/g)||[]).length).toBe(1);
  expect(css).toContain('.combat-turn-stats>.combat-turn-equip-art.twohand{');
  expect(css).toContain('grid-column:span 2');
  expect(css).toContain('transform:rotate(45deg)');
  expect(html).toContain('combat-turn-equip-art armor');
  expect(html).toContain('combat-turn-equip-art projectile');
 });
 it('only counts projectiles compatible with the currently held ranged weapon',()=>{
  const {combatant,render}=setup();
  combatant.profile.currentEquipment.leftHand=ref('weapon','bow',2);
  combatant.profile.currentEquipment.rightHand=ref('weapon','bow',2);
  let html=render();
  expect(html).toContain('projectile/arrow.webp');
  expect(html).toContain('>9</b>');
  expect(html).not.toContain('projectile/bolt.webp');
  expect(html).not.toContain('>15</b>');
  combatant.profile.currentEquipment.leftHand=ref('weapon','xbow',2);
  combatant.profile.currentEquipment.rightHand=ref('weapon','xbow',2);
  html=render();
  expect(html).toContain('projectile/bolt.webp');
  expect(html).toContain('>4</b>');
  expect(html).not.toContain('projectile/arrow.webp');
 });
 it('reuses the weapon image for a thrown axe and shows its stock in the bottom-right corner',()=>{
  const {combatant,render}=setup();
  combatant.profile.currentEquipment.leftHand=ref('weapon','axe');
  const html=render();
  expect(html).toContain('weapon/axe.webp');
  expect(html).toContain('>2</b>');
  expect(html).not.toContain('projectile/duplicate.webp');
  expect(css).toContain('.combat-turn-equip-art.projectile .combat-turn-ammo-count{');
  expect(css).toContain('right:3px;bottom:2px');
 });
 it('shows two ammo types side by side and two distinct amounts without summing',()=>{
  const {combatant,render}=setup();
  combatant.profile.currentEquipment.leftHand=ref('weapon','bow');
  combatant.profile.currentEquipment.rightHand=ref('weapon','axe');
  const html=render();
  expect(html).toContain('projectile/arrow.webp');
  expect(html).toContain('weapon/axe.webp');
  expect(html).toContain('>9 / 2</b>');
  expect(html).not.toContain('>11</b>');
 });
 it('indicates zero stock in red and does not show unrelated ammo for a melee loadout',()=>{
  const {combatant,render}=setup();
  combatant.profile.currentEquipment.leftHand=ref('weapon','bow');
  combatant.profile.projectiles[0].count=0;
  expect(render()).toContain('combat-turn-ammo-count out');
  combatant.profile.currentEquipment.leftHand=ref('weapon','dagger');
  const html=render();
  expect(html).not.toContain('combat-turn-ammo-count');
  expect(html).toContain('combat-turn-art-empty');
 });
});
