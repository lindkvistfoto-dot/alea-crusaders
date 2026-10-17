import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gooseAssetManifestValid,gooseFourByThreeRatio,gooseQuarterKeyframes,createGoosePlayerShutter} from '../features/material/goose-player-shutter.js';

const assets={
 left:'./features/material/goose04/left.webp',
 right:'./features/material/goose04/right.webp',
 seal:'./features/material/goose04/seal.webp'
};
function element(){
 const flags=new Set();
 return {
  style:{},dataset:{},innerHTML:'',children:[],
  classList:{add:k=>flags.add(k),remove:(...keys)=>keys.forEach(k=>flags.delete(k)),contains:k=>flags.has(k),toggle:(k,on)=>on?flags.add(k):flags.delete(k)},
  setAttribute(){},remove(){this.detached=true;},append(x){this.children.push(x)},
  contains(x){return this.children.includes(x)}
 };
}
function fakeDom(){
 const scene=element();
 const nodes={};
 for(const key of ['.goose-player-door--left','.goose-player-door--right','.goose-player-seal','.goose-player-energy','.goose-player-seal-half--left','.goose-player-seal-half--right'])
  nodes[key]=element();
 for(const key of ['.goose-player-door--left','.goose-player-door--right','.goose-player-seal'])
  nodes[key].querySelector=()=>element();
 const stones={
  north:[element(),element()],east:[element()],
  south:[element(),element()],west:[element()]
 };
 scene.querySelector=key=>nodes[key];
 scene.querySelectorAll=key=>stones[key.replace('.goose-player-sapphire--','')]||[];
 return {scene,nodes,stones,host:element(),doc:{createElement:()=>scene}};
}
describe('GOOSE player-only shutter staging',()=>{
 it('locks the home aperture to 4:3',()=>{
  expect(gooseFourByThreeRatio()).toBe('4 / 3');
 });
 it('requires local WebP sprites and rejects external and parent-relative links',()=>{
  expect(gooseAssetManifestValid(assets)).toBe(true);
  expect(gooseAssetManifestValid({...assets,left:'https://other.invalid/left.webp'})).toBe(false);
  expect(gooseAssetManifestValid({...assets,left:'./features/material/../private.webp'})).toBe(false);
  expect(gooseAssetManifestValid({...assets,left:'./features/material/raw.png'})).toBe(false);
 });
 it('does not mount or animate for a GM or logged-out visitor',async()=>{
  const f=fakeDom();
  const gate=createGoosePlayerShutter({host:f.host,assets,doc:()=>f.doc,isPlayer:()=>false});
  expect(gate.mount()).toBe(false);
  expect(await gate.open()).toBe(false);
  expect(f.host.children).toHaveLength(0);
 });
 it('opens, closes, resets and releases a player-only gate without reading media',async()=>{
  const f=fakeDom();
  const gate=createGoosePlayerShutter({host:f.host,assets,doc:()=>f.doc,isPlayer:()=>true,win:()=>({})});
  expect(gate.mount()).toBe(true);
  expect(gate.phase).toBe('closed');
  expect(await gate.open()).toBe(true);
  expect(gate.phase).toBe('open');
  expect(f.nodes['.goose-player-door--left'].style.transform).toBe('translateX(-110%)');
  expect(f.nodes['.goose-player-door--right'].style.transform).toBe('translateX(110%)');
  expect(f.nodes['.goose-player-seal'].style.opacity).toBe('0');
  let prepared=0;
  expect(await gate.close({prepareFourByThree:()=>{prepared++;}})).toBe(true);
  expect(prepared).toBe(1);
  expect(gate.phase).toBe('closed');
  expect(f.nodes['.goose-player-door--left'].style.transform).toBe('translateX(0%)');
  expect(f.nodes['.goose-player-seal'].style.opacity).toBe('1');
  gate.reset();
  gate.destroy();
  expect(f.scene.detached).toBe(true);
 });
});

