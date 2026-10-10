import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const artSource=read('features/equipment/art.js');
const css=read('features/equipment/art.css');
const app=read('legacy/app.js');
const html=read('index.html');
const id='f53b9568-81ec-4623-ac6d-dd452177a769';
const path='weapon/'+id+'/'+id+'.webp';

function artFixture(){
 const w={};
 runInNewContext(artSource,{window:w,URL:{revokeObjectURL(){}},document:{getElementById(){return null;}}});
 w.aleaEquipmentArt.configure('https://example.supabase.co');
 return w.aleaEquipmentArt;
}

describe('Gemensamma inventariebilder i regelregister',()=>{
 it('loads artwork utilities before the app and transparent styles after the equipment scene',()=>{
  expect(html).toContain('features/equipment/art.js?v=0.35.50');
  expect(html).toContain('features/equipment/art.css?v=0.35.50');
  expect(html.indexOf('features/equipment/art.js')).toBeLessThan(html.indexOf('legacy/app.js'));
  expect(html.indexOf('features/equipment/art.css')).toBeGreaterThan(html.indexOf('current-equipment-gandalf.css'));
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('.gandalf-equip-art');
 });
 it('limits URLs to supported, isolated storage assets',()=>{
  const art=artFixture();
  expect(art.src(path)).toBe('https://example.supabase.co/storage/v1/object/public/alea-equipment-art/'+path);
  expect(art.src('https://other-server.example/item.png')).toBe('');
  expect(art.src('weapon/../../x.png')).toBe('');
  expect(art.src('data:image/svg+xml;base64,abcd')).toBe('');
  expect(art.imageTag(path)).toContain('gandalf-equip-art');
 });
 it('opens editable previews, retains existing art and removes it only on save',async()=>{
  const art=artFixture();
  expect(art.start('weapon',{image_path:path})).toContain('type="file"');
  expect(art.thumbnail(path,'fallback','Svärd')).toContain('Inventariebild');
  let unchanged=await art.prepare('weapon',id,{});
  expect(unchanged.path).toBe(path);
  art.remove();
  const removed=await art.prepare('weapon',id,{});
  expect(removed.path).toBeNull();
  expect(removed.old).toBe(path);
  art.reset();
 });
 it('wires all three admin forms and saves image paths to their master tables',()=>{
  for(const kind of ['weapon','armor','shield']){
   expect(app).toContain("aleaEquipmentArt?.start('"+kind+"',r)");
   expect(app).toContain("aleaEquipmentArt.prepare('"+kind+"'");
  }
  for(const table of ['rule_weapons','rule_shields','rule_armor_types'])expect(app).toContain(table);
  expect((app.match(/payload.image_path=artChange.path/g)||[]).length).toBe(3);
  expect((app.match(/aleaEquipmentArt\?\.thumbnail/g)||[]).length).toBe(3);
  expect(app).toContain('function currentEquipmentItemArtPath(');
  expect(app).toContain('characterShieldRule(item)?.image_path');
  expect(app).toContain('ruleWeaponForItem(item)?.image_path');
  expect(app).toContain('type?.image_path');
  expect(app).toContain('window.aleaEquipmentArt?.reset()');
 });
});
