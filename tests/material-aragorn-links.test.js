import {describe,it,expect,vi} from 'vitest';
import {createAragorn,ARAGORN_ENTITY_TYPES} from '../features/material/links.js';
import {readFileSync} from 'node:fs';

const campaign='846e8089-24da-4825-af34-32903117152a';
const material='123e4567-e89b-42d3-a456-426614174000';
const object='123e4567-e89b-42d3-a456-426614174001';
const linkId='123e4567-e89b-42d3-a456-426614174002';
function harness(overrides={}){
 let selected={id:material,campaign_id:campaign},generation=1,allowed=true;
 const requests=[],notices=[],elements={
  aragornTargetSelect:{value:object,innerHTML:''},
  aragornTargetSearch:{value:''},
  aragornLinkStatus:{textContent:'',classList:{toggle(){}}},
  aragornLinkedList:{innerHTML:'',textContent:''},
  aragornLinkButton:{disabled:false},
  aragornSyncButton:{disabled:false}
 };
 const request=async(path,options)=>{
  requests.push({path,options});
  if(path==='rpc/aragorn_sync_legacy_materials')return {added:3,links_added:2};
  if(path.startsWith('campaign_material_links?')&&(!options||options.method!=='POST'))return [];
  return [];
 };
 let reloads=0;
 const api=createAragorn({
  getSelected:()=>selected,getCampaign:()=>campaign,getGeneration:()=>generation,
  canManage:()=>allowed,request:(path,options)=>(overrides.request||request)(path,options),
  escape:value=>String(value??'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x])),
  notify:(...args)=>notices.push(args),
  reload:async()=>{reloads++;},
  doc:()=>({getElementById:id=>elements[id]||null}),
  confirmAction:()=>true
 });
 return {api,elements,requests,notices,getReloads:()=>reloads,setSelected:x=>{selected=x},setGeneration:x=>{generation=x},setAllowed:x=>{allowed=x}};
}
describe('Aragorn – campaign-safe material links',()=>{
 it('offers four campaign target types, not unsupported map links',()=>{
  const h=harness();const html=h.api.html();
  for(const kind of Object.keys(ARAGORN_ENTITY_TYPES))expect(html).toContain('value="'+kind+'"');
  expect(html).toContain('aragornLinkButton');
  expect(html).toContain('aragornTargetSearch');
  expect(html).not.toContain('value="map"');
 });
 it('loads target choices with a campaign filter and server-side name search',async()=>{
  const h=harness();h.api.state.search='Skelettbyn';
  await h.api.loadTargets();
  expect(h.requests[0].path).toContain('campaign_locations?campaign_id=eq.'+campaign);
  expect(h.requests[0].path).toContain('name=ilike.*Skelettbyn*');
  expect(h.requests[0].path).toContain('limit=100');
 });
 it('links one existing target and never touches Storage or original paths',async()=>{
  const h=harness();h.api.state.targets=[{id:object,name:'Kyrkan'}];
  await h.api.link();
  expect(h.requests[0].path).toContain('campaign_material_links?on_conflict=');
  expect(h.requests[0].options.method).toBe('POST');
  expect(JSON.parse(h.requests[0].options.body)).toEqual({
   campaign_id:campaign,material_id:material,entity_type:'location',entity_id:object
  });
  expect(h.requests.every(x=>!x.path.includes('/storage/')&&!x.path.includes('/object/'))).toBe(true);
 });
 it('does not send a second link request for an already linked object',async()=>{
  const h=harness();h.api.state.targets=[{id:object,name:'Kyrkan'}];
  h.api.state.links=[{id:linkId,entity_type:'location',entity_id:object,name:'Kyrkan'}];
  await h.api.link();
  expect(h.requests).toHaveLength(0);
  expect(h.elements.aragornLinkStatus.textContent).toMatch(/redan kopplad/);
 });
 it('removes only the selected material association, never its file',async()=>{
  const h=harness();h.api.state.links=[{id:linkId,entity_type:'location',entity_id:object,name:'Kyrkan'}];
  await h.api.unlink(linkId);
  const deleteCall=h.requests.find(x=>x.options?.method==='DELETE');
  expect(deleteCall.path).toContain('id=eq.'+linkId);
  expect(deleteCall.path).toContain('campaign_id=eq.'+campaign);
  expect(deleteCall.path).toContain('material_id=eq.'+material);
  expect(h.requests.every(x=>!x.path.includes('/object/'))).toBe(true);
 });
 it('rejects a link when there is no SL permission or selected campaign differs',async()=>{
  const h=harness();h.api.state.targets=[{id:object,name:'Kyrkan'}];
  h.setAllowed(false);await h.api.link();expect(h.requests).toHaveLength(0);
  h.setAllowed(true);h.setSelected({id:material,campaign_id:'different'});
  await h.api.link();expect(h.requests).toHaveLength(0);
 });
 it('looks up linked object names within the same campaign and escapes unsafe labels',async()=>{
  const calls=[];
  const h=harness({request:async path=>{
   calls.push(path);
   if(path.startsWith('campaign_material_links?'))return [{id:linkId,entity_type:'npc',entity_id:object}];
   if(path.startsWith('campaign_npcs?'))return [{id:object,name:'<img src=x>'}];
   return [];
  }});
  await h.api.loadLinks();
  expect(calls[0]).toContain('campaign_id=eq.'+campaign);
  expect(calls[1]).toContain('campaign_npcs?campaign_id=eq.'+campaign);
  expect(h.elements.aragornLinkedList.innerHTML).toContain('&lt;img src=x&gt;');
  expect(h.elements.aragornLinkedList.innerHTML).not.toContain('<img src=x>');
 });
 it('syncs metadata idempotently through the RPC and reloads the library',async()=>{
  const h=harness();
  await h.api.sync();
  expect(h.requests[0].path).toBe('rpc/aragorn_sync_legacy_materials');
  expect(JSON.parse(h.requests[0].options.body)).toEqual({p_campaign_id:campaign});
  expect(h.getReloads()).toBe(1);
  expect(h.notices.at(-1)[0]).toContain('3 nya bilder');
  expect(h.requests).toHaveLength(1);
 });
 it('invalidates a stale link request when its detail panel closes',async()=>{
  let resolveResponse;
  const h=harness({request:()=>new Promise(resolve=>{resolveResponse=resolve})});
  const pending=h.api.loadLinks();
  h.api.clear();
  resolveResponse([{id:linkId,entity_type:'npc',entity_id:object}]);
  await pending;
  expect(h.api.state.links).toHaveLength(0);
 });
 it('Bilbo actually mounts Aragorn controls and clears state on navigation',()=>{
  const code=readFileSync(new URL('../features/material/library.js',import.meta.url),'utf8');
  expect(code).toContain('aragorn.html()');
  expect(code).toContain('aragorn.loadDetails(row,generation)');
  expect(code).toContain('aragorn.clear()');
  expect(code).toContain('aragornSyncLegacy:aragorn.sync');
  expect(code).toContain('↻ Hämta äldre bilder');
 });
});
