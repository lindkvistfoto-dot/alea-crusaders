import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const legacy=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const campaign='846e8089-24da-4825-af34-32903117152a';
const old='bf8f0021-cb90-40c7-a262-00fc539c5208';
const next='dca58a7b-217d-46bc-8526-1468fad1dd69';
const maps=[
 {id:old,campaign_id:campaign,name:'Grottsystem',player_visible:true,first_activated_at:'2026-10-04'},
 {id:next,campaign_id:campaign,name:'Skelettbyn',player_visible:false,first_activated_at:null}
];
function sourceBetween(start,end){
 const a=legacy.indexOf(start),b=legacy.indexOf(end,a);
 if(a<0||b<a)throw Error('Missing legacy function: '+start);
 return legacy.slice(a,b);
}
function mapControlsContext({gm=true,viewing=next,current=old}={}){
 const nodes=new Map();
 for(const id of ['mapPicker','mapCurrentBtn','mapSetCurrentBtn','mapCurrentBadge','mapRevealAllBtn','mapVisibilityToggle']){
  const classes={hidden:null};
  nodes.set(id,{
   classes,disabled:false,title:'',innerHTML:'',textContent:'',attributes:{},
   setAttribute(name,value){this.attributes[name]=value},
   classList:{toggle:(name,value)=>{classes[name]=value}}
  });
 }
 const context={
  campaignMaps:maps,activeCampaignMap:maps.find(m=>m.id===viewing),
  campaignActiveMapId:current,activatingCampaignMap:false,changingMapVisibilityId:null,
  canManageCampaignMaps:()=>gm,
  $:id=>nodes.get(id)||null,
  escAttr:v=>v
 };
 vm.runInNewContext(sourceBetween('function renderMapLibraryControls(){','let combatIconImageCache'),context);
 return {context,nodes};
}
function activateContext({failUpsert=false,failMetadata=false,viewerOpen=true}={}){
 const calls=[],toasts=[],alerts=[],viewed=[];
 const ctx={
  campaignMaps:maps,centralCampaignId:campaign,campaignActiveMapId:old,
  activatingCampaignMap:false,
  supabaseSession:{user:{id:'6ec7a85d-7976-40a8-bca1-df16a2ec902e'}},
  canManageCampaignMaps:()=>true,
  renderMapLibraryControls:()=>{},
  renderAdminMaps:()=>{},
  viewCampaignMap:async id=>viewed.push(id),
  loadCampaignMaps:async()=>calls.push('refresh'),
  showBackupToast:x=>toasts.push(x),
  alert:x=>alerts.push(x),
  encodeURIComponent,Date,console,
  $:()=>({classList:{contains:()=>!viewerOpen}}),
  dbJson:async (path,opts)=>{
   calls.push({path,opts});
   if(path.startsWith('campaign_map_settings?')){
    return failUpsert?[]:[{campaign_id:campaign,active_map_id:next}];
   }
   if(path.startsWith('campaign_maps?')){
    if(failMetadata)throw Error('Metadata temporarily unavailable');
    return [];
   }
   return [];
  }
 };
 vm.runInNewContext(sourceBetween('async function activateCampaignMapById(id){','async function toggleMapPlayerVisibility(id){'),ctx);
 return {ctx,calls,toasts,alerts,viewed};
}
describe('Kampanjkarta – välj en annan aktuell karta (v0.34.89)',()=>{
 it('exposes a distinct GM-only Gör aktuell button in the map panel',()=>{
  expect(html).toContain('id="mapSetCurrentBtn"');
  expect(html).toContain('onclick="activateViewedMap()"');
  expect(html).toContain('📍 Gör aktuell');
  expect(html).toContain('↩ Visa aktuell');
  const {context,nodes}=mapControlsContext({gm:true});
  context.renderMapLibraryControls();
  expect(nodes.get('mapSetCurrentBtn').classes.hidden).toBe(false);
  expect(nodes.get('mapCurrentBtn').classes.hidden).toBe(false);
  expect(nodes.get('mapCurrentBadge').classes.hidden).toBe(true);
 });
 it('hides the set-current action from players and on already-current maps',()=>{
  const player=mapControlsContext({gm:false});player.context.renderMapLibraryControls();
  expect(player.nodes.get('mapSetCurrentBtn').classes.hidden).toBe(true);
  const current=mapControlsContext({gm:true,viewing:old});
  current.context.renderMapLibraryControls();
  expect(current.nodes.get('mapSetCurrentBtn').classes.hidden).toBe(true);
  expect(current.nodes.get('mapCurrentBadge').classes.hidden).toBe(false);
 });
 it('on refresh prioritizes the DB current map over the previously previewed map',async()=>{
  const viewed=[];
  const context={
   centralCampaignId:campaign,campaignMaps:[],campaignActiveMapId:null,
   activeCampaignMap:maps[0],
   canManageCampaignMaps:()=>true,
   loadCampaignMapRole:async()=>{},
   dbJson:async path=>path.startsWith('campaign_maps?')?maps:[{active_map_id:next}],
   viewCampaignMap:async id=>viewed.push(id),
   renderMapLibraryControls:()=>{},
   setCampaignMapData:()=>{},
   encodeURIComponent
  };
  vm.runInNewContext(sourceBetween('async function loadCampaignMaps(loadViewed=true){','function renderMapLibraryControls(){'),context);
  await context.loadCampaignMaps(true);
  expect(viewed).toEqual([next]);
  expect(context.campaignActiveMapId).toBe(next);
 });
 it('persists setting, verifies actual saved row, and displays the new current map',async()=>{
  const h=activateContext();
  expect(await h.ctx.activateCampaignMapById(next)).toBe(true);
  const write=h.calls.find(x=>typeof x==='object'&&x.path.startsWith('campaign_map_settings?'));
  expect(write.opts.method).toBe('POST');
  expect(JSON.parse(write.opts.body).active_map_id).toBe(next);
  expect(write.path).toContain('select=campaign_id,active_map_id');
  expect(h.ctx.campaignActiveMapId).toBe(next);
  expect(h.viewed).toEqual([next]);
  expect(h.toasts[0]).toContain('Aktuell karta: Skelettbyn');
  expect(h.toasts[0]).toContain('Dold för spelarna');
  expect(maps[1].player_visible).toBe(false);
 });
 it('does not report success when Supabase confirms no changed row',async()=>{
  const h=activateContext({failUpsert:true});
  expect(await h.ctx.activateCampaignMapById(next)).toBe(false);
  expect(h.ctx.campaignActiveMapId).toBe(old);
  expect(h.toasts).toHaveLength(0);
  expect(h.alerts[0]).toContain('Databasen bekräftade inte kartbytet');
 });
 it('a timestamp failure does not undo a successfully saved active map',async()=>{
  const h=activateContext({failMetadata:true,viewerOpen:false});
  expect(await h.ctx.activateCampaignMapById(next)).toBe(true);
  expect(h.ctx.campaignActiveMapId).toBe(next);
  expect(h.toasts).toHaveLength(1);
  expect(h.viewed).toHaveLength(0);
 });
});


