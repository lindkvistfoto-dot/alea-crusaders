import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function functionSource(name){
 const start=runtime.indexOf('function '+name+'(');
 if(start<0)throw new Error('Missing '+name);
 const end=runtime.indexOf('\nfunction ',start+1);
 return runtime.slice(start,end<0?undefined:end);
}
function mapHandlers(){
 return new Function(`
 let combatMovementDrag=null,combatMapPan=null,combatMapPinch=null,combatMapPreset=null,combatMapPresetActorKey='',combatMapSuppressClickUntil=0;
 const combatMapPointers=new Map(),combatMapView={x:0,y:0,zoom:1};
 const combatMapViewGeometry=()=>({width:100,height:100});
 const combatMapViewBox=()=>({width:100,height:100});
 const combatMapEnsureView=()=>{},combatMapApplyView=()=>{},combatMapZoomAt=()=>{};
 const combatMovementDragMove=()=>{},combatMovementDragEnd=()=>{};
 `+functionSource('combatMapPointerDown')+'\n'+functionSource('combatMapPointerMove')+'\n'+functionSource('combatMapPointerEnd')+`
 return {down:combatMapPointerDown,move:combatMapPointerMove,end:combatMapPointerEnd,state:()=>({pan:combatMapPan,points:combatMapPointers.size,view:combatMapView})};
 `)();
}
function mapFixture(){
 const captures=[],releases=[];
 const svg={setPointerCapture:id=>captures.push(id),releasePointerCapture:id=>releases.push(id),getBoundingClientRect:()=>({width:200,height:200})};
 const mouse=(type,x=50,y=50)=>({type,pointerType:'mouse',pointerId:12,button:0,clientX:x,clientY:y,target:{closest:()=>null},currentTarget:svg,preventDefault(){},stopPropagation(){}});
 return {svg,captures,releases,mouse};
}
describe('Musval av förflyttningshexagon på skrivbord',()=>{
 it('preserves the polygon click target for a normal mouse click',()=>{
  const handlers=mapHandlers(),f=mapFixture();
  handlers.down(f.mouse('pointerdown'));
  expect(f.captures).toEqual([]); // no SVG pointer capture may steal the polygon click
  expect(handlers.state().points).toBe(1);
  handlers.end(f.mouse('pointerup'));
  expect(handlers.state().points).toBe(0);
  expect(handlers.state().pan).toBeNull();
  expect(runtime).toContain('previewCombatMovementToHex(event,');
 });
 it('captures the pointer only after dragging far enough to pan',()=>{
  const handlers=mapHandlers(),f=mapFixture();
  handlers.down(f.mouse('pointerdown'));
  handlers.move(f.mouse('pointermove',52,50));
  expect(f.captures).toEqual([]);
  expect(handlers.state().pan.moved).toBe(false);
  handlers.move(f.mouse('pointermove',65,50));
  expect(f.captures).toEqual([12]);
  expect(handlers.state().pan.moved).toBe(true);
  expect(handlers.state().view.x).toBeLessThan(0);
  handlers.end(f.mouse('pointerup',65,50));
  expect(f.releases).toContain(12);
 });
 it('keeps two-touch pinch capture working',()=>{
  const handlers=mapHandlers(),f=mapFixture();
  const touch=(pointerId,x)=>({...f.mouse('pointerdown',x),pointerType:'touch',pointerId,button:-1});
  handlers.down(touch(21,20));
  expect(f.captures).toEqual([]);
  handlers.down(touch(22,80));
  expect(f.captures).toEqual([21,22]);
 });
});
