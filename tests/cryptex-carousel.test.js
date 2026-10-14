import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const carousel=read('features/combat/magic-carousel.js');
const css=read('features/combat/arcane-cryptex.css');
const mask=read('features/combat/arcane-cryptex-windows-mask.svg');
const svg=read('features/combat/arcane-cryptex-housing.svg');
const html=read('index.html');

describe('Arcane Gold cryptex carousel',()=>{
 it('retains three real transparent mechanical windows',()=>{
  expect(svg).toContain('<mask id="holes">');
  for(const x of [362,791,1400]){
   expect(svg).toContain('x="'+x+'"');
   expect(mask).toContain('x="'+x+'"');
  }
  expect((mask.match(/<rect /g)||[])).toHaveLength(3);
  expect(css).toContain('aspect-ratio:2006/784');
  expect(css).toContain('arcane-cryptex-windows-mask.svg');
 });
 it('uses only the built-in endcaps for backward/forward navigation',()=>{
  expect(carousel).toContain('combat-cryptex-end-button--prev');
  expect(carousel).toContain('combat-cryptex-end-button--next');
  expect(carousel).toContain('aria-label="Föregående besvärjelse"');
  expect(carousel).toContain('aria-label="Nästa besvärjelse"');
  expect(carousel).not.toContain('combat-magic-carousel-arrow');
  expect(css).toContain('background:transparent;box-shadow:none;color:transparent;');
  expect(css).toContain('border:0;border-radius:0;');
 });
 it('keeps selection, keyboard operation, inertial dragging and spell badges',()=>{
  expect(carousel).toContain('combatShiftSpellCarousel');
  expect(carousel).toContain('requestAnimationFrame(tick)');
  expect(carousel).toContain('pointerdown');
  expect(carousel).toContain('ArrowRight');
  expect(carousel).toContain('selectCombatPreparedSpell(');
  expect(carousel).toContain('combat-carousel-spell-marks');
  expect(carousel).toContain('combatMagicCarouselOffsets.set(key');
 });
 it('keeps the housing non-interactive, with separate accessible endcap buttons',()=>{
  expect(carousel).toContain('combat-cryptex-housing');
  expect(css).toContain('object-fit:fill;pointer-events:none');
  expect(carousel).toContain('event.stopImmediatePropagation()');
  expect(css).toContain(':focus-visible');
 });
 it('keeps PNG with an SVG fallback and cache-busted styles',()=>{
  expect(carousel).toContain('arcane-cryptex-housing.png?v=0.35.206');
  expect(carousel).toContain('arcane-cryptex-housing.svg');
  expect(html).toContain('arcane-cryptex.css?v=0.35.206');
 });
});
