import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createAudioRealtime,audioRealtimeConfig,AUDIO_EVENTS_TABLE,AUDIO_STATE_TABLE} from '../features/audio/realtime.js';
const text=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const c='846e8089-24da-4825-af34-32903117152a';
const c2='746e8089-24da-4825-af34-32903117152a';
function harness(){
 let campaign=c,token='signed-in.jwt',authed=true,now=1000000,id=0;
 const sockets=[],timers=new Map(),effects=[],states=[];
 const api=createAudioRealtime({
  getCampaign:()=>campaign,getToken:()=>token,isAuthenticated:()=>authed,
  supabaseUrl:'https://test.supabase.co',publishableKey:'key',
  clock:()=>now,
  makeSocket:url=>{const ws={url,readyState:0,frames:[],send(json){this.frames.push(JSON.parse(json))},close(){this.readyState=3}};sockets.push(ws);return ws},
  timers:{setInterval:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearInterval:x=>timers.delete(x)},
  onState:x=>states.push(x),onEvent:x=>effects.push(x)
 });
 const open=()=>{
  const ws=sockets.at(-1);ws.readyState=1;ws.onopen();
  const join=ws.frames.find(x=>x.event==='phx_join');
  ws.onmessage({data:JSON.stringify({topic:join.topic,event:'phx_reply',ref:join.ref,payload:{status:'ok',response:{postgres_changes:[{id:2},{id:3}]}}})});
  return join
 };
 const change=(table,type,record)=>{
  const ws=sockets.at(-1);
  ws.onmessage({data:JSON.stringify({topic:'realtime:alea-audio:'+campaign,event:'postgres_changes',payload:{data:{schema:'public',table,type,record}}})})
 };
 return {api,sockets,timers,states,effects,open,change,setCampaign:v=>{campaign=v},setAuthed:v=>{authed=v},advance:ms=>{now+=ms}};
}
describe('Campaign audio soundboard sync',()=>{
 it('restricts subscriptions to one campaign and two tables',()=>{
  expect(audioRealtimeConfig(c)).toEqual([
   {event:'*',schema:'public',table:AUDIO_STATE_TABLE,filter:'campaign_id=eq.'+c},
   {event:'*',schema:'public',table:AUDIO_EVENTS_TABLE,filter:'campaign_id=eq.'+c}
  ]);
  expect(()=>audioRealtimeConfig('invalid')).toThrow()
 });
 it('receives sound events and ambience state for current members only',()=>{
  const h=harness();h.api.start();const join=h.open();
  expect(join.payload.access_token).toBe('signed-in.jwt');
  expect(join.payload.config.postgres_changes).toHaveLength(2);
  h.change(AUDIO_EVENTS_TABLE,'INSERT',{id:'cue1',campaign_id:c,cue_key:'ambience.thunder'});
  h.change(AUDIO_STATE_TABLE,'UPDATE',{campaign_id:c,revision:4,ambience_cue_key:'ambience.rain'});
  h.change(AUDIO_EVENTS_TABLE,'INSERT',{id:'evil',campaign_id:c2,cue_key:'ambience.door'});
  expect(h.effects).toHaveLength(1);
  expect(h.states).toHaveLength(1);
  expect(h.states[0].revision).toBe(4)
 });
 it('disconnects when the campaign changes or user logs out',()=>{
  const h=harness();h.api.start();h.open();
  h.setCampaign(c2);h.api.tick();
  expect(h.sockets[0].readyState).toBe(3);
  h.open();h.setAuthed(false);h.api.tick();
  expect(h.api.state.connected).toBe(false)
 });
 it('keeps audio local, with GM-only writes and no room secrets in the events',()=>{
  const b=text('features/audio/board.js'),engine=text('features/audio/engine.js');
  const sql=text('supabase/migrations/20261009130500_shared_audio_v03523.sql');
  expect(b).toContain('function acceptEvent(row)');
  expect(b).toContain('markSeen(row.id)');
  expect(b).toContain('audio()?.setAmbience(store.ambience)');
  expect(b).toContain("sendCue(cueKey)");
  expect(b).toContain("sync.connected()?25000:4000");
  expect(engine).toContain('function setAmbience(cueKey)');
  expect(engine).toContain('function spellResult(name,outcome)');
  expect(sql).toContain('campaign_audio_events_gm_insert');
  expect(sql).toContain('private.is_campaign_member(campaign_id)');
  expect(sql).toContain('alter publication supabase_realtime add table public.campaign_audio_events');
  expect(sql).not.toContain('drop publication')
 });
 it('triggers casting and result audio for supported spell modes, including antimagic',()=>{
  const runtime=text('features/combat/runtime.js');
  for(const handler of ['combatCastManualSpell','combatCastStatusSpell','combatCastAreaSpell','combatResolveTestFireball','combatResolveAntimagic']){
   const start=runtime.indexOf('async function '+handler+'(');
   expect(start).toBeGreaterThan(-1);
   const end=runtime.indexOf('\n}',start)+2;
   const snippet=runtime.slice(start,end);
   expect(snippet).toContain("window.aleaAudio:null)?.play('magic.cast')");
   expect(snippet).toContain("window.aleaAudio:null)?.spellResult(")
  }
  const html=text('index.html');
  expect(html).toContain('features/audio/board.js?v=0.35.29')
 });
});
