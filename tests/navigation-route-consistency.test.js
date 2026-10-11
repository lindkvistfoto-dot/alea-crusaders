import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const css=read('features/home/topbar.css');
const controller=read('features/home/navigation-icons.js');
const destinations=[
 ['aleaBannerHomeLink','openLanding()','landing'],
 ['landingHomeNavBtn','openLanding()','landing'],
 ['landingCharactersNavBtn','openCharacters()','home'],
 ['shopNavBtn','openShop()','shopPage'],
 ['alchemyNavBtn','openAlchemyShop()','shopPage'],
 ['innNavBtn','openInn()','innPage'],
 ['academyNavBtn','openAcademy()','academyPage'],
 ['combatNavBtn','openCombat()','combatPage'],
 ['mapNavBtn','openMap()','mapPage'],
 ['diceNavBtn','openDice()','dicePage'],
 ['adminNavBtn','openAdmin()','admin']
];
function setup(){
 const map=new Map(),listeners={};
 const pageIds=['landing','home','view','shopPage','innPage','academyPage',
  'combatPage','mapPage','dicePage','journalPage','admin','legolasPanel','legolasViewer'];
 const navIds=[...destinations.map(x=>x[0]),'materialNavBtn','journalNavBtn'];
 function el(id){
  if(map.has(id))return map.get(id);
  const names=new Set(['hidden']);
  const item={id,inHeader:navIds.includes(id),dataset:{},attributes:{},
   classList:{add:x=>names.add(x),remove:x=>names.delete(x),contains:x=>names.has(x),toggle:(x,on)=>on?names.add(x):names.delete(x)},
   setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},
   querySelector(){return null}};
  map.set(id,item);return item;
 }
 [...pageIds,...navIds,'mobileHubMenu','body'].forEach(el);
 const header={classList:{contains:()=>false},contains:x=>x.inHeader,
  getBoundingClientRect:()=>({bottom:148})};
 const main={querySelectorAll:()=>pageIds.filter(x=>!x.startsWith('legolas')).map(el)};
 const style={setProperty:(k,v)=>style[k]=v};
 const document={body:el('body'),documentElement:{style},hidden:false,
  querySelector:s=>({'.alea-app-header':header,'.alea-app-header .alea-toolstrip':{},'main':main})[s]||null,
  getElementById:id=>map.get(id)||null,
  addEventListener:(kind,callback)=>{(listeners[kind]??=[]).push(callback)}};
 let materialClosed=0;
 const window={legolasClosePanel:()=>{materialClosed++;el('legolasPanel').classList.add('hidden')},
   aleaJournalClose:()=>el('journalPage').classList.add('hidden'),addEventListener:()=>{}};
 runInNewContext(controller,{document,window,ResizeObserver:class{observe(){}},
  MutationObserver:class{observe(){}},queueMicrotask:fn=>Promise.resolve().then(fn),
  requestAnimationFrame:fn=>fn()});
 return {el,style,show:id=>el(id).classList.remove('hidden'),
  hidden:id=>el(id).classList.contains('hidden'),
  click:id=>{const btn=el(id);const target={
    closest:s=>s==='button,a'?btn:({'.alea-toolstrip,.landing-route-nav':{}}[s]||null)};
   for(const listener of listeners.click)listener({target});
  },get materialClosed(){return materialClosed}};
}
describe('Unified navigation and banner self-test',()=>{
 it('maps every banner icon to the native page handler',()=>{
  const header=html.split('<header class="alea-app-header">')[1].split('</header>')[0];
  for(const [id,callback,page] of destinations){
   const tag=header.match(new RegExp('<(?:button|a)[^>]*id="'+id+'"[^>]*>'))?.[0];
   expect(tag,id).toBeTruthy();
   expect(tag,id).toContain(callback);
   expect(controller,id).toContain(id+':\''+page+'\'');
  }
  expect(read('features/material/viewer.js')).toContain("nav.addEventListener('click',()=>openPanel())");
  expect(read('features/journal/journal.js')).toContain("jGet('journalNavBtn').addEventListener('click',jOpen)");
 });
 it('uses one global header, including Material panel, with identical background',()=>{
  expect((html.match(/<header class="alea-app-header">/g)||[])).toHaveLength(1);
  expect(html.indexOf('<header class="alea-app-header">')).toBeLessThan(html.indexOf('<main>'));
  expect(css).toContain('alea-desktop-header.avif');
  expect(css).toContain('body:has(#legolasPanel:not(.hidden)) .alea-app-header');
  expect(css).toContain('top:var(--alea-header-bottom,0px)');
  expect(setup().style['--alea-header-bottom']).toBe('148px');
 });
 it('opens map from guild without leaving the guild rendered beneath it',async()=>{
  const app=setup();app.show('shopPage');app.show('mapPage');app.click('mapNavBtn');
  await Promise.resolve();
  expect(app.hidden('shopPage')).toBe(true);
  expect(app.hidden('mapPage')).toBe(false);
  expect(app.el('mapNavBtn').attributes['aria-current']).toBe('page');
  expect(app.el('shopNavBtn').attributes['aria-current']).toBe('false');
 });
 it('distinguishes Guild and Alchemy active images',async()=>{
  const app=setup();app.show('shopPage');app.click('shopNavBtn');await Promise.resolve();
  expect(app.el('shopNavBtn').attributes['aria-current']).toBe('page');
  app.el('shopPage').classList.add('shop-alchemy');app.click('alchemyNavBtn');await Promise.resolve();
  expect(app.el('alchemyNavBtn').attributes['aria-current']).toBe('page');
  expect(app.el('shopNavBtn').attributes['aria-current']).toBe('false');
 });
 it('closes Material and allows the shared banner to return home',async()=>{
  const app=setup();app.show('legolasPanel');app.show('landing');
  app.click('aleaBannerHomeLink');await Promise.resolve();
  expect(app.materialClosed).toBeGreaterThan(0);
  expect(app.hidden('legolasPanel')).toBe(true);
  expect(app.el('aleaBannerHomeLink').attributes['aria-current']).toBe('page');
 });
 it('does not hide the active page when an Academy navigation attempt fails',async()=>{
  const app=setup();app.show('home');app.click('academyNavBtn');await Promise.resolve();
  expect(app.hidden('home')).toBe(false);
 });
});
