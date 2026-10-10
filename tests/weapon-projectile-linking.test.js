import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('legacy/app.js');
const runtime=read('features/combat/runtime.js');
const migration=read('supabase/migrations/20261010221500_weapon_projectile_links.sql');
const ammo=[
 {projectile_key:'arrow',name:'Pilar',image_path:'projectile/arrow/a.webp'},
 {projectile_key:'bolt',name:'Skäktor',image_path:'projectile/bolt/b.webp'},
 {projectile_key:'stone',name:'Stenar',image_path:'projectile/stone/c.webp'},
 {projectile_key:'dart',name:'Blåsrörspilar',image_path:'projectile/dart/d.webp'},
 {projectile_key:'javelin',name:'Kastspjut',image_path:'projectile/javelin/old.webp'},
 {projectile_key:'throwing_knife',name:'Kastknivar',image_path:null},
 {projectile_key:'throwing_axe',name:'Kastyxor',image_path:null},
 {projectile_key:'throwing_star',name:'Kaststjärnor',image_path:null},
 {projectile_key:'bola',name:'Bolor',image_path:null},
 {projectile_key:'lasso',name:'Lasson',image_path:null}
];
const weapons=[
 {name:'Kastspjut',category:'thrown',projectile_key:'javelin',image_path:'weapon/throwing-spear.webp'},
 {name:'Kastkniv',category:'thrown',projectile_key:'throwing_knife',image_path:'weapon/knife.webp'},
 {name:'Lasso',category:'thrown',projectile_key:'lasso',image_path:'weapon/lasso.webp'}
];
function fixture(){
 const start=app.indexOf('const THROWING_PROJECTILE_KEYS=');
 const end=app.indexOf('function renderAdminProjectiles(){',start);
 const source=app.slice(start,end);
 const map=new Map(ammo.map(x=>[x.projectile_key,x]));
 const src=path=>path?'https://example.invalid/'+path:'';
 const ctx={
  window:{aleaEquipmentArt:{src}},
  ruleWeapons:weapons,
  ruleProjectileTypes:ammo,
  ruleProjectileFromKey:key=>map.get(key),
  escAttr:String,
  $:id=>null
 };
 runInNewContext(source+';globalThis.api={projectileMasterImagePath,projectileImageHtml,projectileThrownWeapon};',ctx);
 return ctx.api;
}
function expectedProjectile(category,name,icon,tags=[]){
 const start=app.indexOf('function canonicalWeaponProjectileKey(');
 const end=app.indexOf('function renderAdminWeapons(){',start);
 const ctx={ruleWeapons:weapons,ruleProjectileTypes:ammo,THROWING_PROJECTILE_KEYS:new Set(['javelin','throwing_knife','throwing_axe','throwing_star','bola','lasso']),window:{aleaEquipmentArt:{src:()=>''}},ruleProjectileFromKey:()=>null,projectileMasterImagePath:()=>null,escAttr:String,$:()=>null};
 runInNewContext(app.slice(start,end)+';globalThis.expected=canonicalWeaponProjectileKey;',ctx);
 return ctx.expected(category,name,icon,tags);
}

describe('Alea projectile links and shared images',()=>{
 it('uses correct ammunition for every known kind of ranged weapon',()=>{
  const cases=[
   ['Kortbåge','bow',['bow'],'arrow'],
   ['Långbåge','bow',[],'arrow'],
   ['Liten båge','bow',[],'arrow'],
   ['Sammansatt båge','bow',[],'arrow'],
   ['Lätt armborst','crossbow',[],'bolt'],
   ['Tungt armborst','crossbow',['crossbow'],'bolt'],
   ['Arbalest','crossbow',[],'bolt'],
   ['Slunga','sling',['sling'],'stone'],
   ['Stavslunga','sling',['staff_sling'],'stone'],
   ['Blåsrör','blowgun',['blowgun'],'dart']
  ];
  for(const [name,icon,tags,key] of cases)
   expect(expectedProjectile('projectile',name,icon,tags),name).toBe(key);
 });
 it('connects thrown weapons to their own matching type',()=>{
  const cases=[
   ['Kastyxa','axe',['thrown'],'throwing_axe'],
   ['Kastkniv','dagger',['thrown'],'throwing_knife'],
   ['Kastspjut','spear',['thrown'],'javelin'],
   ['Kaststjärna','shuriken',['thrown'],'throwing_star'],
   ['Bola','bola',['thrown'],'bola'],
   ['Lasso','lasso',['thrown'],'lasso']
  ];
  for(const [name,icon,tags,key] of cases)
   expect(expectedProjectile('thrown',name,icon,tags),name).toBe(key);
 });
 it('allows a custom ranged weapon to choose a master projectile manually',()=>{
  expect(expectedProjectile('projectile','Egen specialmodell','generic',[])).toBe('');
  expect(expectedProjectile('melee','Kortbåge','bow',['bow'])).toBe('');
  expect(app).toContain("const projectileKey=category==='melee'?null:(expected||$('rwProjectileKey')?.value||null)");
  expect(app).toContain("!ruleProjectileFromKey(projectileKey)");
  expect(app).toContain("THROWING_PROJECTILE_KEYS.has(p.projectile_key)");
 });
 it('prefers the master weapon picture to any duplicate projectile image for a thrown weapon',()=>{
  const api=fixture();
  expect(api.projectileMasterImagePath(ammo[4])).toBe('weapon/throwing-spear.webp');
  expect(api.projectileMasterImagePath(ammo[0])).toBe('projectile/arrow/a.webp');
  expect(api.projectileMasterImagePath(ammo[1])).toBe('projectile/bolt/b.webp');
  expect(api.projectileMasterImagePath(ammo[9])).toBe('weapon/lasso.webp');
  expect(api.projectileImageHtml('javelin','Kastspjut')).toContain('weapon/throwing-spear.webp');
 });
 it('displays the borrowed image, without uploading or replacing images from the projectile editor',()=>{
  expect(app).toContain('const borrowed=!!projectileThrownWeapon(key)');
  expect(app).toContain("if(!borrowed)artChange=await window.aleaEquipmentArt.prepare('projectile',key,artContext)");
  expect(app).toContain("...(!borrowed?{image_path:artChange.path}:{})");
  expect(app).toContain('Bild från kastvapnet');
  expect(app).toContain('ruleWeaponProjectileLabel(r)');
 });
 it('protects server links and continues to consume master-based ammunition',()=>{
  expect(migration).toContain("('lasso','Lasson'");
  expect(migration).toContain("when category='thrown' and name='Lasso' then 'lasso'");
  expect(migration).toContain("rule_weapons_ranged_ammo_required");
  expect(migration).toContain("category not in ('projectile','thrown') or projectile_key is not null");
  expect(runtime).toContain("rule?.projectile_key||weapon.projectileKey||weapon.projectile_key");
  expect(runtime).toContain('rpc/combat_spend_ammunition');
  expect(runtime).toContain('combatAmmoStock(actor,projectileKey)<1');
 });
});
