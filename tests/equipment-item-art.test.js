import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const artSource=read('features/equipment/art.js');
const css=read('features/equipment/art.css');
const app=read('legacy/app.js');
const html=read('index.html');
const version=JSON.parse(read('package.json')).version;
const id='f53b9568-81ec-4623-ac6d-dd452177a769';
const path='weapon/'+id+'/'+id+'.webp';

function artFixture(){
 const w={aleaHermesAleaArmors:{save:async()=>{}}};
 runInNewContext(artSource,{window:w,URL:{revokeObjectURL(){}},document:{getElementById(){return null;}}});
 w.aleaEquipmentArt.configure('https://example.supabase.co');
 return w.aleaEquipmentArt;
}

describe('Gemensamma inventariebilder i regelregister',()=>{
 it('loads artwork utilities before the app and transparent styles after the equipment scene',()=>{
  expect(html).toContain('features/equipment/art.js?v='+version);
  expect(html).toContain('features/equipment/art.css?v='+version);
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
  for(const kind of ['armor','shield']){
   expect(app).toContain("aleaEquipmentArt?.start('"+kind+"',r)");
   expect(app).toContain(kind==='armor'?'aleaEquipmentArt.prepareArmor(' : "aleaEquipmentArt.prepare('"+kind+"'");
  }
  expect(app).toContain('window.aleaHermesAleaWeapons?.upload');
  expect(app).toContain('Bildguide (råd)');
  expect(app).toContain('image_asset_id');
  expect(app).not.toContain('result.compatibilityPath');
  expect(html).toContain('features/equipment/weapon-hermes-alea.js?v=20261107-weapon-hermes-v1');
  for(const table of ['rule_weapons','rule_shields','rule_armor_types'])expect(app).toContain(table);
  expect((app.match(/payload.image_path=artChange.path/g)||[]).length).toBe(1);
  expect(app).not.toContain('Object.assign(payload,artChange.paths)');
  expect((app.match(/aleaEquipmentArt\?\.thumbnail/g)||[]).length).toBe(5);
  expect(app).toContain('function currentEquipmentItemArtPath(');
  expect(app).toContain('characterShieldRule(item)?.image_path');
  expect(app).toContain('window.aleaHermesAssetResolver?.reference(ruleWeaponForItem(item))');
  expect(app).toContain('armorImagePathForSlot(type,slot)');
  expect(app).toContain('armorImagePathForSlot(type,slot)');
  expect(app).toContain('window.aleaEquipmentArt?.reset()');
 });
 it('provides four independent HERMES ALEA controls and removes only the selected slot',async()=>{
  const w={},calls=[];
  w.aleaHermesAleaArmors={save:async args=>calls.push(args)};
  runInNewContext(artSource,{window:w,URL:{revokeObjectURL(){}},document:{getElementById(){return null;}}});
  const art=w.aleaEquipmentArt;
  const armorPaths=Object.fromEntries(['head','arms','torso','legs'].map(z=>['image_'+z+'_path','armor/'+z+'/'+id+'/'+id+'.webp']));
  const form=art.startArmor(armorPaths);
  for(const zone of ['head','arms','torso','legs'])expect(form).toContain("choose(this.files[0],'"+zone+"')");
  art.remove('head');await art.prepareArmor(id);
  expect(calls[0].pieces.filter(p=>p.removed).map(p=>p.zone)).toEqual(['head']);
  expect(calls[0].record.image_arms_path).toBe(armorPaths.image_arms_path);
  expect(form).not.toContain('900');
 });
 it('snapshots all four original files before the editor resets during publication',async()=>{
  const w={},files=['head','arms','torso','legs'].map(zone=>({name:zone,type:'image/png',size:15000}));
  let selected;
  w.aleaHermesAleaArmors={save:async args=>{w.aleaEquipmentArt.reset();selected=args.pieces;}};
  runInNewContext(artSource,{window:w,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},document:{getElementById(){return null;}}});
  const art=w.aleaEquipmentArt;art.startArmor({});
  for(const file of files)await art.choose(file,file.name);
  await art.prepareArmor(id);
  expect(selected.map(p=>p.file)).toEqual(files);
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
  rule.image_head_asset_id='hermes-alea:'+id;
  expect(art.armorImagePathForSlot(rule,'head')).toBe('hermes-alea:'+id);
  rule.image_head_asset_id=null;rule.image_head_revision=2;
  expect(art.armorImagePathForSlot(rule,'head')).toBeNull();
  expect(art.armorImagePathForSlot({},'head')).toBeNull();
  expect(art.src('armor/wrong/'+id+'/'+id+'.webp')).toBe('');
 });
 it('wires the armor UI thumbnail and all four images to ordinary equipment slots',()=>{
  for(const zone of ['head','arms','torso','legs']){
   expect(app).toContain('armorImagePathForSlot(r,z)');
  }
  expect(app).toContain("function currentEquipmentItemArtPath(ref,item,slot)");
  expect(app).toContain("currentEquipmentItemArtPath(ref,item,slot)");
  expect(app).toContain('armorImagePathForSlot(r,z)');
  expect(app).toContain('armorImagePathForSlot(rule,zone)');
  expect(css).toContain('.item-art-armor-grid');
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
 });

});
