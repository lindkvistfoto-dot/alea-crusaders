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
  expect(html).toContain('loading="eager"');
  expect(html).not.toContain('loading="lazy"');
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
 it('loads both repository and Storage icons without any IntersectionObserver event',async()=>{
  class BrokenObserver{constructor(){throw Error('IntersectionObserver must not be needed')}}
  const makeThumb=(path,x='73',y='29',z='155')=>{
   const img={naturalWidth:640,naturalHeight:640,complete:true,style:{},hidden:true};
   const symbol={hidden:false},ready=vi.fn();
   const thumb={dataset:{spellIconPath:path,spellIconX:x,spellIconY:y,spellIconZoom:z},
    isConnected:true,classList:{add:ready},
    getBoundingClientRect:()=>({width:48,height:48}),
    querySelector:q=>q==='img'?img:q==='.spell-master-icon-symbol'?symbol:null};
   return {img,symbol,ready,thumb};
  };
  const repo=makeThumb(iconPath),storage=makeThumb('spell/78c31001-110d-4876-99c2-98281885e8a0/16e618dc-8645-427a-bce9-238397110634.webp');
  const mapStorageFetch=vi.fn(async()=>({ok:true,blob:async()=>({size:128,type:'image/webp'})}));
  const {api}=setup({IntersectionObserver:BrokenObserver,mapStorageFetch,URL:{createObjectURL:()=> 'blob:loaded-icon'}});
  api.hydrateAdminList({querySelectorAll:()=>[repo.thumb,storage.thumb]});
  for(let i=0;i<10;i++)await Promise.resolve();
  expect(repo.img.src).toBe('./'+iconPath);
  expect(storage.img.src).toBe('blob:loaded-icon');
  expect(mapStorageFetch).toHaveBeenCalledTimes(1);
  expect(repo.img.hidden).toBe(false);
  expect(storage.img.hidden).toBe(false);
  expect(Number.parseFloat(repo.img.style.width)).toBeCloseTo(74.4,2);
  expect(repo.img.style.left).toMatch(/^-/);
  expect(repo.symbol.hidden).toBe(true);
  expect(storage.symbol.hidden).toBe(true);
  expect(repo.ready).toHaveBeenCalledWith('icon-ready');
  expect(storage.ready).toHaveBeenCalledWith('icon-ready');
 });
 it('loads initially hidden browser-lazy images on a fresh page, without saving a crop',async()=>{
  const make=(path)=>{
   const img={naturalWidth:0,naturalHeight:0,complete:false,hidden:true,style:{},loading:'lazy',onload:null,
    set src(url){
     this._src=url;
     // Simulate browsers deferring hidden loading=lazy images indefinitely.
     if(this.loading==='eager'){
      this.naturalWidth=640;this.naturalHeight=640;this.complete=true;this.onload?.();
     }
    },
    get src(){return this._src}
   };
   const symbol={hidden:false};
   const thumb={dataset:{spellIconPath:path,spellIconX:'50',spellIconY:'50',spellIconZoom:'120'},
    isConnected:true,classList:{add:vi.fn()},
    getBoundingClientRect:()=>({width:48,height:48}),
    querySelector:q=>q==='img'?img:q==='.spell-master-icon-symbol'?symbol:null};
   return {img,symbol,thumb};
  };
  const repo=make(iconPath);
  const storage=make('spell/78c31001-110d-4876-99c2-98281885e8a0/16e618dc-8645-427a-bce9-238397110634.webp');
  const mapStorageFetch=vi.fn(async()=>({ok:true,blob:async()=>({size:256,type:'image/webp'})}));
  const {api}=setup({mapStorageFetch,URL:{createObjectURL:()=> 'blob:first-page-load'}});
  api.hydrateAdminList({querySelectorAll:()=>[repo.thumb,storage.thumb]});
  for(let i=0;i<12;i++)await Promise.resolve();
  expect(repo.img.loading).toBe('eager');
  expect(storage.img.loading).toBe('eager');
  expect(repo.img.src).toBe('./'+iconPath);
  expect(storage.img.src).toBe('blob:first-page-load');
  expect(repo.img.hidden).toBe(false);
  expect(storage.img.hidden).toBe(false);
  expect(repo.symbol.hidden).toBe(true);
  expect(storage.symbol.hidden).toBe(true);
  expect(mapStorageFetch).toHaveBeenCalledTimes(1);
 });
 it('prepares the icon crop while the admin tab is hidden on mobile',async()=>{
  const img={naturalWidth:640,naturalHeight:640,complete:true,style:{},hidden:true};
  const symbol={hidden:false};
  const thumb={dataset:{spellIconPath:iconPath,spellIconX:'50',spellIconY:'50',spellIconZoom:'155'},
   isConnected:true,classList:{add:vi.fn()},
   getBoundingClientRect:()=>({width:0,height:0}),
   querySelector:q=>q==='img'?img:q==='.spell-master-icon-symbol'?symbol:null};
  const {api,ctx}=setup();
  ctx.window.matchMedia=()=>({matches:true});
  api.hydrateAdminList({querySelectorAll:()=>[thumb]});
  for(let i=0;i<5;i++)await Promise.resolve();
  expect(img.src).toBe('./'+iconPath);
  expect(Number.parseFloat(img.style.width)).toBeCloseTo(65.1,2);
  expect(symbol.hidden).toBe(true);
 });
 it('fits the new icon column on desktop/mobile without breaking table columns',()=>{
  const css=read('src/styles/app.css'),artCss=read('features/combat/spell-art.css');
  expect(css).toContain('grid-template-columns:64px 170px 130px 82px');
  expect(css).toContain('grid-template-columns:56px 160px 120px 76px');
  expect(artCss).toContain('spell-master-icon-thumb img[hidden]');
 });
});
