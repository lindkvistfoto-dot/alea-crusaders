import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createFrodo} from '../features/material/presentation.js';

const campaign='846e8089-24da-4825-af34-32903117152a';
const other='006e8089-24da-4825-af34-32903117152a';
const row={id:'de9537ff-4747-402b-a99c-e527e1f1c2da',campaign_id:campaign,
 title:'Riddar Johan',category:'npc',asset_kind:'image',storage_bucket:'campaign-actor-images',
 storage_path:campaign+'/npc/a/portrait.webp',archived_at:null};
function harness({gm=true,logged=true,cross=false,revision=0,id=null,materials=[row],conflict=false}={}){
 let auth=logged,campaignId=cross?other:campaign,gmFlag=gm,revisionNow=revision,presentedId=id;
 const calls=[],shown=[],cleared=[],notice=[];
 const request=async(path,options)=>{
  calls.push({path,options});
  if(path.startsWith('campaign_material_presentations?'))
   return revisionNow?[{campaign_id:campaignId,material_id:presentedId,revision:revisionNow}]:[];
  if(path.startsWith('campaign_materials?'))return materials.filter(x=>x.id===presentedId&&x.campaign_id===campaignId);
  if(path==='rpc/frodo_set_presentation'){
   if(conflict)throw Error('Presentation changed');
   const payload=JSON.parse(options.body);
   if(payload.p_expected_revision!==revisionNow)throw Error('CAS mismatch');
   revisionNow++;presentedId=payload.p_material_id;
   return {campaign_id:campaignId,material_id:presentedId,revision:revisionNow};
  }
  return [];
 };
 const api=createFrodo({
  getCampaign:()=>campaignId,isAuthenticated:()=>auth,isGM:()=>gmFlag,request,
  onPresentation:x=>shown.push(x),onCleared:()=>cleared.push(1),
  onNotice:(...args)=>notice.push(args)
 });
 return {api,calls,shown,cleared,notice,setCampaign:x=>{campaignId=x;},setLogged:x=>{auth=x;},
  setGM:x=>{gmFlag=x;},serverSet:(r,k)=>{revisionNow=r;presentedId=k;}};
}
describe('Frodo — explicit live presentation',()=>{
 it('reads one campaign-scoped presentation and then exactly that active material',async()=>{
  const h=harness({revision:2,id:row.id});
  await h.api.refresh();
  expect(h.calls[0].path).toContain('campaign_material_presentations?campaign_id=eq.'+campaign);
  expect(h.calls[0].path).toContain('select=campaign_id,material_id,revision');
  expect(h.calls[1].path).toContain('campaign_materials?campaign_id=eq.'+campaign);
  expect(h.calls[1].path).toContain('id=eq.'+row.id);
  expect(h.calls[1].path).toContain('archived_at=is.null');
  expect(h.api.state.row.id).toBe(row.id);
 });
 it('show-now creates revision 1 with explicit GM-only RPC and no player folder share',async()=>{
  const h=harness();
  const result=await h.api.show(row);
  expect(result.revision).toBe(1);
  expect(h.calls.find(x=>x.path==='rpc/frodo_set_presentation')).toBeTruthy();
  expect(JSON.parse(h.calls.at(-1).options.body)).toEqual({
   p_campaign_id:campaign,p_material_id:row.id,p_expected_revision:0
  });
  expect(h.calls.every(x=>!x.path.includes('campaign_material_shares'))).toBe(true);
 });
 it('next picture increments the campaign revision, replacing the one presentation',async()=>{
  const h=harness({revision:5,id:row.id});
  await h.api.refresh();
  const another={...row,id:'9ab3f3f3-f31d-425d-b133-875ee9c09990'};
  const result=await h.api.show(another);
  expect(result.revision).toBe(6);
  expect(h.api.state.materialId).toBe(another.id);
 });
 it('stop sends null material and keeps a single versioned presentation row',async()=>{
  const h=harness({revision:1,id:row.id});
  await h.api.refresh();
  const result=await h.api.stop();
  expect(result.material_id).toBeNull();
  expect(result.revision).toBe(2);
  expect(h.api.state.materialId).toBeNull();
 });
 it('players never send presentation mutations',async()=>{
  const h=harness({gm:false});
  expect(await h.api.show(row)).toBeNull();
  expect(await h.api.stop()).toBeNull();
  expect(h.calls).toHaveLength(0);
 });
 it('rejects cross-campaign and archived images before RPC',async()=>{
  const h=harness();
  expect(await h.api.show({...row,campaign_id:other})).toBeNull();
  expect(await h.api.show({...row,archived_at:'2026-10-08T18:00:00Z'})).toBeNull();
  expect(h.calls).toHaveLength(0);
 });
 it('player auto-opens only new revisions; repeated checks do not reopen',async()=>{
  const h=harness({gm:false,revision:2,id:row.id});
  await h.api.refresh({autoOpen:true});
  await h.api.refresh({autoOpen:true});
  expect(h.shown).toHaveLength(1);
 });
 it('closing the GM presentation closes only a prior live player presentation',async()=>{
  const h=harness({gm:false,revision:2,id:row.id});
  await h.api.refresh({autoOpen:true});
  h.serverSet(3,null);
  await h.api.refresh({autoOpen:true});
  expect(h.cleared).toHaveLength(1);
  expect(h.api.state.materialId).toBeNull();
 });
 it('on conflict, does not overwrite stale revision; next action reloads',async()=>{
  const h=harness({revision:4,id:row.id,conflict:true});
  await h.api.refresh();
  expect(await h.api.stop()).toBeNull();
  expect(h.api.state.loaded).toBe(false);
  expect(h.notice.at(-1)[1]).toBe(true);
 });
 it('does not retain material state across campaign change or logout',async()=>{
  const h=harness({gm:false,revision:2,id:row.id});
  await h.api.refresh({autoOpen:true});
  h.setCampaign(other);h.api.reset();
  expect(h.api.state.row).toBeNull();
  expect(h.api.state.revision).toBe(0);
  h.setLogged(false);await h.api.refresh();
  expect(h.api.state.materialId).toBeNull();
 });
 it('source and SQL include required safeguards and actual UI connections',()=>{
  const ui=readFileSync(new URL('../features/material/frodo-ui.js',import.meta.url),'utf8');
  const lib=readFileSync(new URL('../features/material/library.js',import.meta.url),'utf8');
  const schema=readFileSync(new URL('../supabase/migrations/20261008_frodo_presentation_command.sql',import.meta.url),'utf8');
  expect(ui).toContain('frodoShowQueue');
  expect(ui).toContain('frodoStop');
  expect(ui).toContain('autoOpen:true');
  expect(ui).toContain('legolas.previewMaterial(row)');
  expect(lib).toContain('frodoUi.mount()');
  expect(lib).toContain('frodoShowMaterial');
  expect(schema).toContain('where current_presentation.revision=p_expected_revision');
  expect(schema).toContain('private.is_campaign_gm(p_campaign_id)');
  expect(schema).toContain('m.archived_at is null');
  expect(schema).not.toContain('create policy campaign_material_presentations_player_write');
 });
});
