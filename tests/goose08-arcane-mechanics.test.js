import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gooseDecorativeGearPath,gooseDoorMechanicsMarkup,gooseSealGearMarkup}
 from '../features/material/goose-arcane-mechanics.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
describe('GOOSE 08 – non-destructive arcane mechanism layers',()=>{
 it('produces a real 16:12 pair of toothed brass gears',()=>{
  const large=gooseDecorativeGearPath(16,18,14.2);
  const small=gooseDecorativeGearPath(12,13.5,10.3);
  expect(large.match(/L/g)).toHaveLength(63);
  expect(small.match(/L/g)).toHaveLength(47);
  expect(large.endsWith('Z')).toBe(true);
  expect(()=>gooseDecorativeGearPath(2,18,14)).toThrow('INVALID_GOOSE_GEAR');
  const markup=gooseSealGearMarkup();
  expect(markup).toContain('goose-player-gear--drive');
  expect(markup).toContain('goose-player-gear--idler');
  expect(gooseSealGearMarkup('left')).toContain('goose08-brass-left');
  expect(gooseSealGearMarkup('right')).toContain('goose08-brass-right');
  expect(()=>gooseSealGearMarkup('outside')).toThrow('INVALID_GOOSE_GEAR_PART');
  expect(markup).toContain('viewBox="0 0 112 68"');
  expect(markup).not.toContain('http');
 });
 it('engraves two individually animatable channels on each authentic door',()=>{
  for(const side of ['left','right']){
   const markup=gooseDoorMechanicsMarkup(side);
   expect(markup.match(/goose-player-energy-flow--/g)).toHaveLength(2);
   expect(markup.match(/goose-player-piston--/g)).toHaveLength(2);
   expect(markup).toContain('pathLength="100"');
   expect(markup).toContain('preserveAspectRatio="none"');
   expect(markup).toContain('goose-player-energy--'+side);
  }
  expect(gooseDoorMechanicsMarkup('left')).toContain('M35.6 49.5');
  expect(gooseDoorMechanicsMarkup('right')).toContain('M65.8 49.5');
  expect(()=>gooseDoorMechanicsMarkup('outsider')).toThrow('INVALID_GOOSE_SIDE');
 });
 it('keeps the original three HERMES sprites and role-gated shared gallery',()=>{
  const code=read('features/material/goose-player-shutter.js');
  const gallery=read('features/material/arcane-gallery.js');
  expect(code).toContain("gooseDoorMechanicsMarkup('left')");
  expect(code).toContain("gooseDoorMechanicsMarkup('right')");
  expect(code).not.toContain('gooseSealGearMarkup(');
  // GOOSE 09 restores the unchanged sword and laurel; no SVG hubs may cover it.
  expect(code).toContain('<div class="goose-player-seal"><img alt=""></div>');
  expect(gallery).toContain("isLoggedIn()&&");
  expect(gallery).toContain("'./features/material/goose04/left.webp'");
  expect(gallery).toContain("'./features/material/goose04/right.webp'");
  expect(gallery).toContain("'./features/material/goose04/seal.webp'");
  expect(code).not.toContain('rpc/frodo_set_presentation');
  expect(code).toContain("if(!isPlayer())return false");
 });
 it('fires left from first detent and right from third, before each piston moves',()=>{
  const code=read('features/material/goose-player-shutter.js');
  const opening=code.slice(code.indexOf('async function open(){'),code.indexOf('async function close('));
  const closing=code.slice(code.indexOf('async function close('),code.indexOf('function destroy()'));
  const ordered=[
   'setLights(index+1,index)',
   'if(index===0||index===2)',
   "scene.classList.add('goose-player-shutter--energizing-'+side)",
   'timings.charge',
   "scene.classList.add('goose-player-shutter--unlatched-'+side)",
   'timings.release',
   "goose-player-shutter--split",
   "shift(left,{transform:'translateX(0%)'}"
  ];
  const indices=ordered.map(x=>opening.indexOf(x));
  expect(indices.every(i=>i>=0)).toBe(true);
  expect(indices).toEqual([...indices].sort((a,b)=>a-b));
  expect(opening).toContain("index===0?'left':'right'");
  expect(closing).toContain("index===2?'right':'left'");
  expect(closing).toContain("scene.classList.remove('goose-player-shutter--unlatched-'+side)");
  const css=read('features/material/goose-arcane-mechanics.css');
  expect(css).toContain('goose-player-shutter--energizing-left');
  expect(css).toContain('goose-player-shutter--energizing-right');
  expect(css).toContain('goose-player-shutter--unlatched-left');
  expect(css).toContain('goose-player-shutter--unlatched-right');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).toContain('display:none!important');
  expect(css).not.toContain('goose-player-lamp');
 });

});
