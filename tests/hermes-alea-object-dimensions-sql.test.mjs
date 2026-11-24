import {expect,it} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

it('migrates existing receipts and accepts extended dimensions only within the map-object pixel budget',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`
   create schema private;
   create schema auth;
   create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
   create table private.hermes_alea_settings(singleton boolean,enabled boolean);
   insert into private.hermes_alea_settings values(true,true);
   create table public.hermes_alea_jobs(target_kind text,width int check(width between 1 and 2048),height int check(height between 1 and 2048));
   insert into public.hermes_alea_jobs values('weapon',2048,2048);
  `);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  const file=(await readdir(dir)).find(name=>name.endsWith('_hermes_alea_object_image_dimensions.sql'));
  await db.exec(await readFile(new URL(file,dir),'utf8'));
  const insert=(kind,width,height)=>db.query('insert into public.hermes_alea_jobs values ($1,$2,$3)',[kind,width,height]);
  await insert('map-object',null,null);
  await insert('map-object',4096,1024);
  await insert('map-object',1024,4096);
  await expect(insert('weapon',2172,724)).rejects.toThrow(/width_check/);
  await expect(insert('map-object',4097,1)).rejects.toThrow(/width_check/);
  await expect(insert('map-object',1,4097)).rejects.toThrow(/height_check/);
  await expect(insert('map-object',4096,1025)).rejects.toThrow(/pixel_budget/);
  expect((await db.query('select count(*)::int as n from public.hermes_alea_jobs')).rows[0].n).toBe(4);
  const cap=(await db.query('select private.hermes_alea_capabilities() as cap')).rows[0].cap;
  expect(cap).toMatchObject({max_dimension:2048,max_pixels:4194304,target_profiles:{'map-object':{max_dimension:4096}}});
 } finally {
  await db.close();
 }
});
