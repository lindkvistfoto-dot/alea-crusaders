import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../features/combat/attack-participants.css',import.meta.url),'utf8');
const base=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
const assets=['shield','weapon','hit'];
describe('Illustrated defense backgrounds',()=>{
 it('regression: global styles force green and white button backgrounds',()=>{
  expect(base).toContain('.combat-parry-btn{');
  expect(base).toContain('background:#315d3f!important');
  expect(base).toContain('.combat-take-hit-btn{');
  expect(base).toContain('background:#fffaf1!important');
 });
 it('draws foreground-safe artwork in a separate pseudo layer',()=>{
  expect(css).toContain('combat-defense-choice.shield::before');
  expect(css).toContain('combat-defense-choice.weapon::before');
  expect(css).toContain('combat-defense-choice.take-hit::before');
  expect(css).toContain('background-color:#120e0b!important');
  for(const name of assets)expect(css).toContain('url("./assets/defense-bg-'+name+'.webp")');
 });
 it('preserves foreground knight as separate layer',()=>{
  expect(css).toContain('url("./assets/defense-knight.avif")');
  expect(css).toContain('.combat-defense-choice.take-hit::after');
  expect(css).toContain('z-index:1;');
  expect(css).toContain('z-index:2;');
 });
});
