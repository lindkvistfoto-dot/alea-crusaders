import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
describe('mobil – läsbar sekundärtext i magikorten',()=>{
 test('magimenyn använder båda klasserna så specifik regel träffar',()=>{
  expect(runtime).toContain('combat-row-action-menu combat-row-magic-menu');
  expect(runtime).toContain('combat-weapon-choice-btn');
 });
 test('överskriver generell ljus text på ljus kortbakgrund',()=>{
  const old=css.indexOf('.combat-row-action-menu .combat-weapon-choice-btn small{color:#cfb895}');
  const override=css.lastIndexOf('.combat-row-action-menu.combat-row-magic-menu .combat-weapon-choice-btn small{');
  expect(old).toBeGreaterThan(-1);expect(override).toBeGreaterThan(old);
  const rule=css.slice(override,css.indexOf('}',override));
  expect(rule).toContain('color:#49392a');
  expect(rule).toContain('font-size:12px');
  expect(rule).toContain('font-weight:600');
  expect(rule).toContain('opacity:1');
 });
});
