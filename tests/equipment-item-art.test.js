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
  expect(html).toContain('features/equipment/art.js?v=0.35.51');
  expect(html).toContain('features/equipment/art.css?v=0.35.51');
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
   expect(app).toContain(kind==='armor'?'aleaEquipmentArt.prepareArmor(' : "aleaEquipmentArt.prepare('"+kind+"'");
  }
  for(const table of ['rule_weapons','rule_shields','rule_armor_types'])expect(app).toContain(table);
  expect((app.match(/payload.image_path=artChange.path/g)||[]).length).toBe(2);
  expect(app).toContain('Object.assign(payload,artChange.paths)');
  expect((app.match(/aleaEquipmentArt\?\.thumbnail/g)||[]).length).toBe(3);
  expect(app).toContain('function currentEquipmentItemArtPath(');
  expect(app).toContain('characterShieldRule(item)?.image_path');
  expect(app).toContain('ruleWeaponForItem(item)?.image_path');
  expect(app).toContain('type?.image_path');
  expect(app).toContain('armorImagePathForSlot(type,slot)');
  expect(app).toContain('window.aleaEquipmentArt?.reset()');
 });
 it('provides four independent armor upload controls and removes only the selected slot',async()=>{
  const art=artFixture();
  const armorPaths=Object.fromEntries(['head','arms','torso','legs'].map(z=>['image_'+z+'_path','armor/'+z+'/'+id+'/'+id+'.webp']));
  const form=art.startArmor(armorPaths);
  for(const zone of ['head','arms','torso','legs']){
   expect(form).toContain('itemArtPreview-'+zone);
   expect(form).toContain('itemArtStatus-'+zone);
   expect(form).toContain("choose(this.files[0],\\'"+zone+"\\')");
  }
  const before=await art.prepareArmor(id,{});
  for(const zone of ['head','arms','torso','legs'])expect(before.paths['image_'+zone+'_path']).toBe(armorPaths['image_'+zone+'_path']);
  art.remove('head');
  const after=await art.prepareArmor(id,{});
  expect(after.paths.image_head_path).toBeNull();
  expect(after.paths.image_arms_path).toBe(armorPaths.image_arms_path);
  expect(after.paths.image_torso_path).toBe(armorPaths.image_torso_path);
  expect(after.paths.image_legs_path).toBe(armorPaths.image_legs_path);
  expect(after.old.length).toBe(1);
  expect(after.old[0]).toBe(armorPaths.image_head_path);
  art.reset();
 });
 it('chooses the image belonging to each armor zone and retains the legacy fallback',()=>{
  const art=artFixture();
  const rule={image_path:path};
  for(const zone of ['head','arms','torso','legs']){
   expect(art.armorImagePathForSlot(rule,zone)).toBe(path);
   rule['image_'+zone+'_path']='armor/'+zone+'/'+id+'/'+id+'.webp';
  }
  for(const zone of ['head','arms','torso','legs']){
   expect(art.armorImagePathForSlot(rule,zone)).toBe(rule['image_'+zone+'_path']);
   expect(art.src(rule['image_'+zone+'_path'])).toContain('alea-equipment-art/armor/'+zone);
  }
  expect(art.armorImagePathForSlot({},'head')).toBeNull();
  expect(art.src('armor/wrong/'+id+'/'+id+'.webp')).toBe('');
 });
 it('wires the armor UI thumbnail and all four images to ordinary equipment slots',()=>{
  for(const zone of ['head','arms','torso','legs']){
   expect(app).toContain("'image_'+z+'_path'");
  }
  expect(app).toContain("function currentEquipmentItemArtPath(ref,item,slot)");
  expect(app).toContain("currentEquipmentItemArtPath(ref,item,slot)");
  expect(app).toContain("r['image_'+z+'_path']");
  expect(app).toContain('rule?.image_torso_path');
  expect(css).toContain('.item-art-armor-grid');
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
 });

});
