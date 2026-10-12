import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const html=read('index.html').toString('utf8');
const journal=read('features/journal/journal.js').toString('utf8');
const css=read('features/home/topbar.css').toString('utf8');
const controller=read('features/home/navigation-icons.js').toString('utf8');
describe('Dice, Admin and Journal illustrated navigation',()=>{
 const items=[
  ['diceNavBtn','dice',html],
  ['adminNavBtn','settings',html],
  ['journalNavBtn','journal',journal]
 ];
 it('provides both active and inactive transparent 512px AVIF assets',()=>{
  for(const [,name] of items)for(const state of ['normal','active']){
   const file=read('assets/navigation/'+name+'-'+state+'.avif');
   expect(file.toString('ascii',4,12),name+state).toBe('ftypavif');
   const ispe=file.indexOf(Buffer.from('ispe'));
   expect(ispe).toBeGreaterThan(0);
   expect(file.readUInt32BE(ispe+8),name+state).toBe(512);
   expect(file.readUInt32BE(ispe+12),name+state).toBe(512);
   expect(file.includes(Buffer.from('auxl')),name+state).toBe(true);
  }
 });
 it('uses existing buttons and native callbacks with separate active images',()=>{
  for(const [id,name,source] of items){
   expect(source).toContain('id="'+id+'"');
   expect(source).toContain('navigation/'+name+'-normal.avif');
   expect(source).toContain('navigation/'+name+'-active.avif');
   expect(source).toContain('alea-nav-art');
   expect(source).toContain('aria-current=\\"false\\"'.replace(/\\/g,''));
  }
  expect(html).toContain('onclick="openDice()"');
  expect(html).toContain('onclick="openAdmin()"');
  expect(html).toContain('class="btn admin-nav alea-nav-art hidden"');
  expect(journal).toContain("jGet('journalNavBtn').addEventListener('click',jOpen)");
  expect(controller).toContain("diceNavBtn:()=>visible('dicePage')");
  expect(controller).toContain("adminNavBtn:()=>visible('admin')");
  expect(controller).toContain("journalNavBtn:()=>visible('journalPage')");
  expect(css).toContain('.alea-nav-art[aria-current="page"] > .alea-nav-asset--active');
 });
 it('preserves mobile journal hub and uses illustrated state there',()=>{
  expect(css).toContain('.alea-toolstrip>#journalNavBtn{display:none!important}');
  expect(css).toContain('navigation/journal-normal.avif');
  expect(css).toContain('navigation/journal-active.avif');
  expect(controller).toContain("button.dataset.navActive=String(id===active)");
 });
});
