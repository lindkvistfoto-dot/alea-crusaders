import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/combat/arcane-cryptex.css');
const mobile=css.slice(css.indexOf('@media(max-width:760px)'));
describe('Mobile ARCANE GOLD cryptex floats above equipment without clipped crown',()=>{
 it('keeps near edge-to-edge width and visible navigation targets',()=>{
  expect(mobile).toContain('width:min(calc(100% + 56px),calc(100vw - 8px))');
  expect(mobile).toContain('left:50%');
  expect(mobile).toContain('transform:translateX(-50%)');
  expect(css).toContain('combat-cryptex-end-button--prev');
  expect(css).toContain('combat-cryptex-end-button--next');
 });
 it('moves the CONTENT CARD up instead of clipping a negatively positioned housing',()=>{
  const card=mobile.match(/\.combat-mini-attack\.combat-mini-magic\.combat-magic-select-panel:has\(\.cryptex-prototype\)\s*\{([^}]*)\}/)?.[1]||'';
  const carousel=mobile.match(/\.combat-magic-carousel\.cryptex-prototype\s*\{([^}]*)\}/)?.[1]||'';
  expect(card).toContain('margin-top:-68px');
  expect(carousel).toMatch(/margin-top:0\s*;/);
  expect(card).toContain('overflow:visible!important');
  expect(card).toContain('background:none!important');
 });
 it('recreates the original frame behind the cryptex at the original vertical coordinate',()=>{
  const frame=mobile.match(/\.combat-magic-select-panel:has\(\.cryptex-prototype\)::before\s*\{([^}]*)\}/)?.[1]||'';
  expect(frame).toContain('top:68px;right:0;bottom:0;left:0');
  expect(frame).toContain('z-index:-1');
  expect(frame).toContain('pointer-events:none');
  expect(frame).toContain('border:1px solid #997343');
 });
 it('lifts the whole action host over the equipment panel while preserving masked windows',()=>{
  expect(mobile).toMatch(/\.combat-turn-panel\s*\{[^}]*z-index:1/s);
  expect(mobile).toMatch(/#combatActionPanel:has\(\.cryptex-prototype\)\s*\{[^}]*z-index:30/s);
  const base=css.slice(0,css.indexOf('@media(max-width:760px)'));
  expect(base).toContain('aspect-ratio:1536/1024');
  expect(base).toContain('arcane-cryptex-windows-mask.svg');
  expect(base).toContain('overflow:hidden;background:transparent');
  expect(read('index.html')).toContain('arcane-cryptex.css?v=0.35.213');
 });
});
