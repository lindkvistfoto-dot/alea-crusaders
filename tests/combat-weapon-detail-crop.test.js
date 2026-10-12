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
 it('also crops shield and armor art without touching other equipment views',()=>{
  const selectors=css.match(/#[^{]+\{/g)||[];
  expect(selectors.length).toBeGreaterThanOrEqual(8);
  expect(selectors.every(selector=>selector.includes('#combatPage')&&selector.includes('.combat-turn-stats'))).toBe(true);
  expect(css).toContain('.combat-turn-equip-art:is(.shield,.armor)');
  expect(css).toContain('width:210%');
  expect(css).toContain('height:210%');
  expect(runtime).toContain("imageTile('weapon',label,item");
  expect(runtime).toContain("imageTile('shield',label,item");
  expect(runtime).toContain("imageTile('armor','Rustning',worn");
  expect(runtime).toContain("imageTile('carryable',label,item");
  expect(css).not.toContain('.combat-detail-equipment');
 });
 it('independently crops projectile pictures and preserves ammo counts',()=>{
  expect(runtime).toContain('combat-turn-projectile-crop" data-combat-crop=');
  expect(runtime).toContain("srcImg(row.imagePath,'combat-turn-art')");
  expect(runtime).toContain("combat-turn-ammo-placeholder");
  expect(runtime).toContain("combat-turn-ammo-count");
  expect(runtime).toContain("projectileEntries.length>1?' dual'");
  expect(css).toContain('.combat-turn-ammo-images > .combat-turn-projectile-crop');
  expect(css).toContain('flex:1 1 0');
  expect(css).toContain('overflow:hidden');
  expect(css).toContain('.combat-turn-projectile-crop > img.combat-turn-art');
  expect(css).toContain('object-position:top right');
  expect(css).toContain('width:210%');
  expect(css).toContain('height:210%');
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
