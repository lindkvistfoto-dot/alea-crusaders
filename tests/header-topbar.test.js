import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
describe('Alea unified header',()=>{
 const html=read('index.html');
 const css=read('features/home/topbar.css');
 test('all navigation stays grouped and status remains separate',()=>{
   expect(html).toContain('class="alea-toolstrip"');
   expect(html).toContain('class="alea-headingbar"');
   expect(html).toContain('class="alea-clock"');
   expect(html).toContain('class="alea-account"');
   const strip=html.split('<nav class="alea-toolstrip"')[1].split('</nav>')[0];
   for(const id of ['shopNavBtn','alchemyNavBtn','innNavBtn','combatNavBtn','mapNavBtn','diceNavBtn']){
     expect(strip).toContain('id="'+id+'"');
   }
   const heading=html.split('<div class="alea-headingbar">')[1];
   for(const id of ['dayNavBtn','campaignTimeControl','landingHomeNavBtn','landingCharactersNavBtn','appVersion']){
     expect(heading).toContain('id="'+id+'"');
   }
 });
 test('mobile uses bounded icon grid with no page-level sideways scrolling',()=>{
   expect(css).toContain('grid-template-columns:repeat(4,minmax(0,1fr))');
   expect(css).toContain('.alea-app-header .alea-toolstrip>.btn');
   expect(css).toContain('max-width:100%');
   expect(css).not.toContain('overflow-x:auto');
 });
 test('journal is a square labelled icon and material mounts inside the toolbar',()=>{
   const journal=read('features/journal/journal.js');
   const viewer=read('features/material/viewer.js');
   expect(journal).toContain('id="journalNavBtn"');
   expect(journal).toContain('aria-label="Öppna kampanjjournalen"');
   expect(viewer).toContain("el('mapNavBtn')");
 });
 test('stylesheet is versioned and loads after the original home styles',()=>{
   const version=JSON.parse(read('package.json')).version;
   expect(html).toContain('./features/home/topbar.css?v='+version);
   expect(html.indexOf('features/home/topbar.css')).toBeGreaterThan(html.indexOf('features/home/home.css'));
 });
});
