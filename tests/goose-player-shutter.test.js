import {describe,it,expect} from 'vitest';
import {gooseAssetManifestValid,gooseFourByThreeRatio,createGoosePlayerShutter} from '../features/material/goose-player-shutter.js';

const assets={
 left:'./features/material/goose04/left.webp',
 right:'./features/material/goose04/right.webp',
 seal:'./features/material/goose04/seal.webp'
};
function element(){
 const flags=new Set();
 return {
  style:{},dataset:{},innerHTML:'',children:[],
  classList:{add:k=>flags.add(k),remove:k=>flags.delete(k),contains:k=>flags.has(k)},
  setAttribute(){},remove(){this.detached=true;},append(x){this.children.push(x)},
  contains(x){return this.children.includes(x)}
 };
}
function fakeDom(){
 const scene=element();
 const nodes={};
 for(const key of ['.goose-player-door--left','.goose-player-door--right','.goose-player-seal','.goose-player-energy'])
  nodes[key]=element();
 for(const key of ['.goose-player-door--left','.goose-player-door--right','.goose-player-seal'])
  nodes[key].querySelector=()=>element();
 scene.querySelector=key=>nodes[key];
 return {scene,nodes,host:element(),doc:{createElement:()=>scene}};
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
