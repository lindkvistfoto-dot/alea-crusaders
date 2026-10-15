import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('HERMES combat animations',()=>{
 it('accepts immutable MP4/WebM event paths, rejects arbitrary URLs',()=>{
  const w={};
  runInNewContext(read('features/combat/animations.js'),{window:w});
  const a=w.aleaAnimations;
  expect(a.validPath('events/melee.attack/123e4567-e89b-12d3-a456-426614174000.mp4')).toBe(true);
  expect(a.validPath('events/melee.parry/123e4567-e89b-12d3-a456-426614174000.webm')).toBe(true);
  expect(a.validPath('../other.mp4')).toBe(false);
  expect(a.validPath('https://example.com/vfx.mp4')).toBe(false);
 });
 it('uses adjustable speed and safe bounds',()=>{
  const w={};runInNewContext(read('features/combat/animations.js'),{window:w});
  const c=w.aleaAnimations.normalize({event_key:'melee.attack',speed:2.5,scale:12,opacity:-1,blend_mode:'invalid'});
  expect(c.speed).toBe(2.5);expect(c.scale).toBe(3);
  expect(c.opacity).toBe(.1);expect(c.blend_mode).toBe('screen');
 });
 it('wires melee cue and per-event administration separately',()=>{
  const combat=read('features/combat/runtime.js');
  expect(combat).toContain("window.aleaAnimations?.play('melee.attack',{target})");
  expect(combat).toContain("window.aleaAnimations?.play(rolled.success?'melee.parry':'melee.hit',{target:defender})");
  expect(read('legacy/app.js')).toContain("activeAdminSection==='animations'");
  expect(read('index.html')).toContain('data-admin-section="animations"');
 });
});
