import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const carousel=read('features/combat/magic-carousel.js');
const css=read('features/combat/arcane-cryptex.css');
const svg=read('features/combat/arcane-cryptex-housing.svg');
const html=read('index.html');

describe('Arcane Gold cryptex carousel prototype',()=>{
 it('shows three mechanical windows with transparent masked openings',()=>{
  expect(svg).toContain('<mask id="holes">');
  for(const x of [362,791,1400])expect(svg).toContain('x="'+x+'"');
  expect(css).toContain('aspect-ratio:2006/784');
 });
 it('keeps original carousel selection, keyboard, inertial dragging and spell badges',()=>{
  expect(carousel).toContain("combatShiftSpellCarousel");
  expect(carousel).toContain('requestAnimationFrame(tick)');
  expect(carousel).toContain("pointerdown");
  expect(carousel).toContain("ArrowRight");
  expect(carousel).toContain("selectCombatPreparedSpell(");
  expect(carousel).toContain('combat-carousel-spell-marks');
  expect(carousel).toContain('combatMagicCarouselOffsets.set(key');
 });
 it('does not turn the bronze artwork into a clickable element',()=>{
  expect(carousel).toContain('combat-cryptex-housing');
  expect(css).toContain('object-fit:fill;pointer-events:none');
  expect(carousel).toContain("event.stopImmediatePropagation()");
 });
 it('retains fallback until the approved PNG is installed',()=>{
  expect(carousel).toContain('arcane-cryptex-housing.png');
  expect(carousel).toContain('arcane-cryptex-housing.svg');
  expect(html).toContain('arcane-cryptex.css');
 });
});
