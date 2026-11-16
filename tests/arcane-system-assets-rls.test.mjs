import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import profiles from '../config/hermes-system-assets.json';
const migrations=[
 '20261022043725_arcane_paper_doll_system_assets.sql',
 '20261022220000_extend_arcane_system_assets.sql',
 '20261023173000_dynamic_system_asset_constraints.sql',
 '20261023190000_hermes_system_asset_registration.sql',
 '20261024200000_arcane_trophy_room_opaque_scene.sql',
].map(name=>readFileSync(new URL('../supabase/legacy-migrations/pre-baseline/'+name,import.meta.url),'utf8'));

it('applies the real migration and enforces publication constraints, RLS and column grants in PostgreSQL',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table public.hermes_jobs(kind text constraint hermes_jobs_kind_check check(kind in ('spell')));
   insert into public.hermes_jobs values('spell');`);
  for(const migration of migrations)await db.exec(migration);
  const rows=(await db.query('select * from arcane_system_assets order by asset_key')).rows;
  await db.exec("insert into arcane_system_assets(id,asset_key,label) values('d8275cf9-4715-42d4-99c7-384ccb647c60','arcane-bronze-ivory-double-hex-side-high-angle','Double Hex')");
  await expect(db.exec("insert into arcane_system_assets(id,asset_key,label) values(gen_random_uuid(),'invalid key','Bad')")).rejects.toThrow();
  expect(rows.length).toBeGreaterThanOrEqual(5);
  expect(rows.every(x=>profiles.assets[x.asset_key]?.id===x.id)).toBe(true);
  expect((await db.query("select relrowsecurity from pg_class where oid='arcane_system_assets'::regclass")).rows[0].relrowsecurity).toBe(true);
  await db.exec(`insert into arcane_system_assets(id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved) values('af406969-b1c6-58e7-8ea8-4bf3173c9b4e','arcane-trophy-room-v2.2','Trophy Room','hermes/system-asset/arcane-trophy-room-v2.2/'||repeat('a',64)||'.webp',repeat('a',64),250000,1280,720,false)`);
  await expect(db.exec(`insert into arcane_system_assets(id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved) values(gen_random_uuid(),'arcane-paper-doll-test','Test','hermes/system-asset/arcane-paper-doll-test/'||repeat('b',64)||'.webp',repeat('b',64),250000,1280,720,false)`)).rejects.toThrow(/arcane_system_asset_publication/);
  await db.exec("insert into hermes_jobs values('system-asset')");
  await expect(db.exec("insert into hermes_jobs values('unknown')")).rejects.toThrow();
  await db.exec('set role authenticated');
  expect((await db.query('select asset_key from arcane_system_assets where asset_path is not null')).rows).toEqual([{asset_key:'arcane-trophy-room-v2.2'}]);
  await expect(db.exec("update arcane_system_assets set asset_path='evil.webp'")).rejects.toThrow(/permission denied/);
  await expect(db.exec('delete from arcane_system_assets')).rejects.toThrow(/permission denied/);
  await expect(db.exec("insert into arcane_system_assets(id,asset_key,label) values(gen_random_uuid(),'other','bad')")).rejects.toThrow(/permission denied/);
  await db.exec('reset role; set role anon');
  await expect(db.query('select * from arcane_system_assets')).rejects.toThrow(/permission denied/);
  await db.exec('reset role; set role service_role');
  expect((await db.query('select * from arcane_system_assets')).rows).toHaveLength(rows.length+2);
  await expect(db.exec("update arcane_system_assets set label='changed'")).rejects.toThrow(/permission denied/);
  await expect(db.exec('delete from arcane_system_assets')).rejects.toThrow(/permission denied/);
  await expect(db.exec("update arcane_system_assets set asset_path='evil.webp'")).rejects.toThrow(/arcane_system_asset_publication/);
  await db.exec("insert into arcane_system_assets(id,asset_key,label) values('11111111-1111-4111-8111-111111111111','arcane-hermes-regression-probe','Regression Probe')");
  await expect(db.exec("update arcane_system_assets set label='changed' where asset_key='arcane-hermes-regression-probe'")).rejects.toThrow(/permission denied/);
  const key='arcane-paper-doll-hexagon-base',profile=profiles.assets[key],sha='a'.repeat(64),path=`hermes/system-asset/${key}/${sha}.webp`;
  const update=`update arcane_system_assets set asset_path='${path}',app_sha256='${sha}',app_bytes=1234,width=${profile.display_size[0]},height=${profile.display_size[1]},alpha_preserved=true where asset_key='${key}' and asset_path is null returning id`;
  expect((await db.query(update)).rows).toHaveLength(1);
  expect((await db.query(update)).rows).toHaveLength(0); // CAS cannot overwrite an active pointer.
  await expect(db.exec("update arcane_system_assets set width=0 where asset_path is not null")).rejects.toThrow(/arcane_system_asset_publication/);
  await expect(db.exec("update arcane_system_assets set alpha_preserved=false where asset_path is not null")).rejects.toThrow(/arcane_system_asset_publication/);
  await db.exec('reset role; set role authenticated');
  expect((await db.query("select asset_path from arcane_system_assets where asset_key='arcane-paper-doll-hexagon-base'")).rows).toEqual([{asset_path:path}]);
 }finally{await db.close()}
},20000);
