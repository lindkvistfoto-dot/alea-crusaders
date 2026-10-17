import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const carousel=read('features/combat/magic-carousel.js');
const css=read('features/combat/arcane-cryptex.css');
const mask=read('features/combat/arcane-cryptex-windows-mask.svg');
const png=readFileSync(new URL('../features/combat/arcane-cryptex-housing.png',import.meta.url));
const html=read('index.html');

describe('Arcane Gold cryptex carousel – square-window lion design',()=>{
 it('ships a transparent PNG in the approved 1536x1024 aspect',()=>{
  expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  expect(png.readUInt32BE(16)).toBe(1536);
  expect(png.readUInt32BE(20)).toBe(1024);
  expect(png[25]).toBe(6); // RGBA colour type
  expect(css).toContain('aspect-ratio:1536/1024');
  expect(css).toContain('arcane-cryptex-windows-mask.svg');
  for(const x of [241,582,1097])expect(mask).toContain('x="'+x+'"');
  expect((mask.match(/<rect /g)||[])).toHaveLength(3);
 });
 it('uses built-in bronze arrows below the side windows, without visible extra controls',()=>{
  expect(carousel).toContain('combat-cryptex-end-button--prev');
  expect(carousel).toContain('combat-cryptex-end-button--next');
  expect(carousel).toContain('aria-label="Föregående besvärjelse"');
  expect(carousel).toContain('aria-label="Nästa besvärjelse"');
  expect(carousel).not.toContain('combat-magic-carousel-arrow');
  expect(css).toContain('top:61%;width:9.5%;height:18%');
  expect(css).toContain('background:transparent;box-shadow:none;color:transparent');
 });
 it('fills the middle square and shrinks neighbours to match smaller openings',()=>{
  expect(carousel).toContain('viewport.clientWidth*.232');
  expect(carousel).toContain('viewport.clientWidth*.279');
  expect(carousel).toContain('const scale=1-displacement*.37');
  expect(css).toContain('max-height:none;min-height:0;aspect-ratio:1/1');
  expect(css).toContain('width:100%;min-width:0;aspect-ratio:1536/1024');
 });
 it('maximizes spell art in the masked cryptex windows without changing the source assets',()=>{
  const base=css.split('.cryptex-prototype .combat-magic-carousel-track>.combat-carousel-spell-tile{')[1]?.split('}')[0]||'';
  expect(base).toContain('background:transparent');
  expect(base).toContain('box-shadow:none');
  expect(base).toContain('overflow:visible');
  expect(css).toContain('.combat-carousel-spell-art{\n inset:-2px;overflow:hidden;border-radius:6px;');
  expect(css).toContain('.combat-carousel-spell-tile.center .combat-carousel-spell-art{\n inset:-3px;border-radius:5px;');
  expect(css).toContain('arcane-cryptex-windows-mask.svg');
 });
 it('centres the complete 3:4 bronze link between the rendered icon edges outside the window mask',()=>{
  expect(css).toContain('arcane-mechanism-chamber.webp?v=0.35.222');
  expect(css).toContain('arcane-mechanism-link.webp?v=0.35.227');
  expect(css).toContain('.combat-cryptex-link-layer{');
  expect(css).toContain('.combat-cryptex-link{');
  expect(css).toContain('height:auto;aspect-ratio:3/4');
  expect(css).toContain('inset:0;z-index:7;overflow:hidden;pointer-events:none');
  expect(carousel).toContain('const leftEdge=leftRect.right,rightEdge=rightRect.left,gapWidth=rightEdge-leftEdge;');
  expect(carousel).toContain("link.style.left=(leftEdge-box.left).toFixed(2)+'px'");
  expect(carousel).toContain("link.style.width=gapWidth.toFixed(2)+'px'");
  expect(carousel).toContain("link.style.top=(cy-box.top).toFixed(2)+'px'");
  expect(carousel).toContain('const linkOverlays=Array.from({length:4}');
  expect(carousel).toContain('updateLinks();');
  expect(css).not.toContain('.combat-magic-carousel-track>.combat-carousel-spell-tile::before{');
  expect(css).toContain('display:flex;flex-wrap:nowrap;align-items:center;');
  expect(css).toContain('width:max-content;gap:var(--combat-carousel-gap,0px)');
  expect(carousel).toContain("track.style.setProperty('--combat-carousel-gap',finalGap+'px')");
  expect(css).toContain('arcane-cryptex-windows-mask.svg');
 });
 it('keeps selection, live nameplate, keyboard operation and inertia',()=>{
  expect(carousel).toContain('combat-cryptex-nameplate');
  expect(carousel).toContain('nameplateText.textContent!==shown');
  expect(carousel).toContain('combatShiftSpellCarousel');
  expect(carousel).toContain('requestAnimationFrame(tick)');
  expect(carousel).toContain('pointerdown');
  expect(carousel).toContain('ArrowRight');
  expect(carousel).toContain('selectCombatPreparedSpell(');
  expect(carousel).toContain('combat-carousel-spell-marks');
 });
 it('renders the housing above the moving strip and keeps touch targets accessible',()=>{
  expect(carousel).toContain('combat-cryptex-housing');
  expect(css).toContain('object-fit:fill;pointer-events:none');
  expect(carousel).toContain('event.stopImmediatePropagation()');
  expect(css).toContain(':focus-visible');
 });
 it('scrolls only overflowing spell names within the plaque and restarts on spell change',()=>{
  expect(carousel).toContain('combat-cryptex-nameplate-text');
  expect(carousel).toContain('const overflow=nameplateText.scrollWidth-available');
  expect(carousel).toContain('const scrolling=available>0&&overflow>2');
  expect(carousel).toContain('nameplate.classList.toggle(\'is-scrolling\',scrolling)');
  expect(carousel).toContain('nameplateText.replaceWith(next)');
  expect(carousel).toContain('measureNameplate(); // Also adapt on window resize');
  expect(css).toContain('justify-content:flex-start');
  expect(css).toContain('@keyframes combat-cryptex-name-scroll');
  expect(css).toContain('var(--cryptex-scroll-distance,0px)');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).toContain('animation:none;transform:none;');
 });
 it('cache-busts the new image, mask and CSS',()=>{
  expect(carousel).toContain('arcane-cryptex-housing.png?v=0.35.207');
  expect(html).toMatch(/arcane-cryptex\.css\?v=0\.35\.\d+/);
  expect(html).toContain('magic-carousel.js?v=0.35.240');
  expect(css).toContain('arcane-cryptex-windows-mask.svg?v=0.35.207');
 });
});
