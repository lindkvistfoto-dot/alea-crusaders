import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261025140000_honor_global_gm_access.sql',import.meta.url),'utf8');

it('lets campaign GMs manage only the global Laurel/Sir Robin records and their reliefs',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;
   create schema auth; create schema private;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function private.is_admin() returns boolean language sql stable as $$ select false $$;
   create table public.campaign_members(user_id uuid,campaign_id uuid,role text);
   create table public.honor_definitions(id uuid primary key,name text not null,campaign_id uuid,status text not null);
   create table public.honor_relief_variants(id uuid primary key,honor_id uuid not null references public.honor_definitions(id),name text,status text);
   grant select,update on public.honor_definitions to authenticated;
   grant select,insert,update on public.honor_relief_variants to authenticated;
   insert into public.campaign_members values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','gm');
   insert into public.campaign_members values('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','player');
   insert into public.honor_definitions values
    ('10000000-0000-4000-8000-000000000001','ARCANE LAUREL BADGE',null,'draft'),
    ('10000000-0000-4000-8000-000000000002','Sir Robin',null,'draft'),
    ('10000000-0000-4000-8000-000000000003','Other global honor',null,'draft');
   insert into public.honor_relief_variants values
    ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','laurel relief','draft'),
    ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','other relief','draft');
   alter table public.honor_definitions enable row level security;
   alter table public.honor_relief_variants enable row level security;`);
  await db.exec(migration);
  await db.exec(`set role authenticated;
   set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
  expect((await db.query('select name from public.honor_definitions order by name')).rows)
   .toEqual([{name:'ARCANE LAUREL BADGE'},{name:'Sir Robin'}]);
  expect((await db.query("update public.honor_definitions set status='active' where name='Sir Robin' returning name")).rows)
   .toEqual([{name:'Sir Robin'}]);
  expect((await db.query('select name from public.honor_relief_variants')).rows)
   .toEqual([{name:'laurel relief'}]);
  expect((await db.query("update public.honor_relief_variants set status='published' where name='laurel relief' returning name")).rows)
   .toEqual([{name:'laurel relief'}]);
  await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'");
  expect((await db.query('select name from public.honor_definitions')).rows).toEqual([]);
  expect((await db.query('select name from public.honor_relief_variants')).rows).toEqual([]);
 }finally{await db.close()}
},20000);
