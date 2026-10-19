/* Reference v6 acceptance suite now guards v8's real-image component. */
import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/character/arcane-profile-component.css');
const js=read('features/character/arcane-profile-component.js');
const html=read('index.html');
const artDir='assets/arcane/system/v1/';
const icons=['icon-person','icon-swords','icon-female','icon-hourglass',
 'icon-height','icon-weight','icon-heart'];

describe('ARCANE reference artwork and geometry — v8',()=>{
 it('loads exactly one final component after previous profile materials',()=>{
   expect(html).toContain('features/character/arcane-profile-component.css?v=20261019-8d');
   expect(html.indexOf('arcane-profile-component.css')).toBeGreaterThan(html.indexOf('arcane-system.css'));
   expect(html).not.toMatch(/href="[^"]*arcane-layout-v[567]\.css/);
 });
 it('uses real reusable AVIF artwork for all eight symbol slots',()=>{
   expect(js).toContain('const ART_BASE = \'./assets/arcane/system/v1/\'');
   for(const icon of icons){
      expect(js).toContain(icon);
      const path=artDir+icon+'.avif';
      expect(existsSync(new URL('../'+path,import.meta.url))).toBe(true);
      expect(readFileSync(new URL('../'+path,import.meta.url)).toString('ascii',4,12)).toBe('ftypavif');
   }
   for(const asset of ['nameplate','stat-panel','portrait-frame','combat-medallion']){
      expect(existsSync(new URL('../'+artDir+asset+'.avif',import.meta.url))).toBe(true);
   }
 });
 it('renders a genuine image/soft divider/left text structure without SVG',()=>{
   expect(js).toContain("document.createElement('img')");
   expect(js).toContain("document.createElement('span')");
   expect(js).toContain("document.createElement('div')");
   expect(css).toContain('var(--arcane-art-stat)');
   expect(css).toContain('var(--arcane-art-nameplate)');
   expect(css).toContain('var(--arcane-art-combat)');
   expect(js).not.toMatch(/<svg|\.svg/i);
   expect(css).not.toMatch(/url\([^)]*\.svg/i);
 });
 it('positions rows by markup instead of CSS grid specificity battles',()=>{
   expect(js).toContain("layout.appendChild(plaque)");
   expect(js).toContain("layout.appendChild(card)");
   expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
   expect(css).toContain('grid-template-rows:auto repeat(4,calc(var(--ac-card-height) - var(--ac-card-overlap)))');
   expect(css).not.toContain('grid-template-areas:');
 });
});
