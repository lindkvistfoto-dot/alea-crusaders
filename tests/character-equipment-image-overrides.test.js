import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const equipmentArt=read('features/equipment/art.js');
const characterMagic=read('features/character/magic-items.js');
const app=read('legacy/app.js');
const combat=read('features/combat/runtime.js');
const uuidA='123e4567-e89b-12d3-a456-426614174000';
const uuidB='123e4567-e89b-12d3-a456-426614174001';
const uuidC='123e4567-e89b-12d3-a456-426614174002';
const uniquePath='item/'+uuidA+'/'+uuidB+'/'+uuidC+'.webp';
const masterPath='weapon/'+uuidA+'/'+uuidC+'.webp';

function artHarness(){
 const context={window:{},document:{getElementById:()=>null}};
 runInNewContext(equipmentArt,context);
 const art=context.window.aleaEquipmentArt;
 art.configure('https://example.supabase.co');
 return art;
}

describe('single-item weapon and shield artwork',()=>{
 it('allows authenticated-user item paths while rejecting arbitrary storage paths',()=>{
  const art=artHarness();
  expect(art.src(uniquePath)).toContain('/storage/v1/object/public/alea-equipment-art/item/');
  expect(art.src(masterPath)).toContain('/storage/v1/object/public/alea-equipment-art/weapon/');
  expect(art.src('item/../private.png')).toBe('');
  expect(art.src('https://attacker.example/image.webp')).toBe('');
 });
 it('starts with an instance picture, can restore master fallback and does not mutate the master',async()=>{
  const art=artHarness();
  const item={imageOverridePath:uniquePath};
  const html=art.startInstance(item);
  expect(html).toContain('just detta föremål');
  expect(item.imageOverridePath).toBe(uniquePath);
  expect((await art.prepareInstance(uuidA,uuidB,{})).path).toBe(uniquePath);
  art.remove();
  expect((await art.prepareInstance(uuidA,uuidB,{})).path).toBeNull();
  expect(item.imageOverridePath).toBe(uniquePath);
 });
 it('resolves instance first and master second without coupling artwork to magical state',()=>{
  const character={weapons:[{name:'Dödsbringaren',imageOverridePath:uniquePath}],shields:[{name:'Sköld'}]};
  const context={window:{aleaEquipmentArt:artHarness()},current:character,
   ruleWeaponForItem:()=>({image_path:masterPath}),
   characterShieldRule:()=>({image_path:masterPath})};
  runInNewContext(characterMagic,context);
  const img=context.window.aleaCharacterItemMagic;
  expect(img.imagePath('weapon',character.weapons[0])).toBe(uniquePath);
  expect(img.imagePath('shield',character.shields[0])).toBe(masterPath);
  delete character.weapons[0].imageOverridePath;
  expect(img.imagePath('weapon',character.weapons[0])).toBe(masterPath);
  expect(img.control('weapon',0)).toContain('openCharacterItemImage');
  expect(img.control('shield',0)).toContain('openCharacterItemImage');
  expect(img.control('equipment',0)).toBe('');
 });
 it('uses override before register art on character equipment and combat HUD',()=>{
  expect(app).toContain("item.imageOverridePath||ruleWeaponForItem(item)?.image_path");
  expect(app).toContain("item.imageOverridePath||characterShieldRule(item)?.image_path");
  expect(combat).toContain("item.imageOverridePath||rule?.image_path||item.image_path");
  expect(combat).toContain("item.imageOverridePath||shieldRule(item)?.image_path||item.image_path");
 });
});
