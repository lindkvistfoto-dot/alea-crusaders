import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url));

describe('ARCANE CAROUSEL V01 — independent transparent image trough',()=>{
 it('ships the user-approved artwork as a stable transparent WebP',()=>{
  const data=read('features/material/arcane-carousel-v01.webp');
  expect(data.toString('ascii',0,4)).toBe('RIFF');
  expect(data.toString('ascii',8,12)).toBe('WEBP');
  expect(createHash('sha256').update(data).digest('hex'))
   .toBe('4739e54c8440e2aa134eff4afec9929052452c3fb4050bf7e58340b37437e5c3');
  expect(data.length).toBeGreaterThan(15000);
  expect(data.length).toBeLessThan(90000);
 });
 it('ships the new approved Bronze Match cutout without altering the original artwork',()=>{
  const data=read('features/material/arcane-carousel-bronze-match.webp');
  expect(data.toString('ascii',0,4)).toBe('RIFF');
  expect(data.toString('ascii',8,12)).toBe('WEBP');
  expect(createHash('sha256').update(data).digest('hex'))
   .toBe('b52465a25d66835eabb008b6dcd070620b9c631e1f0be123da650253be245ff3');
  expect(data.length).toBeGreaterThan(20000);
  expect(data.length).toBeLessThan(90000);
 });
 it('contains a real isolated alpha-transparent temporary hatch sprite',()=>{
  const art=read('features/material/arcane-carousel-hatch-test-v01.webp');
  expect(art.toString('ascii',0,4)).toBe('RIFF');
  expect(art.toString('ascii',8,12)).toBe('WEBP');
  expect(createHash('sha256').update(art).digest('hex'))
   .toBe('735d00597bdb3f6e591c004b197d67fbc6da71a81a3456eb81a349788d063149');
  expect(art.length).toBeGreaterThan(50000);
 });
 it('mounts temporary half-closed hatch inside original bezel, never replacing it',()=>{
  const gallery=read('features/material/arcane-gallery.js').toString();
  const strip=gallery.indexOf('id="arcaneGalleryStrip"');
  const hatch=gallery.indexOf('arcane-gallery-carousel-shutter-window');
  const bezel=gallery.indexOf('arcane-gallery-carousel-frame');
  expect(strip).toBeGreaterThan(0);
  expect(hatch).toBeGreaterThan(strip);
  expect(bezel).toBeGreaterThan(hatch);
  expect(gallery).toContain('data-hatch="half"');
  expect(gallery).toContain('arcane-carousel-hatch-test-v01.webp');
  expect(gallery).toContain('function testCarouselHatch(position)');
  expect(gallery).toContain('!isGM()');
  const css=read('features/material/arcane-carousel.css').toString();
  expect(css).toContain('.arcane-gallery-carousel-shutter-window');
  expect(css).toContain('left:17%;top:29%;width:66%;height:39%');
  expect(css).toContain('transform:translateX(50%)');
  expect(css).toContain('transform:translateX(100%)');
  expect(css).toContain('transform:translateX(0%)');
  expect(css).toContain('transition:transform 1050ms');
  expect(css).toContain('object-fit:fill');
  expect(css).toContain('z-index:3;pointer-events:none');
  expect(css).toContain('prefers-reduced-motion:reduce');
 });
 it('mounts below the preserved telescopic gallery rather than over its image',()=>{
  const source=read('features/material/arcane-gallery.js').toString();
  const machine=source.indexOf("arcaneMorphMarkup()+'</div>'");
  const carousel=source.indexOf('class="arcane-gallery-carousel"');
  const controls=source.indexOf('class="arcane-gallery-controls"');
  expect(machine).toBeGreaterThan(0);
  expect(carousel).toBeGreaterThan(machine);
  expect(controls).toBeGreaterThan(carousel);
  expect(source).toContain('arcane-gallery-carousel-frame');
  expect(source).toContain('arcane-carousel-bronze-match.webp');
  expect(source).not.toContain('src="./features/material/arcane-carousel-v01.webp"');
  expect(source).not.toContain('arcane-gallery-belt--parked');
  expect(source).toContain('legolas.readMedia(row,true)');
  expect(source).toContain('win().URL.revokeObjectURL');
  expect(source).toContain('if(!allowed()');
 });
 it('uses a continuous empty trough instead of five fixed frames',()=>{
  const css=read('features/material/arcane-carousel.css').toString();
  expect(css).toContain('.arcane-gallery-carousel-track');
  expect(css).toContain('background:transparent');
  expect(css).toContain('overflow-x:auto');
  expect(css).toContain('touch-action:pan-x');
  expect(css).toContain('pointer-events:none');
  expect(css).not.toContain('repeat(5,');
  expect(css).not.toContain('grid-template-columns');
  expect(css).not.toContain('scrollbar-color');
  const gallery=read('features/material/arcane-gallery.css').toString();
  expect(gallery).toContain('arcane-carousel.css?v=04');
 });
 it('physically docks the carousel behind the bottom of the telescopic machine',()=>{
  const css=read('features/material/arcane-carousel.css').toString();
  const rule=css.match(/\.arcane-gallery-carousel\{([^}]*)\}/)?.[1]||'';
  const frame=css.match(/\.arcane-gallery-machine\{([^}]*)\}/)?.[1]||'';
  expect(rule).toContain('margin:-10.6cqw auto 0');
  expect(rule).toContain('z-index:2');
  expect(frame).toContain('z-index:3');
  expect(frame).toContain('overflow:visible');
  expect(rule).toContain('overflow:hidden');
  expect(css).toContain('.arcane-gallery-carousel-track');
 });
 it('busts the entire top-level module and stylesheet chain',()=>{
  const index=read('index.html').toString();
  const library=read('features/material/library.js').toString();
  const frodo=read('features/material/frodo-ui.js').toString();
  expect(index).toContain('goose=10&morph=2&carousel=03');
  expect(index).toContain('&bronze=01&hatch=01');
  expect(index).toContain('morph=2&goose=10&carousel=01');
  expect(library).toContain('frodo-ui.js?v=0.35.239&morph=2&goose=10&carousel=01');
  expect(frodo).toContain('arcane-gallery.js?v=0.35.239&morph=2&goose=10&carousel=01');
 });
});
