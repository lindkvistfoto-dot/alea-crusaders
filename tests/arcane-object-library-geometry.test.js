import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const source=readFileSync(new URL('../features/map/object-library-geometry.js',import.meta.url),'utf8');
function geometry(){const window={};runInNewContext(source,{window,Number,Math,Object});return window.aleaMapObjectGeometry}

describe('ARCANE OBJECT LIBRARY map geometry',()=>{
 it('converts definition metres to intrinsic map pixels',()=>{
  const g=geometry();
  expect(g.pixelSize({width_m:1.8,depth_m:.9},100)).toEqual({width:180,depth:90});
  expect(g.pixelSize({width_m:.5,depth_m:.5},100)).toEqual({width:50,depth:50});
  const chest=g.pixelSize({width_m:1,depth_m:.55},100);
  expect(chest.width).toBeCloseTo(100,8);
  expect(chest.depth).toBeCloseTo(55,8);
 });
 it('derives the pixels-per-metre scale from two map points',()=>{
  expect(geometry().calibrate({x:100,y:200},{x:400,y:600},5)).toBe(100);
 });
 it('returns the physical footprint rotated in the map plane',()=>{
  const polygon=geometry().footprint(1.8,.9,90);
  expect(polygon).toHaveLength(4);
  expect(polygon[0]).toEqual({x:.45,y:-.9});
  expect(polygon[2]).toEqual({x:-.45,y:.9});
 });
 it('rejects missing or non-positive calibration and dimensions',()=>{
  const g=geometry();
  expect(g.calibrate({x:0,y:0},{x:0,y:0},1)).toBeNull();
  expect(g.calibrate({x:0,y:0},{x:10,y:0},0)).toBeNull();
  expect(g.pixelSize({width_m:1,depth_m:1},0)).toBeNull();
  expect(g.footprint(-1,1,0)).toEqual([]);
 });
});
