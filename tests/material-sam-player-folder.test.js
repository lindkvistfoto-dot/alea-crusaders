import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createSam,SAM_PAGE_SIZE} from '../features/material/player-folder.js';
const campaign='846e8089-24da-4825-af34-32903117152a';
const foreign='846e8089-24da-4825-af34-32903117152b';
const asset={id:'47ce99d4-3ff5-4f88-adff-74cba3331143',campaign_id:campaign,
 title:'Den gamla kyrkan',category:'location',asset_kind:'image',storage_bucket:'campaign-materials',
 storage_path:campaign+'/asset/image.webp',archived_at:null};
function harness({gm=true,logged=true,shared=[],delay=false}={}){
 let role=gm,active=logged,current=campaign;
 const calls=[];
 const request=async(path,options)=>{
  calls.push({path,options});
  if(path.startsWith('campaign_material_shares?'))return shared;
  if(path.startsWith('campaign_materials?'))return shared.map(s=>({...asset,id:s.material_id}));
  if(path==='rpc/sam_set_material_share'){
   const data=JSON.parse(options.body);
   return {campaign_id:data.p_campaign_id,material_id:data.p_material_id,shared:data.p_shared,changed:1};
  }
  return [];
 };
 const sam=createSam({getCampaign:()=>current,isAuthenticated:()=>active,isGM:()=>role,request});
 return {sam,calls,setRole:x=>{role=x},setCampaign:x=>{current=x},setLogged:x=>{active=x}};
}
describe('Sam Gamgi – persistent player material folder',()=>{
 it('uses strictly scoped active shares and only reads the metadata for their IDs',async()=>{
  const h=harness({shared:[{id:'r1',material_id:asset.id,created_at:'2026-10-08T10:00:00Z'}]});
  await h.sam.load();
  expect(h.calls[0].path).toContain('campaign_material_shares?campaign_id=eq.'+campaign);
  expect(h.calls[0].path).toContain('revoked_at=is.null');
  expect(h.calls[0].path).toContain('limit='+(SAM_PAGE_SIZE+1));
  expect(h.calls[1].path).toContain('campaign_materials?campaign_id=eq.'+campaign);
  expect(h.calls[1].path).toContain('id=in.('+asset.id+')');
  expect(h.calls[1].path).toContain('archived_at=is.null');
  expect(h.calls[1].path).not.toContain('gm_notes');
  expect(h.sam.state.rows[0].material.title).toBe('Den gamla kyrkan');
 });
 it('allows players to read shared material but not to share or revoke',async()=>{
  const h=harness({gm:false,shared:[{id:'r1',material_id:asset.id}]});
  await h.sam.load();
  expect(h.sam.state.rows).toHaveLength(1);
  expect(await h.sam.share(asset)).toBeNull();
  expect(await h.sam.revoke(asset)).toBeNull();
  expect(h.calls.every(call=>call.path!=='rpc/sam_set_material_share')).toBe(true);
 });
 it('shares selected material through an authenticated GM-only RPC',async()=>{
  const h=harness();
  expect(await h.sam.share(asset)).toEqual({
   campaign_id:campaign,material_id:asset.id,shared:true,changed:1
  });
  const mutation=h.calls[0];
  expect(mutation.path).toBe('rpc/sam_set_material_share');
  expect(mutation.options.method).toBe('POST');
  expect(JSON.parse(mutation.options.body)).toEqual({
   p_campaign_id:campaign,p_material_id:asset.id,p_shared:true
  });
  expect(h.calls.every(x=>!x.path.includes('/storage/'))).toBe(true);
 });
 it('revoke uses same RPC with explicit false, never DELETE on material/storage',async()=>{
  const h=harness();await h.sam.revoke(asset);
  expect(JSON.parse(h.calls[0].options.body).p_shared).toBe(false);
  expect(h.calls.every(x=>!x.path.includes('campaign_materials?')&&!x.path.includes('/storage/'))).toBe(true);
 });
 it('rejects archived and other-campaign material before RPC',async()=>{
  const h=harness();
  expect(await h.sam.share({...asset,archived_at:'2026-10-08T09:00:00Z'})).toBeNull();
  expect(await h.sam.share({...asset,campaign_id:foreign})).toBeNull();
  expect(h.calls).toHaveLength(0);
 });
 it('resets folder and share ids when switching campaigns',async()=>{
  const h=harness({shared:[{id:'r1',material_id:asset.id}]});
  await h.sam.load();expect(h.sam.state.rows).toHaveLength(1);
  h.setCampaign(foreign);h.sam.reset();
  expect(h.sam.state.rows).toHaveLength(0);
  expect(h.sam.state.sharedIds.size).toBe(0);
  expect(h.sam.state.page).toBe(0);
 });
 it('anonymous users never read folder or change shares',async()=>{
  const h=harness({logged:false});
  await h.sam.load();await h.sam.share(asset);
  expect(h.calls).toHaveLength(0);
 });
 it('batch share persists multiple material selections sequentially',async()=>{
  const h=harness();
  const another={...asset,id:'1a2cc413-9d6a-4385-b49e-9488b8f5ee5c'};
  expect(await h.sam.shareMany([asset,another])).toEqual({shared:2,failed:0});
  expect(h.calls).toHaveLength(2);
 });
 it('paginates shares, respecting hasNext and exhausted page bounds',async()=>{
  const shared=Array.from({length:SAM_PAGE_SIZE+1},(_,i)=>({id:'r'+i,material_id:i===0?asset.id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0')}));
  const h=harness({shared});
  await h.sam.load();
  expect(h.sam.state.hasNext).toBe(true);
  expect(h.sam.state.rows).toHaveLength(SAM_PAGE_SIZE);
  await h.sam.page(1);expect(h.sam.state.page).toBe(1);
 });
 it('both presentation and player folder remain separate data sets',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261008_sam_player_library_share.sql',import.meta.url),'utf8');
  const foundation=readFileSync(new URL('../supabase/migrations/20261008_gandalf_material_foundation.sql',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../features/material/player-folder-ui.js',import.meta.url),'utf8');
  const viewer=readFileSync(new URL('../features/material/viewer.js',import.meta.url),'utf8');
  const bilbo=readFileSync(new URL('../features/material/library.js',import.meta.url),'utf8');
  expect(sql).toContain('security invoker');
  expect(sql).toContain('private.is_campaign_gm(p_campaign_id)');
  expect(sql).toContain('on conflict(campaign_id,material_id) where revoked_at is null');
  expect(sql).toContain('revoked_at=now()');
  expect(sql).toContain('m.archived_at is null');
  expect(foundation).toContain('campaign_material_shares_player_read');
  expect(ui).toContain('legolas.previewMaterial(entry.material)');
  expect(ui).toContain('samShareSelection');
  expect(viewer).toContain('data-sam-share');
  expect(bilbo).toContain('samShareMaterial');
  expect(ui).not.toContain('createSignedUrl');
 });
});
