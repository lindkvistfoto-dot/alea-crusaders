import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('Location sound ambience v0.35.26',()=>{
 it('has campaign-scoped location sound assignments and one current source location',()=>{
  const sql=read('supabase/migrations/20261009132500_location_ambience_v03524.sql');
  expect(sql).toContain('ambience_cue_key text references public.rule_sound_cues');
  expect(sql).toContain('source_location_id uuid references public.campaign_locations');
  expect(sql).toContain("when 'Kyrkan' then 'ambience.crypt'");
  const app=read('legacy/app.js');
  expect(app).toContain('id="alAmbience"');
  expect(app).toContain("ambience_cue_key:$('alAmbience').value||null");
  expect(app).toContain('window.aleaSoundboard?.playLocation(');
  expect(app).toContain('ambience_cue_key,sort_order');
 });
 it('GM soundboard verifies a location is in the active campaign, loads choices, and writes source',()=>{
  const board=read('features/audio/board.js');
  expect(board).toContain('async function playLocation(locationId)');
  expect(board).toContain('async function loadLocations(force=false)');
  expect(board).toContain("source_location_id:locationId");
  expect(board).toContain('&revision=eq.');
  expect(board).toContain("place[0].ambience_cue_key!==key");
  expect(board).toContain('data-play-location');
 });
 it('admin sound registry has usable file and category filters',()=>{
  const html=read('index.html'),engine=read('features/audio/engine.js');
  expect(html).toContain('id="adminSoundSearch"');
  expect(html).toContain('id="adminSoundCategory"');
  expect(html).toContain('id="adminSoundFileFilter"');
  expect(engine).toContain("fileFilter==='uploaded'");
 });
 it('fades successive synthetic ambiences through gain ramps instead of hard-stopping old sound',()=>{
  const slopes=[],timeouts=[];
  class AudioContextMock{
   constructor(){this.state='running';this.currentTime=0;this.sampleRate=240}
   createGain(){return {gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v},
      linearRampToValueAtTime(v,time){slopes.push({v,time});this.value=v}},connect(){},disconnect(){}}}
   createBuffer(_channels,size){return {getChannelData:()=>new Float32Array(size)}}
   createBufferSource(){return {loop:false,connect(){},disconnect(){},start(){},stop(){}}}
   createBiquadFilter(){return{connect(){},disconnect(){},frequency:{value:0},Q:{value:0}}}
  }
  const window={AudioContext:AudioContextMock};
  const document={readyState:'loading',addEventListener(){}};
  const ctx={window,document,localStorage:{getItem:()=>null,setItem(){}},console,
   setTimeout:(fn)=>{timeouts.push(fn);return timeouts.length},clearTimeout(){}};
  vm.runInNewContext(read('features/audio/engine.js'),ctx);
  const bus=window.aleaAudio;
  // Explicit game gesture unlocks the audio context; a campaign state sync alone must not.
  expect(bus.setAmbience('ambience.rain')).toBe(true);
  expect(slopes).toHaveLength(0);
  bus.unlock();
  expect(bus.setAmbience('ambience.rain')).toBe(true);
  expect(bus.activeAmbience()).toBe('ambience.rain');
  expect(bus.setAmbience('ambience.crypt')).toBe(true);
  expect(bus.activeAmbience()).toBe('ambience.crypt');
  expect(slopes.some(x=>x.v===0)).toBe(true);
  expect(slopes.some(x=>x.v>0)).toBe(true);
  expect(timeouts.length).toBeGreaterThan(0);
  expect(bus.setAmbience(null)).toBe(true);
  expect(bus.activeAmbience()).toBe(null);
 });
});