describe('GOOSE 07 – four sapphire-driven mechanical locks',()=>{
 it('provides stepped keyframes without overshoot or free rotation',()=>{
  const frames=gooseQuarterKeyframes(90,180);
  expect(frames.map(f=>f.offset)).toEqual([0,.17,.28,.81,.92,1]);
  expect(frames.at(0).transform).toBe('rotate(90deg)');
  expect(frames.at(-1).transform).toBe('rotate(180deg)');
  expect(frames.every(f=>!f.transform.includes('scale'))).toBe(true);
 });
 it('lights four blue detents in order; splits the sigil only after exactly 360°',async()=>{
  const f=fakeDom(),calls=[],doorStart=[];
  const seal=f.nodes['.goose-player-seal'];
  seal.animate=(frames,options)=>{
   if(frames.length===6){
    calls.push({
     start:frames[0].transform,end:frames.at(-1).transform,
     priorLocks:Number(f.scene.dataset.unlockedLocks)
    });
   }
   return {finished:Promise.resolve(),cancel(){}};
  };
  for(const key of ['.goose-player-door--left','.goose-player-door--right']){
   f.nodes[key].animate=(frames,options)=>{
    doorStart.push({split:f.scene.classList.contains('goose-player-shutter--split'),
     sealOpacity:seal.style.opacity,locks:f.scene.dataset.unlockedLocks});
    return {finished:Promise.resolve(),cancel(){}};
   };
  }
  const gate=createGoosePlayerShutter({host:f.host,assets,doc:()=>f.doc,isPlayer:()=>true,win:()=>({matchMedia:()=>({matches:false})})});
  gate.mount();
  expect(f.nodes['.goose-player-seal-half--left'].style.backgroundImage).toContain('seal.webp');
  expect(f.nodes['.goose-player-seal-half--right'].style.backgroundImage).toContain('seal.webp');
  expect(await gate.open()).toBe(true);
  expect(calls.slice(0,4)).toEqual([
   {start:'rotate(0deg)',end:'rotate(90deg)',priorLocks:0},
   {start:'rotate(90deg)',end:'rotate(180deg)',priorLocks:1},
   {start:'rotate(180deg)',end:'rotate(270deg)',priorLocks:2},
   {start:'rotate(270deg)',end:'rotate(360deg)',priorLocks:3}
  ]);
  expect(doorStart).toHaveLength(2);
  expect(doorStart.every(x=>x.split&&x.sealOpacity==='0'&&x.locks==='4')).toBe(true);
  expect(f.scene.dataset.unlockedLocks).toBe('4');
  for(const key of ['north','east','south','west'])
   expect(f.stones[key].every(stone=>stone.classList.contains('is-lit'))).toBe(true);
  expect(f.stones.north).toHaveLength(2);
  expect(f.stones.south).toHaveLength(2);
  expect(f.stones.east).toHaveLength(1);
  expect(f.stones.west).toHaveLength(1);
  doorStart.length=0;
  expect(await gate.close()).toBe(true);
  expect(calls.slice(4).map(c=>c.end)).toEqual([
   'rotate(270deg)','rotate(180deg)','rotate(90deg)','rotate(0deg)'
  ]);
  expect(doorStart.every(x=>x.split&&x.sealOpacity==='0')).toBe(true);
  expect(f.scene.dataset.unlockedLocks).toBe('0');
  for(const parts of Object.values(f.stones))
   expect(parts.every(stone=>!stone.classList.contains('is-lit'))).toBe(true);
  expect(f.scene.classList.contains('goose-player-shutter--split')).toBe(false);
  expect(seal.style.transform).toBe('rotate(0deg)');
 });
 it('resets in-flight locks without leaving a blue lamp or detached seal',async()=>{
  const f=fakeDom(),seal=f.nodes['.goose-player-seal'];
  let rejectAnimation;
  seal.animate=()=>({finished:new Promise((_,reject)=>{rejectAnimation=reject}),
   cancel(){rejectAnimation?.(Error('cancelled'));}});
  const gate=createGoosePlayerShutter({host:f.host,assets,doc:()=>f.doc,isPlayer:()=>true,win:()=>({})});
  gate.mount();
  const underway=gate.open();
  expect(gate.phase).toBe('opening');
  gate.reset();
  expect(await underway).toBe(false);
  expect(gate.phase).toBe('closed');
  expect(f.scene.dataset.unlockedLocks).toBe('0');
  expect(f.scene.classList.contains('goose-player-shutter--charged')).toBe(false);
  expect(f.scene.classList.contains('goose-player-shutter--split')).toBe(false);
  expect(seal.style.opacity).toBe('1');
 });
 it('honors reduced motion: final construction is still mechanically whole',async()=>{
  const f=fakeDom();
  const gate=createGoosePlayerShutter({host:f.host,assets,doc:()=>f.doc,isPlayer:()=>true,
   win:()=>({matchMedia:()=>({matches:true})})});
  gate.mount();expect(await gate.open()).toBe(true);
  expect(f.nodes['.goose-player-seal'].style.transform).toBe('rotate(360deg)');
  expect(f.scene.dataset.unlockedLocks).toBe('4');
  expect(await gate.close()).toBe(true);
  expect(f.nodes['.goose-player-seal'].style.transform).toBe('rotate(0deg)');
  expect(f.scene.dataset.unlockedLocks).toBe('0');
 });
});

