import {describe,it,expect} from 'vitest';
import {arcaneFrameHeight,arcaneMediaDimensions,arcaneGearRotation,arcaneExtensionProgress,sizeArcaneFrame,resetArcaneFrame,arcaneKitFrameHeight} from '../features/material/arcane-gallery-aspect.js';
describe('Alea Arcane Gallery smooth telescopic media frame',()=>{
 const w=390,vh=820;
 it('height increases from panorama through square to vertical portrait',()=>{
  const panorama=arcaneFrameHeight(w,1920,1080,vh);
  const square=arcaneFrameHeight(w,1024,1024,vh);
  const portrait=arcaneFrameHeight(w,1080,1920,vh);
  expect(panorama).toBeLessThan(square);
  expect(square).toBeLessThan(portrait);
  expect([panorama,square,portrait]).toEqual([290,449,731]);
 });
 it('clamps pathological media dimensions but never distorts the original',()=>{
  const low=arcaneFrameHeight(w,15000,100,vh);
  const high=arcaneFrameHeight(w,100,15000,vh);
  expect(low).toBeGreaterThanOrEqual(Math.round(w*.72));
  expect(high).toBeLessThanOrEqual(Math.max(w*1.9,vh*1.22));
  expect(arcaneFrameHeight(w,0,1,vh)).toBeNull();
  expect(arcaneFrameHeight(-1,640,480,vh)).toBeNull();
 });
 it('supports image natural dimensions and later HTML video metadata',()=>{
  expect(arcaneMediaDimensions({naturalWidth:800,naturalHeight:600})).toEqual({width:800,height:600});
  expect(arcaneMediaDimensions({videoWidth:1920,videoHeight:1080})).toEqual({width:1920,height:1080});
  expect(arcaneMediaDimensions({naturalWidth:0,naturalHeight:0})).toBeNull();
 });
 it('synchronizes gear rotation monotonically with the telescopic extension',()=>{
  const wide=arcaneGearRotation(arcaneFrameHeight(w,1920,1080,vh),w);
  const square=arcaneGearRotation(arcaneFrameHeight(w,1024,1024,vh),w);
  const portrait=arcaneGearRotation(arcaneFrameHeight(w,1080,1920,vh),w);
  expect(wide).toBeLessThan(square);
  expect(square).toBeLessThan(portrait);
  expect(arcaneGearRotation(0,w)).toBe(0);
  expect(arcaneGearRotation(10_000,w)).toBe(540);
 });
 it('synchronizes genuine piston artwork with the gears and clamps extension',()=>{
  expect(arcaneExtensionProgress(0,390)).toBe(0);
  expect(arcaneExtensionProgress(10_000,390)).toBe(1);
  const closed=arcaneExtensionProgress(arcaneKitFrameHeight(390,1920,1080,820),390);
  const extended=arcaneExtensionProgress(arcaneKitFrameHeight(390,1080,1920,820),390);
  expect(extended).toBeGreaterThan(closed);
  expect(arcaneGearRotation(673,390)).toBe(Math.round(arcaneExtensionProgress(673,390)*540));
 });
 it('can reset geometry when the campaign or private preview is cleared',()=>{
  const deleted=[],classes=[];
  const machine={style:{removeProperty:key=>deleted.push(key)}};
  resetArcaneFrame({
   querySelector:key=>key==='.arcane-gallery-machine'?machine:null,
   classList:{remove:cls=>classes.push(cls)}
  });
  expect(deleted).toEqual(['--arcane-frame-height','--arcane-gear-angle','--arcane-extension']);
  expect(classes).toEqual(['arcane-gallery-fluid']);
  expect(()=>resetArcaneFrame(null)).not.toThrow();
 });
 it('supports common 16:9, 4:3, 1:1, and 9:16 artwork',()=>{
  const formats=[[16,9],[4,3],[1,1],[9,16]];
  const heights=formats.map(([w,h])=>arcaneFrameHeight(390,w,h,820));
  expect(heights).toEqual([...heights].sort((a,b)=>a-b));
  expect(new Set(heights).size).toBe(4);
 });
 it('sizes the new rigid-kit opening exactly for four source aspect ratios',()=>{
  const formats=[[16,9],[4,3],[1,1],[9,16]];
  const heights=formats.map(([w,h])=>arcaneKitFrameHeight(390,w,h,820));
  expect(heights).toEqual([304,361,437,673]);
  expect(arcaneKitFrameHeight(390,0,10)).toBeNull();
  expect(arcaneKitFrameHeight(-1,1,1)).toBeNull();
  const calls=[];
  const root={
   classList:{contains:s=>s==='arcane-gallery-kit',add:s=>calls.push(s)},
   querySelector:()=>({getBoundingClientRect:()=>({width:390}),
    style:{setProperty:(key,value)=>calls.push([key,value])}})
  };
  expect(sizeArcaneFrame(root,{naturalWidth:1080,naturalHeight:1920},820)).toBe(673);
  expect(calls).toContainEqual(['--arcane-frame-height','673px']);
 });
 it('sets only the local media frame height; does not affect other Alea views',()=>{
  const writes=[],classes=[],root={
   classList:{add:v=>classes.push(v)},
   querySelector:()=>({
    getBoundingClientRect:()=>({width:w}),
    style:{setProperty:(key,val)=>writes.push([key,val])}
   })
  };
  const actual=sizeArcaneFrame(root,{naturalWidth:1080,naturalHeight:1920},vh);
  expect(actual).toBe(731);
  expect(writes).toEqual([['--arcane-frame-height','731px'],['--arcane-gear-angle',arcaneGearRotation(731,w)+'deg'],['--arcane-extension',arcaneExtensionProgress(731,w).toFixed(3)]]);
  expect(classes).toEqual(['arcane-gallery-fluid']);
 });
});
