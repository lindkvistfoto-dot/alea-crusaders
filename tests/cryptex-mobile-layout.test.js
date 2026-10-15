import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/combat/arcane-cryptex.css');
const mobile=css.slice(css.indexOf('@media(max-width:760px)'));
describe('Mobile ARCANE GOLD cryptex above equipment and panel borders',()=>{
 it('keeps near edge-to-edge artwork sized and centered',()=>{
  expect(mobile).toContain('width:min(calc(100% + 56px),calc(100vw - 8px))');
  expect(mobile).toContain('left:50%');
  expect(mobile).toContain('transform:translateX(-50%)');
 });
 it('puts the action host above the prior equipment panel stacking context',()=>{
  expect(mobile).toMatch(/\.combat-turn-panel\s*\{[^}]*z-index:1/s);
  expect(mobile).toMatch(/#combatActionPanel:has\(\.cryptex-prototype\)\s*\{[^}]*z-index:30;[^}]*overflow:visible!important/s);
  expect(mobile).toContain('margin-top:-68px');
 });
 it('removes all MAGIC CARD crop constraints for the cryptex alone',()=>{
  expect(mobile).toMatch(/\.combat-magic-select-panel:has\(\.cryptex-prototype\)\s*\{[^}]*overflow:visible!important/s);
  expect(mobile).toContain('clip-path:none!important');
  expect(mobile).toContain('-webkit-clip-path:none!important');
  expect(mobile).toContain('isolation:auto');
  expect(mobile).toMatch(/\.combat-cryptex-housing\s*\{[^}]*z-index:7/s);
 });
 it('keeps the spinning belt masked to its three windows and all navigation intact',()=>{
  const base=css.slice(0,css.indexOf('@media(max-width:760px)'));
  expect(base).toContain('aspect-ratio:1536/1024');
  expect(base).toContain('overflow:hidden;background:transparent');
  expect(base).toContain('arcane-cryptex-windows-mask.svg');
  expect(base).toContain('combat-cryptex-end-button--prev');
  expect(base).toContain('combat-cryptex-end-button--next');
  expect(read('index.html')).toContain('arcane-cryptex.css?v=0.35.212');
 });
});
