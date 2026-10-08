import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createMapRealtime,mapSignalConfig,MAP_SIGNAL_TABLE} from '../features/map/realtime.js';

const campaign='846e8089-24da-4825-af34-32903117152a';
const other='746e8089-24da-4825-af34-32903117152a';

function harness(){
 let active=campaign,token='test-jwt',authorized=true,now=1700000000000,nextTimer=1;
 const timers=new Map(),sockets=[],refreshed=[],statuses=[];
 const api=createMapRealtime({
  getCampaign:()=>active,getToken:()=>token,isAuthenticated:()=>authorized,
  supabaseUrl:'https://example.supabase.co',publishableKey:'test-public-key',
  clock:()=>now,
  onRefresh:()=>{refreshed.push(active)},
  onStatus:(text,connected)=>statuses.push([text,connected]),
  makeSocket:url=>{
   const ws={url,readyState:0,closed:false,sent:[],
    send(raw){this.sent.push(JSON.parse(raw))},
    close(){this.closed=true;this.readyState=3}
   };
   sockets.push(ws);return ws;
  },
  timers:{
   setInterval:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id},
   clearInterval:id=>timers.delete(id)
  }
 });
 function open(ws=sockets.at(-1),success=true){
  ws.readyState=1;ws.onopen();
  const join=ws.sent.find(x=>x.event==='phx_join');
  ws.onmessage({data:JSON.stringify({topic:join.topic,event:'phx_reply',ref:join.ref,
   payload:{status:success?'ok':'error',response:{postgres_changes:success?[{id:12}]:[]}}})});
  return join;
 }
 function signal(revision,c=campaign,type='UPDATE'){
  const ws=sockets.at(-1);
  ws.onmessage({data:JSON.stringify({topic:'realtime:map-sync:'+c,event:'postgres_changes',
   payload:{data:{schema:'public',table:MAP_SIGNAL_TABLE,type,
    record:{campaign_id:c,revision}}}})});
 }
 function fire(ms){for(const {fn,ms:interval} of [...timers.values()])if(interval===ms)fn()}
 return {api,sockets,refreshed,statuses,open,signal,fire,
  now:x=>{now+=x},setCampaign:x=>{active=x},
  setToken:x=>{token=x},setAuth:x=>{authorized=x}};
}

describe('v0.34.95 – live player maps',()=>{
 it('uses one campaign-filtered metadata-only channel',()=>{
  expect(mapSignalConfig(campaign)).toEqual({
   event:'*',schema:'public',table:'campaign_map_signals',
   filter:'campaign_id=eq.'+campaign
  });
  expect(()=>mapSignalConfig('bad')).toThrow();
  const config=JSON.stringify(mapSignalConfig(campaign));
  for(const secret of ['image_path','shape_data','gm_notes','location_id','status'])
   expect(config).not.toContain(secret);
 });
 it('joins with the player JWT and refreshes after subscription',()=>{
  const h=harness();h.api.start();
  expect(h.sockets).toHaveLength(1);
  const join=h.open();
  expect(join.payload.access_token).toBe('test-jwt');
  expect(join.payload.config.postgres_changes[0].filter).toBe('campaign_id=eq.'+campaign);
  expect(h.api.connected()).toBe(true);
  expect(h.refreshed).toEqual([campaign]);
 });
 it('applies INSERT and UPDATE revisions once without accepting foreign campaigns',()=>{
  const h=harness();h.api.start();h.open();h.refreshed.length=0;
  h.signal(1,campaign,'INSERT');
  h.signal(1);
  h.signal(2,other);
  h.signal(-1);
  h.signal(2);
  expect(h.refreshed).toEqual([campaign,campaign]);
  expect(h.api.applySignal({campaign_id:campaign,revision:'NaN'})).toBe(false);
 });
 it('reconnects with bounded backoff and reconciles missed messages',()=>{
  const h=harness();h.api.start();h.open();h.refreshed.length=0;
  h.sockets[0].onclose();
  expect(h.api.connected()).toBe(false);
  h.now(16000);h.api.tick();
  expect(h.sockets.length).toBe(2);
  h.open();
  expect(h.refreshed).toEqual([campaign,campaign]);
 });
 it('uses a 15-second fallback, and a 60-second safety sync while connected',()=>{
  const h=harness();h.api.start();h.open();h.refreshed.length=0;
  h.now(60001);h.api.tick();
  expect(h.refreshed).toEqual([campaign]);
  h.sockets[0].onclose();h.refreshed.length=0;
  h.now(16000);h.api.tick();
  expect(h.refreshed).toEqual([campaign]);
 });
 it('closes the old campaign socket and disconnects at logout',()=>{
  const h=harness();h.api.start();h.open();
  h.setCampaign(other);h.api.tick();
  expect(h.sockets[0].closed).toBe(true);
  expect(h.open().payload.config.postgres_changes[0].filter).toContain(other);
  h.setAuth(false);h.api.tick();
  expect(h.sockets.at(-1).closed).toBe(true);
  expect(h.api.connected()).toBe(false);
 });
 it('refreshes JWT tokens and sends socket heartbeats',()=>{
  const h=harness();h.api.start();h.open();h.setToken('new.jwt');
  h.fire(20000);
  expect(h.sockets[0].sent.some(x=>x.event==='access_token'&&x.payload.access_token==='new.jwt')).toBe(true);
  expect(h.sockets[0].sent.some(x=>x.event==='heartbeat'&&x.topic==='phoenix')).toBe(true);
 });
 it('does not claim success when the server rejects the subscription',()=>{
  const h=harness();h.api.start();h.open(h.sockets[0],false);
  expect(h.api.connected()).toBe(false);
  expect(h.statuses.at(-1)[0]).toContain('Reservsynk');
 });
 it('database signals include location changes, map visibility and map switches',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261008230000_map_realtime_signals.sql',import.meta.url),'utf8');
  expect(sql).toContain('campaign_map_signals_member_read');
  expect(sql).toContain('private.is_campaign_member(campaign_id)');
  expect(sql).toContain('security definer');
  expect(sql).toContain('revoke all on function private.bump_campaign_map_signal()');
  for(const table of ['campaign_location_state','campaign_maps','campaign_map_areas','campaign_map_settings'])
   expect(sql).toContain('on public.'+table);
  expect(sql).toContain('alter publication supabase_realtime add table public.campaign_map_signals');
  expect(sql).not.toContain('drop publication');
 });
});

