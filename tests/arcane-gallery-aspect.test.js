import {describe,it,expect} from 'vitest';
import {arcaneFrameHeight,arcaneMediaDimensions,sizeArcaneFrame} from '../features/material/arcane-gallery-aspect.js';
describe('Alea Arcane Gallery smooth telescopic media frame',()=>{
 const w=390,vh=820;
 it('height increases from panorama through square to vertical portrait',()=>{
  const panorama=arcaneFrameHeight(w,1920,1080,vh);
  const square=arcaneFrameHeight(w,1024,1024,vh);
  const portrait=arcaneFrameHeight(w,1080,1920,vh);
  expect(panorama).toBeLessThan(square);
  expect(square).toBeLessThan(portrait);
  expect([panorama,square,portrait]).toEqual([290,449,732]);
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
 it('sets only the local media frame height; does not affect other Alea views',()=>{
  const writes=[],classes=[],root={
   classList:{add:v=>classes.push(v)},
   querySelector:()=>({
    getBoundingClientRect:()=>({width:w}),
    style:{setProperty:(key,val)=>writes.push([key,val])}
   })
  };
  const actual=sizeArcaneFrame(root,{naturalWidth:1080,naturalHeight:1920},vh);
  expect(actual).toBe(732);
  expect(writes).toEqual([['--arcane-frame-height','732px']]);
  expect(classes).toEqual(['arcane-gallery-fluid']);
 });
});
