import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const app=read('legacy/app.js');
const workshop=read('features/combat/battlefield-object-workshop.js');
const runtime=read('features/combat/runtime.js');
const migration=read('supabase/migrations/20261116131457_shared_product_schema_contract.sql');

describe('Battlefield object workshop',()=>{
 it('registers as a separate administrator workbench beside Dockfabriken',()=>{
  expect(html).toContain("openAdminSection('battlefieldWorkshop')");
  expect(html).toContain('data-admin-section="battlefieldWorkshop"');
  expect(app).toContain("battlefieldWorkshop:['Battlefield · Objektverkstaden'");
  expect(app).toContain("window.aleaBattlefieldObjectWorkshop?.mount?.()");
  expect(workshop).toContain('Endast administratörer kan öppna objektverkstaden.');
 });

 it('defines a one-hex segment with six configurable joining sides and a three-piece preview',()=>{
  expect(workshop).toContain('Förhandsvisning · tre sammanfogade segment');
  expect(workshop).toContain('connector_edges:edges.filter');
  expect(workshop).toContain('footprint:[{q:0,r:0}]');
  expect(workshop).toContain('HERMES CORE asset_key');
 });

 it('renders form controls before initializing a new or selected template',()=>{
  const loadForm=workshop.slice(workshop.indexOf('function loadForm('),workshop.indexOf('function previewMarkup('));
  expect(loadForm.indexOf('render();')).toBeLessThan(loadForm.indexOf("$('bfwName').value"));
 });

 it('uses the shared ALEA Supabase URL for published HERMES artwork',()=>{
  const imageUrl=workshop.slice(workshop.indexOf('function imageUrl('),workshop.indexOf('function current('));
  expect(imageUrl).toContain("typeof SUPABASE_URL==='string'");
  expect(imageUrl).toContain("'/storage/v1/object/public/alea-hermes-public/'");
 });

 it('persists reusable templates separately from placements and limits private instances to GMs',()=>{
  expect(migration).toContain('create table if not exists public.arcane_battlefield_library');
  expect(migration).toContain('create table if not exists public.combat_battlefield_objects');
  expect(migration).toContain('using (active or private.is_admin())');
  expect(migration).toContain('(visible_to_players and private.is_campaign_member(campaign_id))');
  expect(migration).toContain('private.is_campaign_gm(campaign_id) or private.is_admin()');
  expect(migration).toContain('after insert or update or delete on public.combat_battlefield_objects');
  expect(migration).toContain('update public.combat_instances set updated_at = now() where id = v_combat');
  expect(migration).not.toContain('insert into public.arcane_battlefield_library');
  expect(runtime).toContain('combat_battlefield_objects?combat_id=eq.');
  expect(runtime).toContain('combatRuntimeHexCells');
  expect(runtime).not.toContain('sl_control_board_instances');
 });
});
