import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import profiles from '../config/hermes-system-assets.json';
const script=readFileSync(new URL('../features/ui/arcane-paper-doll-assets.js',import.meta.url),'utf8');
function adapter(){const ctx={URL};vm.runInNewContext(script,ctx);return ctx.aleaArcanePaperDollAssets}
const rows=()=>Object.entries(profiles.assets).map(([key,def])=>({id:def.id,asset_key:key,
 width:def.display_size[0],height:def.display_size[1],alpha_preserved:true,
 app_bytes:1234,app_sha256:'a'.repeat(64),asset_path:`hermes/system-asset/${key}/${'a'.repeat(64)}.webp`,
 source_path:'drive://must-not-leak'}));

it('maps all registered stable keys to immutable BENGALI/Workshop asset references without archive provenance',()=>{
 const api=adapter(),result=api.toWorkshop(rows(),'https://example.supabase.co');
 expect(result.assets).toHaveLength(Object.keys(profiles.assets).length);
 for(const ref of result.assets){
  expect(ref.status).toBe('active');expect(ref.verified).toBe(true);
  expect(ref.bucket).toBe('alea-hermes-public');expect(ref.layouts).toEqual([]);
  expect(ref.src).toBe('https://example.supabase.co/storage/v1/object/public/alea-hermes-public/'+ref.path);
  expect(ref.source_path).toBeUndefined();expect(Object.isFrozen(ref)).toBe(true);
 }
 expect(Object.values(result.systemArt)).toEqual(result.assets.map(a=>a.id));
});
it('fails closed for missing, malformed, foreign, or partially activated rows',()=>{
 const api=adapter();
 for(const patch of [{asset_path:null},{asset_path:'https://evil.test/a.webp'},{asset_path:'../a.webp'},
  {width:0},{width:4097},{height:0},{app_sha256:'bad'},{alpha_preserved:false},{id:'not-a-uuid'},{app_bytes:500001}]){
  const result=api.toWorkshop([{...rows()[0],...patch}],'https://example.supabase.co');
  expect(result.assets).toEqual([]);expect(result.systemArt).toEqual({});
 }
 expect(api.toWorkshop([{asset_key:'__proto__'}],'https://example.supabase.co').assets).toEqual([]);
 expect(()=>api.toWorkshop([rows()[0],rows()[0]],'https://example.supabase.co')).toThrow('DUPLICATE');
 for(const origin of ['http://example.test','https://u:p@example.test','https://example.test/path','https://example.test?x=1'])
  expect(()=>api.toWorkshop([],origin)).toThrow('ORIGIN');
});
it('uses only injected authenticated dbJson and does not cache rows across calls or suppress access failures',async()=>{
 const api=adapter(),calls=[];
 expect(await api.load({baseUrl:'https://example.supabase.co',dbJson:async path=>{calls.push(path);return rows()}})).toHaveProperty('assets');
 expect(calls).toHaveLength(1);expect(calls[0]).toMatch(/^arcane_system_assets\?select=id,asset_key/);
 expect(calls[0]).not.toMatch(/hermes_jobs|source|archive/);
 expect((await api.load({baseUrl:'https://example.supabase.co',dbJson:async()=>[]})).assets).toEqual([]);
 await expect(api.load({baseUrl:'https://example.supabase.co',dbJson:async()=>{throw Error('denied')}})).rejects.toThrow('denied');
});

it('accepts a newly registered system asset without editing the frontend allowlist',()=>{
 const api=adapter(),key='arcane-bronze-ivory-future-triple-hex';
 const row={...rows()[0],id:'d8275cf9-4715-42d4-99c7-384ccb647c60',asset_key:key,width:1280,height:733,
  asset_path:`hermes/system-asset/${key}/${'a'.repeat(64)}.webp`};
 const result=api.toWorkshop([row],'https://example.supabase.co');
 expect(result.assets).toHaveLength(1);expect(result.systemArt[key]).toBe(row.id);
 expect(()=>api.toWorkshop([row,{...row,asset_key:'arcane-other-asset',asset_path:`hermes/system-asset/arcane-other-asset/${'a'.repeat(64)}.webp`}],'https://example.supabase.co')).toThrow('DUPLICATE');
});
