import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const race=readFileSync(new URL('../supabase/migrations/20261024060000_arcane_race_battle_poses.sql',import.meta.url),'utf8');
const jobs=readFileSync(new URL('../supabase/migrations/20261024061000_hermes_race_pose_job_support.sql',import.meta.url),'utf8');
it('creates race pose catalog and preserves exactly-one-owner HERMES job constraints',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create schema private; create function private.is_admin() returns boolean language sql as \'select false\';');
  await db.exec('create table public.rule_races(id text primary key); insert into public.rule_races values (\'manniska\');');
  await db.exec('create table public.combatant_battle_poses(id uuid primary key,staging_path text,publication_status text,pending_staging_path text);');
  await db.exec('create table public.hermes_web_jobs(id uuid primary key default gen_random_uuid(),pose_id uuid not null references public.combatant_battle_poses(id),race_pose_id uuid,asset_kind text not null,source_path text not null,requested_by uuid, state text not null default \'queued\',attempts integer not null default 0,archive_drive_file_id text,output_path text,error_code text,completed_at timestamptz,source_sha256 text);');
  await db.exec('create schema auth; create function auth.uid() returns uuid language sql as \'select null::uuid\';');
  await db.exec(race);
  await db.exec(jobs);
  const result=await db.query("select conname from pg_constraint where conrelid='hermes_web_jobs'::regclass and conname='hermes_web_jobs_pose_owner_check'");
  expect(result.rows).toHaveLength(1);
  await db.exec("insert into race_battle_poses(race_id,pose_key) values('manniska','standard')");
  const count=await db.query('select count(*)::int as n from race_battle_poses');
  expect(count.rows[0].n).toBe(1);
  await db.exec("grant usage on schema private to authenticated; grant execute on function private.is_admin() to authenticated;");
  await db.exec("set role authenticated;");
  const visible=await db.query("select count(*)::int as n from race_battle_poses");
  expect(visible.rows[0].n).toBe(0);
  await expect(db.exec("insert into race_battle_poses(race_id,pose_key) values('manniska','slagsmal')")).rejects.toThrow();
  const deniedUpdate=await db.exec("update race_battle_poses set pose_key='slagsmal'");
  expect(deniedUpdate[0].rowCount).toBe(0);
  await db.exec("reset role;");
 }finally{await db.close()}
},20000);
