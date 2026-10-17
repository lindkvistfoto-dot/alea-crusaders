import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gooseDecorativeGearPath,gooseDoorMechanicsMarkup,gooseSealGearMarkup,gooseOriginalBlueInk}
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
 it('tracks only original blue pixels instead of introducing painted replacement curves',()=>{
  for(const side of ['left','right']){
   const markup=gooseDoorMechanicsMarkup(side);
   expect(markup).toContain('goose-player-blue-ink--'+side);
   expect(markup.match(/goose-player-piston-source--/g)).toHaveLength(2);
   expect(markup).toContain('<canvas');
   expect(markup).not.toContain('<path');
   expect(markup).not.toContain('goose-player-gear-train');
  }
  expect(()=>gooseDoorMechanicsMarkup('outsider')).toThrow('INVALID_GOOSE_SIDE');
  expect(gooseOriginalBlueInk({},{})).toBe(false);
 });
 it('keeps the original three HERMES sprites and role-gated shared gallery',()=>{
  const code=read('features/material/goose-player-shutter.js');
  const gallery=read('features/material/arcane-gallery.js');
  const index=read('index.html');
  const library=read('features/material/library.js');
  const frodo=read('features/material/frodo-ui.js');
  const galleryCss=read('features/material/arcane-gallery.css');
  expect(index).toContain('arcane-gallery.css?v=0.35.239&goose=10');
  expect(index).toContain('library.js?v=0.35.239&morph=1&goose=10');
  expect(library).toContain('frodo-ui.js?v=0.35.239&morph=1&goose=10');
  expect(frodo).toContain('arcane-gallery.js?v=0.35.239&morph=1&goose=10');
  expect(gallery).toContain("goose-player-shutter.js?v=10");
  expect(galleryCss).toContain('goose-player-shutter.css?v=10');
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
  expect(css).toContain('goose-player-blue-ink');
  expect(css).toContain('goose-player-piston-source');
  expect(css).toContain('--goose-blue-origin-x:55.2%');
  expect(css).toContain('--goose-blue-origin-x:45.1%');
  expect(css).toContain('clip-path:circle(0% at var(--goose-blue-origin-x,50%) 49.5%)');
  const doorCss=read('features/material/goose-player-shutter.css');
  expect(doorCss).toContain('.goose-player-sapphire--west{left:55.2%}');
  expect(doorCss).toContain('.goose-player-sapphire--east{left:45.1%}');
  expect(css).toContain('clip-path:inset(');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).not.toContain('goose-player-gear-train');
  expect(css).not.toContain('goose-player-lamp');
 });

});
