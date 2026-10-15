import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const iconPath='assets/spells/arcane-ivory/finna-vatten.webp';
const key='11111111-1111-4111-8111-111111111111';
function setup(extra={}){
 const w={addEventListener:vi.fn()};
 const ctx={window:w,document:{querySelectorAll:()=>[]},console,...extra};
 runInNewContext(read('features/combat/spell-art.js'),ctx);
 return {ctx,api:w.aleaSpellArt};
}
describe('Spell admin master icon previews',()=>{
 it('shows real artwork when assigned, placeholder when missing, and edits the selected spell',()=>{
  const {api}=setup();
  const linked={id:key,name:'Finna vatten',icon_path:iconPath,icon_focus_x:73,icon_focus_y:29,icon_zoom:155};
  const html=api.adminIconHtml(linked);
  expect(html).toContain('data-spell-icon-path="'+iconPath+'"');
  expect(html).toContain('data-spell-icon-x="73"');
  expect(html).toContain('data-spell-icon-y="29"');
  expect(html).toContain('data-spell-icon-zoom="155"');
  expect(html).toContain("editRuleSpell('"+key+"')");
  const missing=api.adminIconHtml({...linked,name:'Saknad',icon_path:null});
  expect(missing).toContain('class="spell-master-icon-thumb is-empty"');
  expect(missing).not.toContain('data-spell-icon-path');
  expect(missing).toContain('Lägg till ikon för Saknad');
 });
 it('places the new preview column in every row and counts attached spell icons',()=>{
  const a=read('legacy/app.js');
  const start=a.indexOf('function renderAdminSpells(){');
  const end=a.indexOf('async function setRuleSpellPlaytested(',start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const html={innerHTML:''},status={textContent:''};
  const {api}=setup();
  const hydrated=vi.fn();
  const window={aleaSpellArt:{...api,hydrateAdminList:hydrated}};
  const linked={id:key,name:'Finna vatten',icon_path:iconPath,icon_focus_x:50,icon_focus_y:50,icon_zoom:120};
  const missing={id:'22222222-2222-4222-8222-222222222222',name:'Öppna',icon_path:null};
  runInNewContext(a.slice(start,end)+'\nrenderAdminSpells();',{
   $:id=>id==='adminSpellTable'?html:status,window,ruleSpellsLoaded:true,
   ruleSpells:[linked,missing],ruleMagicSchools:[],escAttr:v=>String(v??''),
   combatMagicBinding:()=>({supported:false,reason:'ej stödd'})
  });
  expect(status.textContent).toContain('1 med ikon · 1 utan ikon');
  expect(html.innerHTML).toContain('title="Besvärjelseikon">Ikon');
  expect(html.innerHTML).toContain('data-spell-icon-path="'+iconPath+'"');
  expect(html.innerHTML).toContain('Lägg till ikon för Öppna');
  expect((html.innerHTML.match(/spell-master-icon-cell/g)||[])).toHaveLength(2);
  expect(hydrated).toHaveBeenCalledWith(html);
 });
 it('loads only visible icons and uses the same crop geometry as game previews',async()=>{
  let callback,observer;
  class FakeObserver{
   constructor(cb){callback=cb;this.observed=[];this.unobserve=vi.fn();this.disconnect=vi.fn();observer=this}
   observe(el){this.observed.push(el)}
  }
  const img={naturalWidth:640,naturalHeight:640,complete:true,style:{},hidden:true};
  const symbol={hidden:false};
  const ready=vi.fn();
  const thumb={dataset:{spellIconPath:iconPath,spellIconX:'73',spellIconY:'29',spellIconZoom:'155'},
   isConnected:true,classList:{add:ready},getBoundingClientRect:()=>({width:48,height:48}),
   querySelector:q=>q==='img'?img:q==='.spell-master-icon-symbol'?symbol:null};
  const root={querySelectorAll:()=>[thumb]};
  const {api}=setup({IntersectionObserver:FakeObserver});
  api.hydrateAdminList(root);
  expect(observer.observed).toEqual([thumb]);
  expect(img.src).toBeUndefined();
  callback([{isIntersecting:true,target:thumb}],observer);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(img.src).toBe('./'+iconPath);
  expect(img.hidden).toBe(false);
  expect(Number.parseFloat(img.style.width)).toBeCloseTo(74.4,2);
  expect(img.style.left).toMatch(/^-/);
  expect(symbol.hidden).toBe(true);
  expect(ready).toHaveBeenCalledWith('icon-ready');
 });
 it('fits the new icon column on desktop/mobile without breaking table columns',()=>{
  const css=read('src/styles/app.css'),artCss=read('features/combat/spell-art.css');
  expect(css).toContain('grid-template-columns:64px 170px 130px 82px');
  expect(css).toContain('grid-template-columns:56px 160px 120px 76px');
  expect(artCss).toContain('spell-master-icon-thumb img[hidden]');
 });
});
