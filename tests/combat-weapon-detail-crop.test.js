import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/combat/weapon-detail-crop.css');
const runtime=read('features/combat/runtime.js');
const html=read('index.html');

describe('Runda: weapon detail crop only',()=>{
 it('shows upper-right roughly one-quarter of equipped weapon images',()=>{
  expect(css).toContain('#combatPage .combat-turn-panel > .combat-turn-stats > .combat-turn-equip-art.weapon');
  expect(css).toContain('> .combat-turn-art-frame > img.combat-turn-art');
  expect(css).toContain('position:absolute');
  expect(css).toContain('top:0');
  expect(css).toContain('right:0');
  expect(css).toContain('width:210%');
  expect(css).toContain('height:210%');
  expect(css).toContain('overflow:hidden');
  expect(css).toContain('object-position:top right');
 });
 it('keeps two-hand zoom less aggressive while preserving existing rotation',()=>{
  expect(css).toContain('.combat-turn-equip-art.weapon.twohand');
  expect(css).toContain('width:175%');
  expect(css).toContain('height:175%');
  expect(css).toContain('transform:rotate(45deg)');
 });
 it('does not apply crop to shield, armor, ammo, other items or character sheet',()=>{
  const selectors=css.match(/#[^{]+\{/g)||[];
  expect(selectors.length).toBeGreaterThanOrEqual(3);
  expect(selectors.every(s=>s.includes('#combatPage')&&s.includes('.combat-turn-stats')&&s.includes('.weapon'))).toBe(true);
  expect(runtime).toContain("imageTile('weapon',label,item");
  expect(runtime).toContain("imageTile('shield',label,item");
  expect(runtime).toContain("imageTile('armor','Rustning',worn");
  expect(runtime).toContain("combat-turn-equip-art projectile");
 });
 it('loads after standard equipment styling but does not mutate combat logic',()=>{
  const backdrop='features/combat/equipment-background.css?v=';
  const crop='features/combat/weapon-detail-crop.css?v=';
  expect(html.indexOf(backdrop)).toBeGreaterThan(-1);
  expect(html.indexOf(crop)).toBeGreaterThan(html.indexOf(backdrop));
  expect(css).not.toContain('onclick=');
  expect(css).not.toContain('combatAttack');
 });
});
