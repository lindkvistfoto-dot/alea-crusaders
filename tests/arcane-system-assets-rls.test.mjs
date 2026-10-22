import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import profiles from '../config/hermes-system-assets.json';
const migration=readFileSync(new URL('../supabase/migrations/20261022043725_arcane_paper_doll_system_assets.sql',import.meta.url),'utf8');

it('applies the real migration and enforces publication constraints, RLS and column grants in PostgreSQL',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table public.hermes_jobs(kind text constraint hermes_jobs_kind_check check(kind in ('spell')));
   insert into public.hermes_jobs values('spell');`);
  await db.exec(migration);
  const rows=(await db.query('select * from arcane_system_assets order by asset_key')).rows;
  expect(rows).toHaveLength(2);
  expect(rows.map(x=>x.id)).toEqual(Object.values(profiles.assets).map(x=>x.id));
  expect((await db.query("select relrowsecurity from pg_class where oid='arcane_system_assets'::regclass")).rows[0].relrowsecurity).toBe(true);
  await db.exec("insert into hermes_jobs values('system-asset')");
  await expect(db.exec("insert into hermes_jobs values('unknown')")).rejects.toThrow();
  await db.exec('set role authenticated');
  expect((await db.query('select * from arcane_system_assets')).rows).toEqual([]);
  await expect(db.exec("update arcane_system_assets set asset_path='evil.webp'")).rejects.toThrow(/permission denied/);
  await expect(db.exec('delete from arcane_system_assets')).rejects.toThrow(/permission denied/);
  await expect(db.exec("insert into arcane_system_assets(id,asset_key,label) values(gen_random_uuid(),'other','bad')")).rejects.toThrow(/permission denied/);
  await db.exec('reset role; set role anon');
  await expect(db.query('select * from arcane_system_assets')).rejects.toThrow(/permission denied/);
  await db.exec('reset role; set role service_role');
  expect((await db.query('select * from arcane_system_assets')).rows).toHaveLength(2);
  await expect(db.exec("update arcane_system_assets set label='changed'")).rejects.toThrow(/permission denied/);
  await expect(db.exec('delete from arcane_system_assets')).rejects.toThrow(/permission denied/);
  await expect(db.exec("update arcane_system_assets set asset_path='evil.webp'")).rejects.toThrow(/arcane_system_asset_publication/);
  const key=rows[0].asset_key,sha='a'.repeat(64),path=`hermes/system-asset/${key}/${sha}.webp`;
  const update=`update arcane_system_assets set asset_path='${path}',app_sha256='${sha}',app_bytes=1234,width=1220,height=811,alpha_preserved=true where asset_key='${key}' and asset_path is null returning id`;
  expect((await db.query(update)).rows).toHaveLength(1);
  expect((await db.query(update)).rows).toHaveLength(0); // CAS cannot overwrite an active pointer.
  await expect(db.exec("update arcane_system_assets set width=640 where asset_path is not null")).rejects.toThrow(/arcane_system_asset_publication/);
  await expect(db.exec("update arcane_system_assets set alpha_preserved=false where asset_path is not null")).rejects.toThrow(/arcane_system_asset_publication/);
  await db.exec('reset role; set role authenticated');
  expect((await db.query('select asset_path from arcane_system_assets')).rows).toEqual([{asset_path:path}]);
 }finally{await db.close()}
},20000);
