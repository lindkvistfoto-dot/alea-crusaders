import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('features/home/refresh-location.js');
function setup(saved=null){
 const values=new Map(saved?[['alea-refresh-location-v1',JSON.stringify(saved)]]:[]);
 const ids=['landing','home','view','shopPage','innPage','academyPage','combatPage',
  'mapPage','dicePage','journalPage','admin','legolasPanel'];
 const nodes=new Map(ids.map(id=>[id,{id,classList:{
  flags:new Set(['hidden']),contains(x){return this.flags.has(x)},
  add(x){this.flags.add(x)},remove(x){this.flags.delete(x)}
 }}]));
 const main={classList:{contains:()=>false},querySelectorAll:()=>[...nodes.values()]};
 const login={classList:{contains:()=>true}};
 function open(id){for(const node of nodes.values())node.classList.add('hidden');nodes.get(id)?.classList.remove('hidden')}
 const clickMap={landingHomeNavBtn:'landing',landingCharactersNavBtn:'home',shopNavBtn:'shopPage',
  alchemyNavBtn:'shopPage',innNavBtn:'innPage',academyNavBtn:'academyPage',
  combatNavBtn:'combatPage',mapNavBtn:'mapPage',diceNavBtn:'dicePage',
  journalNavBtn:'journalPage',materialNavBtn:'legolasPanel'};
 const document={
  querySelector:q=>q==='main'?main:null,querySelectorAll:()=>[],
  addEventListener:()=>{},
  getElementById:id=>id==='loginScreen'?login:clickMap[id]?{
   click:()=>{open(clickMap[id]);if(id==='alchemyNavBtn')nodes.get('shopPage').classList.add('shop-alchemy')}
  }:nodes.get(id)
 };
 const sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const window={scrollY:0,scrollTo:()=>{},addEventListener:()=>{}};
 runInNewContext(code,{document,sessionStorage,window,MutationObserver:undefined,
  requestAnimationFrame:f=>{f();return 1},console:{warn:()=>{}}});
 return {location:window.aleaRefreshLocation,values,open,nodes,window};
}
describe('Refresh stays on the same Alea page',()=>{
 it('keeps saved combat route through startup landing',async()=>{
  const app=setup({v:1,page:'combatPage',scrollY:0});app.open('landing');
  expect(app.values.get('alea-refresh-location-v1')).toContain('combatPage');
  await app.location.restore();
  expect(app.nodes.get('combatPage').classList.contains('hidden')).toBe(false);
 });
 it('restores alchemy rather than general shop',async()=>{
  const app=setup({v:1,page:'shopPage',alchemy:true});app.open('landing');
  await app.location.restore();
  expect(app.nodes.get('shopPage').classList.contains('shop-alchemy')).toBe(true);
 });
 it('respects a new navigation choice made while loading',async()=>{
  const app=setup({v:1,page:'combatPage'});app.open('dicePage');
  await app.location.restore();
  expect(app.nodes.get('dicePage').classList.contains('hidden')).toBe(false);
 });
 it('remembers character and magic tab without invoking game actions',async()=>{
  const app=setup();app.open('view');await app.location.restore();
  app.location.characterOpened('character-7');app.location.tabChanged('magic');
  expect(JSON.parse(app.values.get('alea-refresh-location-v1'))).toMatchObject({
   page:'view',characterId:'character-7',characterTab:'magic'});
 });
 it('clears saved location when the user logs out',()=>{
  const app=setup({v:1,page:'admin'});app.location.clear();
  expect(app.values.has('alea-refresh-location-v1')).toBe(false);
 });
 it('hooks into authenticated startup without simulating game actions',()=>{
  const legacy=read('legacy/app.js');
  expect(legacy).toContain('await window.aleaRefreshLocation?.restore?.()');
  expect(legacy).toContain('window.aleaRefreshLocation?.clear?.()');
  expect(read('index.html')).toContain('refresh-location.js?v=0.35.228');
  expect(code).not.toContain('rollDice(');
  expect(code).not.toContain('combatCast');
 });
});
