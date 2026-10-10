import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('legacy/app.js');
const css=read('features/character/current-equipment-gandalf.css');
const start=app.indexOf('function currentEquipmentProjectileEntries(character){');
const stop=app.indexOf('/* Aragorn: only the clothed/base',start);
const source=app.slice(start,stop);
const rules=[
 {id:'bow',name:'Långbåge',category:'projectile',projectile_key:'arrow'},
 {id:'xbow',name:'Lätt armborst',category:'projectile',projectile_key:'bolt'},
 {id:'sling',name:'Stavslunga',category:'projectile',projectile_key:'stone'},
 {id:'blow',name:'Blåsrör',category:'projectile',projectile_key:'dart'},
 {id:'axe',name:'Kastyxa',category:'thrown',projectile_key:'throwing_axe',image_path:'weapon/axe.webp'},
 {id:'staff',name:'Trästav',category:'melee'},
 {id:'sword',name:'Svärd',category:'melee'}
];
const types=[
 {projectile_key:'arrow',name:'Pilar',image_path:'projectile/arrow.webp'},
 {projectile_key:'bolt',name:'Skäktor',image_path:'projectile/bolt.webp'},
 {projectile_key:'stone',name:'Stenar',image_path:'projectile/stone.webp'},
 {projectile_key:'dart',name:'Blåsrörspilar',image_path:'projectile/dart.webp'},
 {projectile_key:'throwing_axe',name:'Kastyxor',image_path:'projectile/duplicate.webp'}
];
const items=rules.map(r=>({equipId:r.id,weaponTypeId:r.id,name:r.name}));
const ref=(id,hands=1)=>({kind:'weapon',itemId:id,hands});
const character={
 weapons:items,
 projectiles:[{projectileKey:'arrow',count:6},{projectileKey:'bolt',count:3},
  {projectileKey:'stone',count:2},{projectileKey:'dart',count:8},{projectileKey:'throwing_axe',count:1}],
 currentEquipment:{leftHand:null,rightHand:null}
};
function fixture(){
 const c=structuredClone(character),messages=[];
 const ctx={
  current:c,
  equipItemByRef:(ch,r)=>ch.weapons.find(w=>w.equipId===r.itemId),
  ruleWeaponForItem:w=>rules.find(r=>r.id===w.weaponTypeId),
  ruleProjectileFromKey:key=>types.find(p=>p.projectile_key===key)||null,
  projectileMasterImagePath:p=>p?.image_path||null,
  canonicalWeaponProjectileKey:()=>'', // test links must use the real master key
  characterProjectileKey:s=>s.projectileKey,
  window:{aleaEquipmentArt:{src:path=>path?'https://example.test/'+path:''}},
  escAttr:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  showBackupToast:message=>messages.push(message),
  alert:message=>messages.push(message)
 };
 runInNewContext(source+';globalThis.api={currentEquipmentProjectileEntries,currentEquipProjectileSlotHtml,showCurrentEquipmentProjectileInfo};',ctx);
 return {character:c,api:ctx.api,messages};
}
describe('Automatiska projektiler i Aktuell utrustning',()=>{
 it('leaves the slot empty if no ranged or thrown weapon is equipped',()=>{
  const {character:c,api}=fixture();
  expect(api.currentEquipmentProjectileEntries(c)).toHaveLength(0);
  expect(api.currentEquipProjectileSlotHtml(c)).toContain('gandalf-equip-projectiles empty');
  c.currentEquipment.leftHand=ref('sword');
  c.currentEquipment.rightHand=ref('staff');
  expect(api.currentEquipmentProjectileEntries(c)).toHaveLength(0);
  expect(api.currentEquipProjectileSlotHtml(c)).toContain('Inget valt');
 });
 it('updates immediately when a ranged weapon is equipped or changed',()=>{
  const {character:c,api}=fixture();
  const cases=[['bow','arrow','Pilar','projectile/arrow.webp'],
   ['xbow','bolt','Skäktor','projectile/bolt.webp'],
   ['sling','stone','Stenar','projectile/stone.webp'],
   ['blow','dart','Blåsrörspilar','projectile/dart.webp']];
  for(const [weapon,key,name,path] of cases){
   c.currentEquipment.leftHand=ref(weapon);
   const entries=api.currentEquipmentProjectileEntries(c);
   expect(entries).toHaveLength(1);
   expect(entries[0].key).toBe(key);
   expect(entries[0].name).toBe(name);
   const html=api.currentEquipProjectileSlotHtml(c);
   expect(html).toContain(path);
   expect(html).toContain(name);
   expect(html).toContain('gandalf-equip-projectiles equipped');
  }
  c.currentEquipment.leftHand=null;
  expect(api.currentEquipmentProjectileEntries(c)).toHaveLength(0);
 });
 it('reuses the throwing weapon image, not the separately uploaded projectile image',()=>{
  const {character:c,api}=fixture();
  c.currentEquipment.rightHand=ref('axe');
  const [entry]=api.currentEquipmentProjectileEntries(c);
  expect(entry.key).toBe('throwing_axe');
  expect(entry.imagePath).toBe('weapon/axe.webp');
  expect(entry.count).toBe(1);
  expect(api.currentEquipProjectileSlotHtml(c)).toContain('weapon/axe.webp');
  expect(api.currentEquipProjectileSlotHtml(c)).not.toContain('projectile/duplicate.webp');
 });
 it('deduplicates one two-hand bow equipped in both slots',()=>{
  const {character:c,api}=fixture();
  c.currentEquipment.leftHand=ref('bow',2);
  c.currentEquipment.rightHand=ref('bow',2);
  expect(api.currentEquipmentProjectileEntries(c)).toHaveLength(1);
  expect(api.currentEquipmentProjectileEntries(c)[0].count).toBe(6);
  expect(api.currentEquipProjectileSlotHtml(c)).not.toContain('gandalf-equip-projectiles equipped dual');
 });
 it('shows two distinct projectile types if two different ranged weapons occupy the hands',()=>{
  const {character:c,api}=fixture();
  c.currentEquipment.leftHand=ref('xbow');
  c.currentEquipment.rightHand=ref('axe');
  const entries=api.currentEquipmentProjectileEntries(c);
  expect(entries.map(e=>e.key).join(',')).toBe('bolt,throwing_axe');
  const html=api.currentEquipProjectileSlotHtml(c);
  expect(html).toContain('gandalf-equip-projectiles equipped dual');
  expect(html).toContain('projectile/bolt.webp');
  expect(html).toContain('weapon/axe.webp');
 });
 it('shows zero ammunition without manufacturing stock or mutating the character',()=>{
  const {character:c,api,messages}=fixture();
  c.projectiles=[];
  c.currentEquipment.leftHand=ref('bow');
  const before=JSON.stringify(c);
  expect(api.currentEquipmentProjectileEntries(c)[0].count).toBe(0);
  expect(api.currentEquipProjectileSlotHtml(c)).toContain('gandalf-ammo-item out');
  api.showCurrentEquipmentProjectileInfo();
  expect(messages[0]).toContain('fyll på under Vapen');
  expect(JSON.stringify(c)).toBe(before);
 });
 it('updates from shared character stock without storing a duplicate ammo slot',()=>{
  const {character:c,api}=fixture();
  c.currentEquipment.leftHand=ref('xbow');
  c.projectiles.push({projectileKey:'bolt',count:5});
  expect(api.currentEquipmentProjectileEntries(c)[0].count).toBe(8);
  c.projectiles[1].count=1;
  expect(api.currentEquipmentProjectileEntries(c)[0].count).toBe(6);
  expect(c.currentEquipment).not.toHaveProperty('projectile');
  expect(c.currentEquipment).not.toHaveProperty('ammo');
  expect(app).toContain('currentEquipProjectileSlotHtml(current)');
  expect(css).toContain('.gandalf-equip-projectiles .gandalf-ammo-count');
  expect(css).toContain('@media(max-width:620px)');
 });
});