function uiHarness({gm=false,maps=[{id:'old',player_visible:true}],state='explored'}={}){
 let current='old';
 const actions=[],page={classList:{contains:()=>false},dataset:{}};
 const context={
  document:{readyState:'loading',
   addEventListener(){},
   getElementById:id=>id==='mapPage'?page:id==='mapStatusText'?{title:''}:null
  },
  window:{},
  createMapRealtime:()=>({start(){},tick(){},connected:()=>true,status:()=>''}),
  centralCampaignId:campaign,supabaseSession:{access_token:'test-jwt'},
  activeUser:()=>({id:'test-user'}),SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_KEY:'test-key',
  activeCampaignMap:{id:'old',image_url:'blob:map'},
  campaignActiveMapId:'old',campaignMaps:maps,
  campaignMapAreas:[],mapSelectedAreaId:null,
  mapView:{scale:1.8,x:124,y:-30},
  canManageCampaignMaps:()=>gm,
  loadCampaignMaps:async()=>{context.campaignActiveMapId=current;context.campaignMaps=maps;actions.push('library')},
  loadCampaignMapAreas:async()=>[{id:'polygon',status,location_id:'place'}],
  renderMapPanel:()=>actions.push('render'),
  renderMapLibraryControls:()=>actions.push('controls'),
  closeMapLocationInfo:()=>actions.push('close-location'),
  setCampaignMapData:(map,areas)=>{context.activeCampaignMap=map;context.campaignMapAreas=areas;actions.push('clear')},
  viewCampaignMap:async(id)=>{context.activeCampaignMap={id,image_url:'blob:new'};actions.push('switch:'+id)},
  openMapLocationInfoByArea:async()=>{},
  console
 };
 const code=readFileSync(new URL('../features/map/sync-ui.js',import.meta.url),'utf8')
  .replace(/^import[^\n]+\n/gm,'').replace('export async function reconcileCampaignMap','async function reconcileCampaignMap');
 runInNewContext(code,context);
 return {context,actions,setMaps:x=>{maps=x},setCurrent:x=>{current=x},refresh:()=>context.window.aleaMapRealtime.refresh()};
}
describe('v0.34.95 – map screen reconciliation',()=>{
 it('updates fog without resetting player zoom or image',async()=>{
  const h=uiHarness();await h.refresh();
  expect(h.context.campaignMapAreas[0].status).toBe('explored');
  expect(h.context.activeCampaignMap.image_url).toBe('blob:map');
  expect(h.context.mapView).toEqual({scale:1.8,x:124,y:-30});
  expect(h.actions).not.toContain('switch:old');
  expect(h.actions).toContain('render');
 });
 it('switches the player to a newly active visible map',async()=>{
  const h=uiHarness();await h.refresh();
  h.setMaps([{id:'old',player_visible:true},{id:'next',player_visible:true}]);
  h.setCurrent('next');await h.refresh();
  expect(h.actions).toContain('switch:next');
 });
 it('immediately clears a map that has been hidden from a player',async()=>{
  const h=uiHarness();await h.refresh();
  h.setMaps([{id:'old',player_visible:false}]);await h.refresh();
  expect(h.actions).toContain('clear');
  expect(h.context.activeCampaignMap).toBe(null);
 });
 it('does not force a GM away from the map being previewed',async()=>{
  const h=uiHarness({gm:true});
  await h.refresh();
  h.setMaps([{id:'old',player_visible:false},{id:'next',player_visible:true}]);
  h.setCurrent('next');await h.refresh();
  expect(h.actions).not.toContain('switch:next');
 });
});
