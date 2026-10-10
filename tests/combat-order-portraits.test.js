import {describe,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const start=runtime.indexOf('const combatNpcPortraitRequests=new Set();');
const end=runtime.indexOf('function combatantCard(',start);
if(start<0||end<start)throw new Error('Combat portrait helpers missing');
const isolated=runtime.slice(start,end);
const npc={id:'npc-1',source_type:'npc',source_id:'person-1',name_snapshot:'Vakten'};
const enemy={id:'enemy-1',source_type:'monster',source_id:'beast-1',name_snapshot:'Skelettvakt'};

function mount({cacheEntries=[],getNpcPortraitUrl}={}){
 const cache=new Map(cacheEntries);
 let renders=0;
 const loadImage=getNpcPortraitUrl||vi.fn(async path=>{
  const url='blob:'+path;
  cache.set(path,url);
  return url;
 });
 const scope={
  campaignNpcs:[{id:'person-1',name:'Vakten',image_path:'people/guard.webp'}],
  campaignMonsters:[{id:'beast-1',name:'Skelettvakt',image_path:'enemies/skeleton.webp'}],
  activeCombat:{id:'fight-1'},
  npcPortraitCachedUrl:path=>cache.get(path)||'',
  getNpcPortraitUrl:loadImage,
  combatPlayerPortraitSource:()=>({url:'blob:hero-portrait'}),
  combatTokenInitials:name=>String(name).slice(0,2).toUpperCase(),
  combatIconCachedUrl:()=>'',escAttr:value=>String(value),
  renderCombat:()=>{renders++},
  console
 };
 runInNewContext(isolated+'\nthis.portraits={combatRowPortraitUrl,combatRowPortraitHtml};',scope);
 return {api:scope.portraits,cache,loadImage,renders:()=>renders}
}

describe('Porträtt i turordning – SLP och fiender',()=>{
 test('SLP visar registrerat porträtt från bildcachen',()=>{
  const t=mount({cacheEntries:[['people/guard.webp','blob:slp-bild']]});
  expect(t.api.combatRowPortraitHtml(npc,'npc-row')).toContain('<img src="blob:slp-bild"');
  expect(t.loadImage).not.toHaveBeenCalled();
 });
 test('fiender och monster visar samma lagrade bild som i administration',()=>{
  const t=mount({cacheEntries:[['enemies/skeleton.webp','blob:skelett-bild']]});
  expect(t.api.combatRowPortraitHtml(enemy,'enemy-row')).toContain('<img src="blob:skelett-bild"');
  expect(t.loadImage).not.toHaveBeenCalled();
 });
 test('om bilden inte förladdats hämtas den och turordningen ritas om',async()=>{
  const t=mount();
  expect(t.api.combatRowPortraitHtml(enemy,'enemy-row')).toContain('>SK</b>');
  expect(t.api.combatRowPortraitHtml(enemy,'enemy-row')).toContain('>SK</b>');
  await vi.waitFor(()=>expect(t.renders()).toBe(1));
  expect(t.loadImage).toHaveBeenCalledTimes(1);
  expect(t.api.combatRowPortraitHtml(enemy,'enemy-row')).toContain('<img src="blob:enemies/skeleton.webp"');
 });
 test('saknat porträtt visar initialer, medan rollpersonens bild är oförändrad',()=>{
  const t=mount();
  t.cache.clear();
  const unnamed={...npc,source_id:'other',name_snapshot:'Orc'};
  expect(t.api.combatRowPortraitHtml(unnamed,'npc-row')).toContain('>OR</b>');
  expect(t.api.combatRowPortraitHtml({id:'hero-1',source_type:'character',name_snapshot:'Astrid'},'player-row')).toContain('<img src="blob:hero-portrait"');
 });
 test('porträtt fungerar utan förladdat SLP-/fienderegister',async()=>{
  const t=mount();
  const row={...enemy,source_id:'hidden-monster',state:{portrait_image_path:'battle/hidden-monster.webp'}};
  expect(t.api.combatRowPortraitHtml(row,'enemy-row')).toContain('>SK</b>');
  await vi.waitFor(()=>expect(t.renders()).toBe(1));
  expect(t.api.combatRowPortraitHtml(row,'enemy-row')).toContain('<img src="blob:battle/hidden-monster.webp"');
 });
 test('ny strid sparar bildsökvägarna i kombatanternas state',()=>{
  expect(runtime).toContain('portrait_image_path:stats.portrait_image_path');
  expect(runtime).toContain("&select=id,name,image_path,attributes,weapons,shield,armor,spells'");
  expect(runtime).toContain("&select=id,name,image_path,attributes,weapons,shield,armor'");
 });
 test('aktiv turpanel använder samma bildkälla som turordningen',()=>{
  expect(runtime).toContain('const url=combatRowPortraitUrl(combatant),initials=combatTokenInitials(combatant.name_snapshot');
  expect(runtime).toContain('combatRowPortraitHtml(c,roleClass)');
 });
});
