import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createGaladriel,galadrielSocketUrl,galadrielPostgresConfig,GALADRIEL_TABLE} from '../features/material/realtime.js';
const campaign='846e8089-24da-4825-af34-32903117152a';
const another='746e8089-24da-4825-af34-32903117152a';
function harness(){
 let current=campaign,token='mock.jwt.token',authed=true,now=1700000000000,nextTimer=1;
 const timers=new Map(),sockets=[],changes=[],status=[];
 const clock=()=>now;
 const api=createGaladriel({
  getCampaign:()=>current,getToken:()=>token,isAuthenticated:()=>authed,
  supabaseUrl:'https://example.supabase.co',publishableKey:'publishable_key',
  makeSocket:url=>{
   const ws={url,readyState:0,sent:[],closed:false,
    send(raw){this.sent.push(JSON.parse(raw))},
    close(){this.closed=true;this.readyState=3}
   };
   sockets.push(ws);return ws;
  },
  onPresentation:()=>changes.push('presentation'),
  onFolder:()=>changes.push('folder'),
  onStatus:(label,connected)=>status.push({label,connected}),
  clock,
  timers:{
   setInterval:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id},
   clearInterval:id=>timers.delete(id)
  }
 });
 function open(ws=sockets.at(-1)){
  ws.readyState=1;ws.onopen();
  const join=ws.sent.find(x=>x.event==='phx_join');
  ws.onmessage({data:JSON.stringify({topic:join.topic,event:'phx_reply',ref:join.ref,
   payload:{status:'ok',response:{postgres_changes:[{id:22}]}}})});
  return join;
 }
 function signal(p,f,c=campaign){
  const ws=sockets.at(-1);
  ws.onmessage({data:JSON.stringify({topic:'realtime:galadriel:'+c,event:'postgres_changes',
   payload:{ids:[22],data:{type:'UPDATE',schema:'public',table:GALADRIEL_TABLE,
    record:{campaign_id:c,presentation_revision:p,folder_revision:f}}}})});
 }
 const fire=ms=>{for(const timer of [...timers.values()].filter(x=>x.ms===ms))timer.fn();};
 return {api,sockets,changes,status,open,signal,fire,timers,
  setToken:x=>{token=x},setCampaign:x=>{current=x},setAuthed:x=>{authed=x},
  stepTime:ms=>{now+=ms}};
}
describe('Galadriel Lady of Lothlórien – authenticated RLS-aware Realtime',()=>{
 it('uses secure authenticated websocket protocol without disclosing GM notes',()=>{
  expect(galadrielSocketUrl('https://example.supabase.co','abc')).toContain('wss://example.supabase.co/realtime/v1/websocket?apikey=abc');
  expect(()=>galadrielSocketUrl('http://example.com','abc')).toThrow();
  const cfg=galadrielPostgresConfig(campaign);
  expect(cfg).toEqual({
   event:'*',schema:'public',table:'campaign_material_signals',
   filter:'campaign_id=eq.'+campaign,
   select:['campaign_id','presentation_revision','folder_revision']
  });
  expect(JSON.stringify(cfg)).not.toContain('storage_path');
  expect(JSON.stringify(cfg)).not.toContain('gm_notes');
  expect(()=>galadrielPostgresConfig('oops')).toThrow();
 });
 it('subscribes to only the current campaign with the authenticated access token',()=>{
  const h=harness();h.api.start();
  expect(h.sockets).toHaveLength(1);
  const join=h.open();
  expect(join.payload.access_token).toBe('mock.jwt.token');
  expect(join.payload.config.postgres_changes[0].filter).toBe('campaign_id=eq.'+campaign);
  expect(h.api.state.connected).toBe(true);
  expect(h.changes).toEqual(['presentation','folder']);
 });
 it('accepts revision-only hints then refreshes via callbacks, ignores duplicates',()=>{
  const h=harness();h.api.start();h.open();h.changes.length=0;
  h.signal(1,1);
  expect(h.changes).toEqual(['presentation','folder']);
  h.signal(1,1);
  expect(h.changes).toHaveLength(2);
  h.signal(2,1);
  expect(h.changes).toEqual(['presentation','folder','presentation']);
 });
 it('rejects events from another campaign or containing invalid revisions',()=>{
  const h=harness();h.api.start();h.open();h.changes.length=0;
  h.signal(6,6,another);
  expect(h.changes).toHaveLength(0);
  const accepted=h.api.applySignal({campaign_id:campaign,presentation_revision:-1,folder_revision:0});
  expect(accepted).toBe(false);
  expect(h.changes).toHaveLength(0);
 });
 it('switching campaign tears down the old subscription and starts a new one',()=>{
  const h=harness();h.api.start();h.open();
  h.setCampaign(another);h.api.tick();
  expect(h.sockets[0].closed).toBe(true);
  expect(h.sockets).toHaveLength(2);
  const join=h.open();
  expect(join.payload.config.postgres_changes[0].filter).toContain(another);
  expect(h.api.state.scope).toBe(another);
 });
 it('logout immediately disconnects and clears campaign signals',()=>{
  const h=harness();h.api.start();h.open();
  h.setAuthed(false);h.api.tick();
  expect(h.sockets[0].closed).toBe(true);
  expect(h.api.state.connected).toBe(false);
  expect(h.api.state.scope).toBe('');
 });
 it('refreshes authorization token and heartbeats on the existing socket',()=>{
  const h=harness();h.api.start();h.open();
  h.setToken('refreshed.jwt.token');
  h.fire(20000);
  const frames=h.sockets[0].sent;
  expect(frames.find(x=>x.event==='access_token').payload.access_token).toBe('refreshed.jwt.token');
  expect(frames.some(x=>x.event==='heartbeat'&&x.topic==='phoenix')).toBe(true);
 });
 it('uses bounded fallback and can reconnect after a closed socket',()=>{
  const h=harness();h.api.start();h.open();h.changes.length=0;
  const socket=h.sockets[0];socket.onclose();
  expect(h.api.state.connected).toBe(false);
  h.stepTime(15000);h.api.tick();
  expect(h.sockets.length).toBe(2);
  expect(h.changes).toContain('presentation');
  h.open();expect(h.api.state.connected).toBe(true);
 });
 it('bad channel subscription stays in fallback rather than claiming success',()=>{
  const h=harness();h.api.start();
  const socket=h.sockets[0];socket.readyState=1;socket.onopen();
  const join=socket.sent[0];
  socket.onmessage({data:JSON.stringify({topic:join.topic,event:'phx_reply',ref:join.ref,
   payload:{status:'error',response:{}}})});
  expect(h.api.state.connected).toBe(false);
  expect(h.status.at(-1).label).toContain('Reservläge');
 });
 it('signal migration does not expose secret file metadata and preserves older publications',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261008_galadriel_material_realtime_signals.sql',import.meta.url),'utf8');
  expect(sql).toContain('campaign_material_signals_member_read');
  expect(sql).toContain('private.is_campaign_member(campaign_id)');
  expect(sql).toContain('security definer');
  expect(sql).toContain('revoke all on function public.galadriel_signal_material_change()');
  expect(sql).toContain('alter publication supabase_realtime add table public.campaign_material_signals');
  expect(sql).not.toContain('drop publication');
  expect(sql).not.toContain('storage_path text');
 });
 it('main integration disables fast Frodo polling while connected and refreshes Sam',()=>{
  const library=readFileSync(new URL('../features/material/library.js',import.meta.url),'utf8');
  const frodo=readFileSync(new URL('../features/material/frodo-ui.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../features/material/galadriel-ui.js',import.meta.url),'utf8');
  expect(library).toContain('mountGaladriel');
  expect(library).toContain('galadrielMaterialApi');
  expect(frodo).toContain('!isRealtimeConnected()');
  expect(ui).toContain('samUi.load()');
  expect(ui).toContain('frodoUi.frodo.refresh({autoOpen:true,silent:true})');
 });
});
