import {describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createCoreActionsTargetAdapter} from '../features/hermes-core/actions-target-adapter.js';
import {normalizeCoreQueueTarget} from '../features/hermes-core/queue-target.js';

// Exercise the production adapter against Postgres column grants and CAS queries,
// using the same restricted INSERT/UPDATE contract as the live database.
async function fixture(kind) {
 const pg=new PGlite();
 await pg.exec(`
 create role service_role;
 create table arcane_system_assets (
 id uuid primary key, asset_key text unique, label text, asset_path text,
 app_sha256 text, app_bytes int, width int, height int, alpha_preserved bool,
 image_revision bigint default 0 not null);
 create table honor_definitions (id uuid primary key,image_asset_id text,image_revision bigint default 0 not null);
 create table honor_relief_variants (id uuid primary key,honor_id uuid,material text,image_asset_id text,image_revision bigint default 0 not null);
 grant select on arcane_system_assets,honor_definitions,honor_relief_variants to service_role;
 grant insert(id,asset_key,label) on arcane_system_assets to service_role;
 grant update(asset_path,app_sha256,app_bytes,width,height,alpha_preserved) on arcane_system_assets to service_role;
 create function bump_revision() returns trigger language plpgsql as $$ begin
 if to_jsonb(new) is distinct from to_jsonb(old) then new.image_revision=old.image_revision+1; end if;
 return new; end $$;
 create trigger bump before update on arcane_system_assets for each row execute function bump_revision();
 create trigger bump before update on honor_definitions for each row execute function bump_revision();
 create trigger bump before update on honor_relief_variants for each row execute function bump_revision();
 insert into honor_definitions(id) values ('6a67121d-67ee-4943-82a3-83a15334d815');
 insert into honor_relief_variants(id,honor_id,material) values ('c45228b1-c692-4a4c-9f15-4ed97da9b57c','6a67121d-67ee-4943-82a3-83a15334d815','enamel');
 `);
 await pg.exec(readFileSync(new URL('../supabase/legacy-migrations/pre-baseline/20261028061810_hermes_core_honor_image_grants.sql',import.meta.url),'utf8'));
 await pg.exec('set role service_role');
 const db={from(table) {
  let op='select',values,columns='*';const filters=[];
  const q={
   select(v){columns=v;return q;},insert(v){op='insert';values=v;return q;},update(v){op='update';values=v;return q;},
   eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},
   single(){return run(true);},maybeSingle(){return run(true);},then(a,b){return run(false).then(a,b);}
  };
  async function run(single){
   const params=[];const param=v=>{params.push(v);return '$'+params.length;};
   const where=()=>filters.length?' where '+filters.map(([k,v])=>v===null?`${k} is null`:`${k}=${param(v)}`).join(' and '):'';
   let sql;
   if(op==='insert') sql=`insert into ${table} (${Object.keys(values).join(',')}) values (${Object.values(values).map(param).join(',')})`;
   else if(op==='update') sql=`update ${table} set ${Object.entries(values).map(([k,v])=>`${k}=${param(v)}`).join(',')}${where()} returning ${columns}`;
   else sql=`select ${columns} from ${table}${where()}`;
   try {const {rows}=await pg.query(sql,params);return {data:single?rows[0]??null:rows,error:null};}
   catch(error){return {data:null,error};}
  }
  return q;
 }};
 const target={kind,id:kind==='system'?'arcane-test':kind==='honor-definition'?'6a67121d-67ee-4943-82a3-83a15334d815':'c45228b1-c692-4a4c-9f15-4ed97da9b57c',material:'enamel',label:'Test'};
 const registryKey=kind==='system'?target.id:'arcane-'+kind+'-test';
 const adapter=createCoreActionsTargetAdapter({db,prepared:{target,label:'Test'},registryKey});
 const metadata={path:`hermes/system-asset/${registryKey}/${'a'.repeat(64)}.webp`,sha256:'a'.repeat(64),bytes:123,width:640,height:640,alphaPreserved:true};
 return {pg,db,target,registryKey,metadata,...adapter};
}
describe('Actions publisher with restricted production grants',()=>{
 for(const kind of ['system','honor-definition','honor-relief']) {
  it(`${kind}: creates/attaches, replaces, rejects stale writes and retries without duplicates`,async()=>{
   const f=await fixture(kind);
   try {
    const previous=await f.readTarget(f.target);
    const first=await f.activate(f.target,previous?.revision??0,previous?.key??null,f.metadata,kind==='system');
    expect(first.key).toBe(kind==='system'?f.metadata.path:f.registryKey);
    expect((await f.readTarget(f.target)).key).toBe(first.key);
    // A different active pointer wins over an outdated publisher snapshot.
    const table=kind==='system'?'arcane_system_assets':kind==='honor-definition'?'honor_definitions':'honor_relief_variants';
    const pointer=kind==='system'?'asset_path':'image_asset_id';
    await f.pg.exec('reset role');
    await f.pg.query(`update ${table} set ${pointer}=$1`,['previous-image']);
    await f.pg.exec('set role service_role');
    await expect(f.activate(f.target,0,null,f.metadata,false)).rejects.toThrow(/CHANGED|CONCURRENT/);
    const now=await f.readTarget(f.target);
    const replaced=await f.activate(f.target,now.revision,now.key,f.metadata,false);
    expect(replaced.key).toBe(first.key);
    await f.activate(f.target,now.revision,now.key,f.metadata,false);
    const {rows}=await f.pg.query('select count(*)::int as count from arcane_system_assets');
    expect(rows[0].count).toBe(1);
   } finally {await f.pg.close();}
  });
 }
 it('does not widen INSERT grants to metadata or permit honor metadata changes',async()=>{
  const f=await fixture('honor-definition');
  try {
   const result=await f.db.from('arcane_system_assets').insert({id:crypto.randomUUID(),asset_key:'bad',label:'Bad',asset_path:'unverified'});
   expect(result.error?.code).toBe('42501');
   const denied=await f.db.from('honor_definitions').update({image_revision:99}).eq('id',f.target.id).select('id').maybeSingle();
   expect(denied.error?.code).toBe('42501');
  } finally {await f.pg.close();}
 });
 it('uses live relief material values and normalizes earlier request aliases',()=>{
  for(const [input,expected] of [['metal','metal'],['wood','wood'],['stone','stone'],['metal_relief','metal'],['carved_wood','wood']])
   expect(normalizeCoreQueueTarget({schema:2,target:{kind:'honor-relief',id:'c45228b1-c692-4a4c-9f15-4ed97da9b57c',material:input}}).material).toBe(expected);
 });
});
