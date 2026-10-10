import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('features/equipment/magic-artifacts.js');
const index=read('index.html');
const legacy=read('legacy/app.js');
const equip=read('features/equipment/catalog.js');
const schema=read('supabase/migrations/20261011002000_magic_artifacts_registry.sql');
const css=read('features/equipment/magic-artifacts.css');

function makeRegistry(admin=true){
 const elements={
  adminMagicArtifactTable:{innerHTML:''},
  adminMagicArtifactStatus:{textContent:''},
  adminMagicArtifactSearch:{value:''},
  adminMagicArtifactFilter:{value:'all'}
 };
 const calls=[];
 const fixture=[{
  id:'00000000-0000-0000-0000-000000000001',
  artifact_key:'nattens_amulett',name:'Nattens amulett',item_type:'amulet',
  appearance:'Silveramulet',magic_properties:'Bäraren ser i mörker',
  activation:'Vid beröring',gm_notes:'Håller på att vakna',
  active:true,rarity:'rare',max_charges:3,
  base_kind:null,base_item_id:null
 }];
 const scope={
  document:{getElementById:id=>elements[id]||null},
  activeUser:()=>({admin}),
  dbJson:vi.fn(async (url,opts)=>{calls.push({url,opts});return fixture;}),
  console,
  window:{aleaEquipmentCatalog:{all:()=>[]}},
  crypto:{randomUUID:()=> '00000000-0000-0000-0000-000000000099'}
 };
 runInNewContext(source,scope);
 return {api:scope.window.aleaMagicArtifacts,elements,calls};
}
describe('SL-register för magiska artefakter',()=>{
 it('har egen administrationssida, script och mobilanpassade tabeller',()=>{
  expect(index).toContain("openAdminSection('artifacts')");
  expect(index).toContain('data-admin-section="artifacts"');
  expect(index).toContain('id="adminMagicArtifactTable"');
  expect(index).toContain('features/equipment/magic-artifacts.js?v=');
  expect(index).toContain('features/equipment/magic-artifacts.css?v=');
  expect(css).toContain('@media(max-width:700px)');
  expect(legacy).toContain("activeAdminSection==='artifacts'");
  expect(legacy).toContain("set('adminCountArtifacts',window.aleaMagicArtifacts?.count()||0)");
 });
 it('laddar och filtrerar sparade artefakter utan att avslöja rå HTML',async()=>{
  const r=makeRegistry();
  await r.api.refresh();
  expect(r.calls[0].url).toContain('rule_magic_artifacts?select=*');
  expect(r.api.count()).toBe(1);
  expect(r.elements.adminMagicArtifactTable.innerHTML).toContain('Nattens amulett');
  expect(r.elements.adminMagicArtifactTable.innerHTML).toContain('Bäraren ser i mörker');
  r.elements.adminMagicArtifactSearch.value='inget';
  r.api.render();
  expect(r.elements.adminMagicArtifactTable.innerHTML).toContain('Inga artefakter matchar');
  r.elements.adminMagicArtifactSearch.value='natten';
  r.elements.adminMagicArtifactFilter.value='weapon';
  r.api.render();
  expect(r.elements.adminMagicArtifactTable.innerHTML).toContain('Inga artefakter matchar');
 });
 it('blockerar dataladdning för icke-administratörer även om JS anropas direkt',async()=>{
  const r=makeRegistry(false);
  await r.api.load();
  expect(r.calls).toHaveLength(0);
  expect(r.api.count()).toBe(0);
 });
 it('databasens magiska hemligheter är skyddade av RLS för administratörer',()=>{
  expect(schema).toContain('create table if not exists public.rule_magic_artifacts');
  expect(schema).toContain('rule_magic_artifacts_select_admin');
  expect(schema).toContain('using ((select private.is_admin()))');
  expect(schema).toContain('rule_magic_artifacts_base_pair_check');
  expect(schema).toContain('base_kind');
  expect(schema).toContain('max_charges');
  expect(schema).toContain('magic_bonus');
 });
 it('alla fyra masterregister har magisk kolumn, redigerare och lagring',()=>{
  for(const table of ['rule_weapons','rule_armor_types','rule_shop_items','rule_shields']){
   expect(schema).toContain('alter table public.'+table);
   expect(schema).toContain('add column if not exists is_magical boolean not null default false');
  }
  for(const input of ['rwMagical','raMagical','rsMagical']){
   expect(legacy).toContain('id="'+input+'"');
   expect(legacy).toContain("is_magical:!!$('"+input+"')?.checked");
  }
  expect(legacy).toContain('<div class="ahead">Magisk</div>');
  expect(equip).toContain('id="reiMagical"');
  expect(equip).toContain("is_magical:!!elem('reiMagical')?.checked");
  expect(equip).toContain('<b>Magisk</b>');
 });
 it('en magisk artefakt är en egen variant, inte en automatisk buff för alla vanliga föremål',()=>{
  expect(source).toContain('base_kind:kind,base_item_id:kind?baseId:null');
  expect(source).toContain('max_charges:charges');
  expect(source).toContain('magic_properties:');
  expect(source).not.toContain('master.is_magical=true');
  expect(schema).not.toMatch(/update public\.rule_weapons\s+set\s+is_magical/);
 });
});
