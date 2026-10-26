import {beforeEach,afterEach,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const sql=readFileSync(new URL('../supabase/migrations/20261026092330_hermes_alea_isolated_pilot.sql',import.meta.url),'utf8');
const adapterSql=readFileSync(new URL('../supabase/migrations/20261026172000_hermes_alea_target_adapter_boundary.sql',import.meta.url),'utf8');
const cleanupSql=readFileSync(new URL('../supabase/migrations/20261026093615_hermes_alea_cleanup_reservations.sql',import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',target='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let db;
beforeEach(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema private;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${user}'),('${other}');
 create table public.profiles(id uuid primary key,is_admin boolean);insert into profiles values('${user}',true),('${other}',false);
 create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and is_admin)$$;
 create table public.campaign_members(user_id uuid,campaign_id uuid,role text);
 create table public.honor_definitions(id uuid primary key default gen_random_uuid(),name text,category text,campaign_id uuid,image_asset_id text,updated_at timestamptz);
 create table public.honor_relief_variants(id uuid primary key default gen_random_uuid(),honor_id uuid references public.honor_definitions(id),image_asset_id text,updated_at timestamptz);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema auth,private,storage to authenticated,anon,service_role;
 grant select,insert,update,delete on storage.objects to authenticated;
 grant all on all tables in schema public,storage to service_role;
 grant select,insert,update,delete on honor_definitions,honor_relief_variants to authenticated;
 insert into honor_definitions(id,name,category) values('${target}','Pilot','medal');`);
 await db.exec(sql);
 await db.exec(cleanupSql);
 await db.exec(adapterSql);
 await db.exec(`update private.hermes_alea_settings set enabled=true;set role authenticated;set request.jwt.claim.sub='${user}';`);
},20000);
afterEach(async()=>db?.close());
const rpc=async(name,arg)=> (await db.query(`select public.${name}($1::jsonb) as result`,[JSON.stringify(arg)])).rows[0].result;
const req=(extra={})=>({target_kind:'definition',target_id:target,operation:'CREATE',expected_revision:0,idempotency_key:randomUUID(),source_sha256:'a'.repeat(64),output_sha256:'b'.repeat(64),source_mime:'image/png',source_bytes:100,output_bytes:80,...extra});
async function ready(j){
 await db.exec(`reset role;insert into storage.objects(bucket_id,name) values('hermes-alea-originals','${j.source_path}'),('hermes-alea-display','${j.output_path}');set role service_role;`);
 await db.query('select public.hermes_alea_verify($1,$2::jsonb)',[j.id,JSON.stringify({...j,width:32,height:32,alpha_preserved:true})]);
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${user}';`);
}
const finish=async j=>(await db.query('select public.hermes_alea_finalize($1) as result',[j.id])).rows[0].result;
it('activates and queues atomically, retries return same job and revision',async()=>{
 const r=req(),j=await rpc('hermes_alea_begin',r);expect((await rpc('hermes_alea_begin',r)).id).toBe(j.id);
 await expect(finish(j)).rejects.toThrow('UPLOAD_NOT_VERIFIED');
 expect((await db.query('select image_asset_id from honor_definitions')).rows[0].image_asset_id).toBeNull();
 await ready(j);const done=await finish(j);expect(done.archive_state).toBe('queued');expect(done.result_revision).toBe(1);expect((await finish(j)).id).toBe(j.id);
 expect((await db.query('select image_asset_id from honor_definitions')).rows[0].image_asset_id).toBe('hermes-alea:'+j.id);
});
it('rejects conflicting idempotency and untrusted verification',async()=>{
 const r=req(),j=await rpc('hermes_alea_begin',r);
 await expect(rpc('hermes_alea_begin',{...r,source_bytes:101})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 await expect(db.query('select public.hermes_alea_verify($1,$2::jsonb)',[j.id,'{}'])).rejects.toThrow('permission denied');
});
it('two intents against one revision have exactly one winner',async()=>{
 const a=await rpc('hermes_alea_begin',req()),b=await rpc('hermes_alea_begin',req());await ready(a);await ready(b);await finish(a);
 await expect(finish(b)).rejects.toThrow('IMAGE_REVISION_CONFLICT');
 expect((await db.query('select archive_state from hermes_alea_jobs where id=$1',[b.id])).rows[0].archive_state).toBe('not_required');
});
it('replace and remove preserve history, leave files, and block direct mutation/deletion',async()=>{
 const a=await rpc('hermes_alea_begin',req());await ready(a);await finish(a);
 await expect(db.exec(`update honor_definitions set image_asset_id=null where id='${target}'`)).rejects.toThrow('USE_HERMES_ALEA');
 await expect(db.exec(`delete from honor_definitions where id='${target}'`)).rejects.toThrow('REMOVE_IMAGE_BEFORE_DELETE');
 const b=await rpc('hermes_alea_begin',req({operation:'REPLACE',expected_revision:1}));await ready(b);const done=await finish(b);
 expect(done.previous_key).toBe('hermes-alea:'+a.id);expect(done.detached_at).toBeTruthy();expect(done.result_revision).toBe(2);
 const remove=req({operation:'REMOVE',expected_revision:2});const gone=await rpc('hermes_alea_remove',remove);
 expect(gone.state).toBe('removed');expect(gone.result_revision).toBe(3);expect((await rpc('hermes_alea_remove',remove)).id).toBe(gone.id);
 expect((await db.query('select count(*) as n from storage.objects')).rows[0].n).toBe(4);
 expect((await db.query('select image_asset_id from honor_definitions')).rows[0].image_asset_id).toBeNull();
});
it('denies other users and foreign job paths, denies overwrite and delete',async()=>{
 const j=await rpc('hermes_alea_begin',req());
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['hermes-alea-originals',j.source_path]);
 await expect(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['hermes-alea-originals',j.source_path])).rejects.toThrow('duplicate key');
 expect((await db.query('delete from storage.objects returning id')).rows).toEqual([]);
 await db.exec(`set request.jwt.claim.sub='${other}';`);
 await expect(rpc('hermes_alea_begin',req())).rejects.toThrow('FORBIDDEN');
 await expect(finish(j)).rejects.toThrow('FORBIDDEN');
 expect((await db.query('select * from hermes_alea_jobs')).rows).toEqual([]);
 await expect(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['hermes-alea-display',j.output_path])).rejects.toThrow('row-level security');
});
it('reports seven/thirty-day candidates and never marks an active output',async()=>{
 const j=await rpc('hermes_alea_begin',req());await ready(j);await finish(j);
 await db.exec(`reset role;update hermes_alea_jobs set archive_state='verified',archive_drive_id='drive',archive_verified_at=now()-interval '8 days';set role service_role;`);
 let report=(await db.query('select * from hermes_alea_cleanup_report')).rows[0];expect(report.source_candidate).toBe(true);expect(report.output_candidate).toBe(false);
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${user}';`);
 await rpc('hermes_alea_remove',req({operation:'REMOVE',expected_revision:1}));
 await db.exec(`reset role;update hermes_alea_jobs set detached_at=now()-interval '31 days' where operation='REMOVE';set role service_role;`);
 report=(await db.query('select * from hermes_alea_cleanup_report where id=$1',[j.id])).rows[0];expect(report.output_candidate).toBe(true);
 await db.exec(`reset role;update hermes_alea_jobs set archive_state='needs_attention' where id='${j.id}';set role service_role;`);
 expect((await db.query('select output_candidate from hermes_alea_cleanup_report where id=$1',[j.id])).rows[0].output_candidate).toBe(false);
});
it('leases fence old workers and ordinary failed jobs become retryable',async()=>{
 const j=await rpc('hermes_alea_begin',req());await ready(j);await finish(j);await db.exec('reset role;set role service_role;');
 const claim=(await db.query('select * from hermes_alea_claim(3)')).rows[0];expect(claim.id).toBe(j.id);
 await expect(db.query('select hermes_alea_archive_result($1,$2,null,$3)',[j.id,randomUUID(),'NETWORK_ERROR'])).rejects.toThrow('STALE_LEASE');
 await db.query('select hermes_alea_archive_result($1,$2,null,$3)',[j.id,claim.lease_token,'NETWORK_ERROR']);
 expect((await db.query('select archive_state from hermes_alea_jobs where id=$1',[j.id])).rows[0].archive_state).toBe('retry_wait');
});
it('defaults disabled and enforces upload quota',async()=>{
 await db.exec('reset role;update private.hermes_alea_settings set enabled=false;set role authenticated;');
 await expect(rpc('hermes_alea_begin',req())).rejects.toThrow('DISABLED');
 await db.exec('reset role;update private.hermes_alea_settings set enabled=true,max_pending=1;set role authenticated;');
 await rpc('hermes_alea_begin',req());await expect(rpc('hermes_alea_begin',req())).rejects.toThrow('QUOTA');
});
it('cleanup is gated and reservation blocks re-linking, including interrupted acknowledgements',async()=>{
 const j=await rpc('hermes_alea_begin',req());await ready(j);await finish(j);
 await rpc('hermes_alea_remove',req({operation:'REMOVE',expected_revision:1}));
 await db.exec(`reset role;update hermes_alea_jobs set archive_state='verified',archive_drive_id='drive',archive_verified_at=now()-interval '8 days' where id='${j.id}';update hermes_alea_jobs set detached_at=now()-interval '31 days' where operation='REMOVE';set role service_role;`);
 await expect(db.query("select hermes_alea_cleanup($1,'output','reserve')",[j.id])).rejects.toThrow('CLEANUP_NOT_APPROVED');
 await db.exec('reset role;update private.hermes_alea_settings set cleanup_enabled=true;set role service_role;');
 await db.query("select hermes_alea_cleanup($1,'output','reserve')",[j.id]);
 await expect(db.query('update honor_definitions set image_asset_id=$1 where id=$2',['hermes-alea:'+j.id,target])).rejects.toThrow('IMAGE_RESERVED_OR_MISSING');
 // A restart repeats the reservation instead of releasing it.
 await db.query("select hermes_alea_cleanup($1,'output','reserve')",[j.id]);
 await db.query("select hermes_alea_cleanup($1,'output','ack')",[j.id]);
 await db.query("select hermes_alea_cleanup($1,'output','ack')",[j.id]);
 expect((await db.query('select output_deleted_at from hermes_alea_jobs where id=$1',[j.id])).rows[0].output_deleted_at).toBeTruthy();
});
it('shared active references block output cleanup and latest detach restarts the clock',async()=>{
 const j=await rpc('hermes_alea_begin',req());await ready(j);await finish(j);
 await rpc('hermes_alea_remove',req({operation:'REMOVE',expected_revision:1}));
 await db.exec(`reset role;insert into honor_relief_variants(honor_id,image_asset_id) values('${target}',null);update honor_relief_variants set image_asset_id='hermes-alea:${j.id}';
 update hermes_alea_jobs set archive_state='verified',archive_drive_id='drive',archive_verified_at=now()-interval '8 days' where id='${j.id}';
 update hermes_alea_jobs set detached_at=now()-interval '31 days' where operation='REMOVE';set role service_role;`);
 expect((await db.query('select output_candidate from hermes_alea_cleanup_report where id=$1',[j.id])).rows[0].output_candidate).toBe(false);
});
it('legacy A to B to A changes increment revision and reject an old intent',async()=>{
 await db.exec("update honor_definitions set image_asset_id='A';");
 const j=await rpc('hermes_alea_begin',req({operation:'REPLACE',expected_revision:1}));await ready(j);
 await db.exec("update honor_definitions set image_asset_id='B';update honor_definitions set image_asset_id='A';");
 await expect(finish(j)).rejects.toThrow('IMAGE_REVISION_CONFLICT');
});
it('incomplete Storage pair cannot activate even with a trusted receipt',async()=>{
 const j=await rpc('hermes_alea_begin',req());await ready(j);
 await db.exec(`reset role;delete from storage.objects where bucket_id='hermes-alea-originals';set role authenticated;`);
 await expect(finish(j)).rejects.toThrow('UPLOAD_INCOMPLETE');
 expect((await db.query('select image_asset_id from honor_definitions')).rows[0].image_asset_id).toBeNull();
});
it('persists one Drive intent per job under a live lease',async()=>{
 const j=await rpc('hermes_alea_begin',req());await ready(j);await finish(j);await db.exec('reset role;set role service_role;');
 const claim=(await db.query('select * from hermes_alea_claim(1)')).rows[0];
 const first=(await db.query('select hermes_alea_archive_intent($1,$2,$3) as id',[j.id,claim.lease_token,'fixed-drive-id-001'])).rows[0].id;
 const second=(await db.query('select hermes_alea_archive_intent($1,$2,$3) as id',[j.id,claim.lease_token,'different-drive-id'])).rows[0].id;
 expect(second).toBe(first);
 await expect(db.query('select hermes_alea_archive_result($1,$2,$3,null)',[j.id,claim.lease_token,'different-drive-id'])).rejects.toThrow('STALE_LEASE');
 await db.query('select hermes_alea_archive_result($1,$2,$3,null)',[j.id,claim.lease_token,first]);
 expect((await db.query('select archive_state from hermes_alea_jobs where id=$1',[j.id])).rows[0].archive_state).toBe('verified');
});
it('matches campaign GM scope without granting access to other global records',async()=>{
 await db.exec(`reset role;insert into campaign_members values('${other}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','gm');update honor_definitions set campaign_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';set role authenticated;set request.jwt.claim.sub='${other}';`);
 const j=await rpc('hermes_alea_begin',req());expect(j.requested_by).toBe(other);
 await db.exec('reset role;update honor_definitions set campaign_id=null;set role authenticated;');
 await expect(rpc('hermes_alea_begin',req())).rejects.toThrow('FORBIDDEN');
});
