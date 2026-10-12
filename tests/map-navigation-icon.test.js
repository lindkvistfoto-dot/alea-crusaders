import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const html=read('index.html').toString('utf8');
const controller=read('features/home/navigation-icons.js').toString('utf8');
describe('Kartor/Platser — matchande navigeringsikonpar',()=>{
 it('använder separata transparenta AVIF-bilder i 512 x 512',()=>{
  for(const state of ['normal','active']){
   const file=read('assets/navigation/map-'+state+'.avif');
   expect(file.toString('ascii',4,12)).toBe('ftypavif');
   expect(file.length).toBeGreaterThan(4000);
   const ispe=file.indexOf(Buffer.from('ispe'));
   expect(ispe).toBeGreaterThan(0);
   expect(file.readUInt32BE(ispe+8)).toBe(512);
   expect(file.readUInt32BE(ispe+12)).toBe(512);
   expect(file.includes(Buffer.from('auxl'))).toBe(true);
  }
 });
 it('behåller originalknappens länk, tillgänglighet och två bildlägen',()=>{
  const tag=html.match(/<button id="mapNavBtn"[^>]*>[\s\S]*?<\/button>/)?.[0];
  expect(tag).toBeTruthy();
  expect(tag).toContain('class="btn map-nav alea-nav-art"');
  expect(tag).toContain('aria-current="false"');
  expect(tag).toContain('onclick="openMap()"');
  expect(tag).toContain('navigation/map-normal.avif');
  expect(tag).toContain('navigation/map-active.avif');
  expect((tag.match(/width="104" height="104"/g)||[])).toHaveLength(2);
  expect(tag).not.toContain('🗺️');
 });
 it('markerar guldikonen endast när kartan visas',()=>{
  expect(controller).toContain("mapNavBtn:()=>visible('mapPage')");
  expect(controller).toContain("mapNavBtn:'mapPage'");
  expect(controller).toContain("state=id===active?'page':'false'");
  const css=read('features/home/topbar.css').toString('utf8');
  expect(css).toContain('.alea-nav-art[aria-current="page"] > .alea-nav-asset--active');
 });
});