function visibilityContext({gm=true,viewing=next,initialVisible=false,saveConfirmed=true}={}){
 const entity={...maps.find(m=>m.id===viewing),player_visible:initialVisible};
 const calls=[],toasts=[],alerts=[];
 const ctx={
  campaignMaps:[entity],activeCampaignMap:entity,centralCampaignId:campaign,
  changingMapVisibilityId:null,canManageCampaignMaps:()=>gm,
  renderMapLibraryControls:()=>calls.push('render'),
  renderAdminMaps:()=>calls.push('admin'),
  loadCampaignMaps:async()=>calls.push('reload'),
  showBackupToast:x=>toasts.push(x),alert:x=>alerts.push(x),console,encodeURIComponent,
  dbJson:async (path,opts)=>{
   calls.push({path,opts});
   return saveConfirmed?[{id:viewing,campaign_id:campaign,player_visible:JSON.parse(opts.body).player_visible}]:[];
  }
 };
 vm.runInNewContext(sourceBetween('async function toggleViewedMapPlayerVisibility(){','async function deleteCampaignMap(id){'),ctx);
 return {ctx,calls,toasts,alerts,entity};
}
describe('Kartpanelen – visa/dölj för spelare (v0.34.90)',()=>{
 it('has an accessible switch directly in the map toolbar',()=>{
  expect(html).toContain('id="mapVisibilityToggle"');
  expect(html).toContain('role="switch"');
  expect(html).toContain('aria-checked="false"');
  expect(html).toContain('onclick="toggleViewedMapPlayerVisibility()"');
 });
 it('shows the hidden status when viewing a hidden map as GM',()=>{
  const {context,nodes}=mapControlsContext({gm:true});
  context.renderMapLibraryControls();
  const toggle=nodes.get('mapVisibilityToggle');
  expect(toggle.classes.hidden).toBe(false);
  expect(toggle.classes['is-hidden']).toBe(true);
  expect(toggle.attributes['aria-checked']).toBe('false');
  expect(toggle.textContent).toContain('Dold för spelare');
  expect(toggle.disabled).toBe(false);
 });
 it('shows the visible status and checks the switch when viewing a public map',()=>{
  const {context,nodes}=mapControlsContext({gm:true,viewing:old});
  context.renderMapLibraryControls();
  const toggle=nodes.get('mapVisibilityToggle');
  expect(toggle.classes['is-visible']).toBe(true);
  expect(toggle.attributes['aria-checked']).toBe('true');
  expect(toggle.textContent).toContain('Synlig för spelare');
 });
 it('hides the switch for players and for no selected map',()=>{
  const player=mapControlsContext({gm:false});
  player.context.renderMapLibraryControls();
  expect(player.nodes.get('mapVisibilityToggle').classes.hidden).toBe(true);
  const noMap=mapControlsContext();
  noMap.context.activeCampaignMap=null;
  noMap.context.renderMapLibraryControls();
  expect(noMap.nodes.get('mapVisibilityToggle').classes.hidden).toBe(true);
 });
 it('disables toggle while a visibility update is in flight',()=>{
  const h=mapControlsContext();
  h.context.changingMapVisibilityId=next;
  h.context.renderMapLibraryControls();
  expect(h.nodes.get('mapVisibilityToggle').disabled).toBe(true);
 });
 it('writes the exact campaign and id, verifies response, then reveals the map',async()=>{
  const h=visibilityContext();
  expect(await h.ctx.toggleViewedMapPlayerVisibility()).toBe(true);
  const save=h.calls.find(x=>typeof x==='object');
  expect(save.path).toContain('campaign_maps?id=eq.'+next);
  expect(save.path).toContain('campaign_id=eq.'+campaign);
  expect(save.path).toContain('select=id,campaign_id,player_visible');
  expect(save.opts.method).toBe('PATCH');
  expect(save.opts.headers.Prefer).toBe('return=representation');
  expect(JSON.parse(save.opts.body).player_visible).toBe(true);
  expect(h.entity.player_visible).toBe(true);
  expect(h.toasts[0]).toContain('tillgänglig för spelare');
 });
 it('uses the same action to hide a previously visible map',async()=>{
  const h=visibilityContext({viewing:old,initialVisible:true});
  expect(await h.ctx.toggleViewedMapPlayerVisibility()).toBe(true);
  expect(h.entity.player_visible).toBe(false);
  expect(h.toasts[0]).toContain('dold för spelare');
 });
 it('does not claim success or change local state if RLS rejects the update',async()=>{
  const h=visibilityContext({saveConfirmed:false});
  expect(await h.ctx.toggleViewedMapPlayerVisibility()).toBe(false);
  expect(h.entity.player_visible).toBe(false);
  expect(h.toasts).toHaveLength(0);
  expect(h.alerts[0]).toContain('Databasen bekräftade inte');
 });
 it('prevents players from writing through the handler',async()=>{
  const h=visibilityContext({gm:false});
  expect(await h.ctx.toggleViewedMapPlayerVisibility()).toBe(false);
  expect(h.calls).toHaveLength(0);
 });
});