describe('GOOSE 07 sapphire artwork fidelity',()=>{
 it('contains no independent indicator lamps or artificial gem buttons',()=>{
  const css=readFileSync(new URL('../features/material/goose-player-shutter.css',import.meta.url),'utf8');
  const js=readFileSync(new URL('../features/material/goose-player-shutter.js',import.meta.url),'utf8');
  expect(css).not.toContain('goose-player-lamp');
  expect(js).not.toContain('goose-player-lamp');
  expect(css).toContain('mix-blend-mode:screen');
  expect(css).toContain('goose-player-sapphire--north');
  expect(css).toContain('goose-player-sapphire--east');
  expect(css).toContain('goose-player-sapphire--south');
  expect(css).toContain('goose-player-sapphire--west');
  expect(css).toContain('.goose-player-door--left .goose-player-sapphire--north');
  expect(css).toContain('.goose-player-door--right .goose-player-sapphire--south');
  expect(css).toContain('animation:none!important');
 });
 it('synchronizes both halves of top/bottom stones and ignites only on 90° detents',async()=>{
  const f=fakeDom();
  const log=[];
  const seal=f.nodes['.goose-player-seal'];
  seal.animate=(frames)=>{
   if(frames.length===6){
    log.push({
     to:frames.at(-1).transform,
     lit:Object.fromEntries(Object.entries(f.stones).map(([name,parts])=>
      [name,parts.every(part=>part.classList.contains('is-lit'))])),
     pulsing:Object.entries(f.stones).filter(([,parts])=>
      parts.some(part=>part.classList.contains('is-pulsing'))).map(([name])=>name)
    });
   }
   return {finished:Promise.resolve(),cancel(){}};
  };
  const gate=createGoosePlayerShutter({host:f.host,assets,doc:()=>f.doc,
   isPlayer:()=>true,win:()=>({})});
  gate.mount();expect(await gate.open()).toBe(true);
  expect(log.map(x=>x.to)).toEqual([
   'rotate(90deg)','rotate(180deg)','rotate(270deg)','rotate(360deg)'
  ]);
  expect(log.map(x=>x.lit)).toEqual([
   {north:false,east:false,south:false,west:false},
   {north:true,east:false,south:false,west:false},
   {north:true,east:true,south:false,west:false},
   {north:true,east:true,south:true,west:false}
  ]);
  expect(f.stones.north.every(x=>x.classList.contains('is-lit'))).toBe(true);
  expect(f.stones.south.every(x=>x.classList.contains('is-lit'))).toBe(true);
  expect(await gate.close()).toBe(true);
  const reverse=log.slice(4);
  expect(reverse.map(x=>x.to)).toEqual([
   'rotate(270deg)','rotate(180deg)','rotate(90deg)','rotate(0deg)'
  ]);
  expect(reverse.map(x=>x.lit)).toEqual([
   {north:true,east:true,south:true,west:true},
   {north:true,east:true,south:true,west:false},
   {north:true,east:true,south:false,west:false},
   {north:true,east:false,south:false,west:false}
  ]);
  expect(Object.values(f.stones).flat().every(x=>!x.classList.contains('is-lit'))).toBe(true);
 });
 it('fully resets sapphire glows even after a completed open',async()=>{
  const f=fakeDom();
  const gate=createGoosePlayerShutter({host:f.host,assets,doc:()=>f.doc,isPlayer:()=>true,win:()=>({})});
  gate.mount();
  expect(await gate.open()).toBe(true);
  gate.reset();
  expect(gate.phase).toBe('closed');
  expect(f.scene.classList.contains('goose-player-shutter--charged')).toBe(false);
  expect(f.scene.dataset.unlockedLocks).toBe('0');
  expect(Object.values(f.stones).flat().every(x=>
   !x.classList.contains('is-lit')&&!x.classList.contains('is-pulsing'))).toBe(true);
 });
});
