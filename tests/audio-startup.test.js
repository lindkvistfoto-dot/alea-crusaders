import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function bootEngine({inGame=false,session=false}={}){
 const events=new Map(),played=[];
 let created=0,fetches=0;
 const dock={};
 const login={classList:{contains:key=>key==='hidden'&&session}};
 const home={classList:{contains:key=>key==='hidden'&&inGame}};
 const document={
  readyState:'loading',
  addEventListener(event,fn){events.set(event,fn)},
  getElementById(id){return id==='aleaAudioDock'?dock:
    id==='loginScreen'?login:id==='home'?home:null}
 };
 class AudioContextMock{
  constructor(){created++;this.state='running';this.currentTime=0;this.sampleRate=200;this.destination={}}
  createGain(){return{gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v},
     linearRampToValueAtTime(v){this.value=v}},connect(){},disconnect(){}}}
  createBuffer(_channels,size){return{getChannelData:()=>new Float32Array(size)}}
  createBufferSource(){return{connect(){},disconnect(){},start(){},stop(){}}}
  createBiquadFilter(){return{connect(){},disconnect(){},frequency:{value:0}}}
 }
 const window={AudioContext:AudioContextMock};
 const ctx={window,document,console,localStorage:{getItem:()=>null,setItem(){}},
  setTimeout:()=>1,clearTimeout(){},fetch(){fetches++;return Promise.resolve({ok:true})}};
 vm.runInNewContext(read('features/audio/engine.js'),ctx);
 events.get('DOMContentLoaded')();
 return{bus:window.aleaAudio,events,created:()=>created,fetches:()=>fetches,played}
}

describe('Startup-safe optional sound controls v0.35.26',()=>{
 it('never creates AudioContext or queries audio registry on ordinary login/home pointer or key interactions',()=>{
  const app=bootEngine({session:true,inGame:false});
  for(let i=0;i<8;i++){app.events.get('pointerdown')();app.events.get('keydown')()}
  expect(app.created()).toBe(0);
  expect(app.fetches()).toBe(0);
 });
 it('defers synchronized ambience until explicit in-game gesture',()=>{
  const app=bootEngine({session:true,inGame:true});
  expect(app.bus.setAmbience('ambience.rain')).toBe(true);
  expect(app.created()).toBe(0);
  app.events.get('pointerdown')();
  expect(app.created()).toBe(1);
  expect(app.bus.activeAmbience()).toBe('ambience.rain');
 });
 it('keeps front-page and login sound overlays out of hit testing',()=>{
  const css=read('src/styles/app.css');
  expect(css).toContain('#loginScreen:not(.hidden) ~ #aleaAudioDock');
  expect(css).toContain('body:has(#home:not(.hidden)) #aleaAudioDock');
  expect(css).toContain('body:has(#home:not(.hidden)) #aleaSoundboard');
  expect(read('features/audio/engine.js')).not.toContain('if(!loaded&&userToken())load().catch');
 });
});
