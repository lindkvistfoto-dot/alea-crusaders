import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/combat/arcane-cryptex.css');
const mobile=css.slice(css.indexOf('@media(max-width:760px)'));
describe('Mobile ARCANE GOLD cryptex placement',()=>{
 it('resizes the entire stage to almost full viewport width with safe edges',()=>{
  expect(mobile).toContain('width:min(calc(100% + 56px),calc(100vw - 8px))');
  expect(mobile).toContain('left:50%');
  expect(mobile).toContain('transform:translateX(-50%)');
 });
 it('overlaps the equipment row while allowing the crown outside the panel',()=>{
  expect(mobile).toContain('margin-top:-42px');
  expect(mobile).toContain('#combatActionPanel:has(.cryptex-prototype)');
  expect(mobile).toMatch(/#combatActionPanel:has\(\.cryptex-prototype\)\s*\{[^}]*z-index:8;overflow:visible/s);
  expect(mobile).toContain('.combat-magic-select-panel:has(.cryptex-prototype)');
 });
 it('keeps cryptex windows, arrows and desktop styling untouched',()=>{
  const base=css.slice(0,css.indexOf('@media(max-width:760px)'));
  expect(base).toContain('aspect-ratio:1536/1024');
  expect(base).toContain('arcane-cryptex-windows-mask.svg');
  expect(base).toContain('combat-cryptex-end-button--prev');
  expect(base).toContain('combat-cryptex-end-button--next');
  expect(read('index.html')).toContain('arcane-cryptex.css?v=0.35.211');
 });
});
