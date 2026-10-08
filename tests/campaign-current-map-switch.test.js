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
 for(const id of ['mapPicker','mapCurrentBtn','mapSetCurrentBtn','mapCurrentBadge','mapRevealAllBtn']){
  const classes={hidden:null};
  nodes.set(id,{
   classes,disabled:false,title:'',innerHTML:'',
   classList:{toggle:(name,value)=>{classes[name]=value}}
  });
 }
 const context={
  campaignMaps:maps,activeCampaignMap:maps.find(m=>m.id===viewing),
  campaignActiveMapId:current,activatingCampaignMap:false,
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
