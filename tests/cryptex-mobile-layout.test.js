import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('features/combat/arcane-cryptex.css');
const mobile=css.slice(css.indexOf('@media(max-width:760px)'));
const runtime=read('features/combat/runtime.js');
describe('ARCANE GOLD free-floating cryptex on mobile',()=>{
 it('renders the cryptex OUTSIDE the combat card for both preparations',()=>{
  const prepared=runtime.slice(runtime.indexOf('function combatSpellCastPanelHtml()'),runtime.indexOf('function combatDefenseReactionHtml('));
  const unprepared=runtime.slice(runtime.indexOf('function combatAttackPanelHtml()'),runtime.indexOf('function combatTurnPortraitHtml('));
  expect(prepared).toContain('data-cryptex-layer="floating"');
  expect(prepared).toContain("carousel+\n  '<section class=");
  expect(prepared).toContain("'</section>'+(carousel?'</div>':'')");
  expect(unprepared).toContain('data-cryptex-layer="floating"');
  expect(unprepared).toContain("combatSpellCarouselHtml(actor,action)+\n   '<section class=");
  expect(unprepared).toContain('Förbered besvärjelse');
 });
 it('lifts the REAL sibling over round equipment, not the display:contents host',()=>{
  const shell=mobile.match(/\.combat-magic-float-shell\s*\{([^}]*)\}/)?.[1]||'';
  expect(shell).toContain('z-index:40');
  expect(shell).toContain('margin-top:-46px');
  expect(shell).not.toContain('margin-top:-112px');
  expect(mobile).toMatch(/\.combat-turn-panel\s*\{[^}]*z-index:1/s);
  expect(mobile).not.toContain('#combatActionPanel:has(.cryptex-prototype)');
 });
 it('does not draw a second frame or pseudo-panel around the artifact',()=>{
  const card=mobile.match(/\.combat-magic-float-shell>\.combat-mini-attack\.combat-mini-magic\s*\{([^}]*)\}/)?.[1]||'';
  expect(card).toContain('border:0!important');
  expect(card).toContain('background:transparent!important');
  expect(card).toContain('box-shadow:none!important');
  expect(mobile).not.toContain('top:68px;right:0;bottom:0;left:0');
  expect(mobile).toContain('content:none!important');
 });
 it('keeps the three masked windows, button hit targets and horizontal fill',()=>{
  const base=css.slice(0,css.indexOf('@media(max-width:760px)'));
  expect(base).toContain('aspect-ratio:1536/1024');
  expect(base).toContain('arcane-cryptex-windows-mask.svg');
  expect(base).toContain('overflow:hidden;background:transparent');
  expect(base).toContain('combat-cryptex-end-button--prev');
  expect(base).toContain('combat-cryptex-end-button--next');
  expect(mobile).toContain('width:min(calc(100% + 56px),calc(100vw - 8px))');
  expect(read('index.html')).toMatch(/arcane-cryptex\\.css\\?v=0\\.35\\.\\d+/);
 });
 it('keeps the live spell name above the decorative housing on mobile',()=>{
  const housing=mobile.split('.combat-cryptex-housing{')[1]?.split('}')[0]||'';
  const label=mobile.split('.combat-cryptex-nameplate{')[1]?.split('}')[0]||'';
  const zIndex=rule=>Number(rule.split('\n').find(line=>line.trim().startsWith('z-index:'))?.split(':')[1]?.replace(';','')||0);
  expect(zIndex(housing)).toBeGreaterThan(0);
  expect(zIndex(label)).toBeGreaterThan(zIndex(housing));
 });

});
