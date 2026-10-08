import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261008_gandalf_material_foundation.sql',import.meta.url),'utf8');
const architecture=readFileSync(new URL('../docs/material-gandalf-architecture.md',import.meta.url),'utf8');

describe('Gandalf – campaign material foundation',()=>{
 test('creates the five normalized campaign tables',()=>{
  for(const table of ['campaign_materials','campaign_material_gm_notes','campaign_material_links',
    'campaign_material_shares','campaign_material_presentations']){
   expect(sql).toContain('create table if not exists public.'+table);
   expect(sql).toContain('alter table public.'+table+' enable row level security')
  }
 });
 test('does not expose files to anonymous users, create buckets or weaken existing policies',()=>{
  expect(sql).not.toMatch(/create\s+policy\s+\S+\s+on\s+storage\.objects/i);
  expect(sql).not.toMatch(/insert\s+into\s+storage\.buckets/i);
  expect(sql).not.toMatch(/\bto\s+anon\b/i);
  expect(sql).not.toMatch(/alter\s+table\s+public\.campaign_(npcs|locations|monsters|maps)\b/i)
 });
 test('SL private notes are strictly isolated',()=>{
  expect(sql).toContain('create table if not exists public.campaign_material_gm_notes');
  expect(sql).toMatch(/create policy campaign_material_notes_gm_only on public\.campaign_material_gm_notes\s+for all to authenticated\s+using\s*\(private\.is_admin\(\) or private\.is_campaign_gm\(campaign_id\)\)/);
  expect(sql).not.toMatch(/campaign_material_notes_player/i)
 });
 test('player reads require membership and active share or current presentation',()=>{
  expect(sql).toMatch(/create policy campaign_materials_player_read on public\.campaign_materials/);
  expect(sql).toContain('archived_at is null');
  expect(sql).toContain('private.is_campaign_member(campaign_id)');
  expect(sql).toContain('s.revoked_at is null');
  expect(sql).toContain('p.material_id=campaign_materials.id')
 });
 test('all relations enforce campaign boundaries',()=>{
  for(const table of ['campaign_material_gm_notes','campaign_material_links','campaign_material_shares','campaign_material_presentations']){
   expect(sql).toMatch(new RegExp('create table if not exists public\\.'+table+'[\\s\\S]*?foreign key\\(campaign_id,material_id\\)'));
  }
  expect(sql).toContain('create trigger campaign_material_links_validate');
  for(const type of ['location','npc','monster','event','combat_scene'])expect(sql).toContain("when '"+type+"'");
  expect(sql).toContain('v.campaign_id=new.campaign_id')
 });
 test('file registry only accepts campaign-prefixed private bucket paths',()=>{
  expect(sql).toContain("split_part(storage_path,'/',1)=campaign_id::text");
  expect(sql).toContain("'campaign-materials'");
  expect(sql).toContain("storage_path not like '%..%'");
  expect(sql).toContain('constraint campaign_materials_unique_storage unique (campaign_id,storage_bucket,storage_path)')
 });
 test('shares have revocation and presentations are one-per-campaign',()=>{
  expect(sql).toContain('campaign_material_shares_current_unique');
  expect(sql).toContain('where revoked_at is null');
  expect(sql).toMatch(/create table if not exists public\.campaign_material_presentations\s*\(\s*campaign_id uuid primary key/i);
  expect(sql).toContain('revision bigint not null default 0')
 });
 test('files remain in their old buckets until later stages',()=>{
  expect(architecture).toContain('Ingen fil migreras eller dupliceras');
  expect(architecture).toContain('Gimli');
  expect(architecture).toContain('Aragorn');
  expect(architecture).toContain('Storage-RLS')
 })
});
