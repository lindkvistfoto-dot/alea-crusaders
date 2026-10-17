import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function createApi(){
 const win={addEventListener:vi.fn()};
 runInNewContext(read('features/combat/spell-art.js'),{
  window:win,document:{querySelectorAll:()=>[]},console
 });
 return win.aleaSpellArt;
}
function cryptexIcon(width=72,zoom=120,x=50,y=50){
 const img={naturalWidth:640,naturalHeight:640,hidden:false,style:{}};
 const view={
  offsetWidth:width,offsetHeight:width,clientWidth:width,clientHeight:width,
  classList:{contains:cls=>cls==='combat-carousel-spell-art'},
  getBoundingClientRect:()=>({width:width*.63,height:width*.63}),
  dataset:{focusX:String(x),focusY:String(y),zoom:String(zoom)},
  querySelector:selector=>selector==='img'?img:null
 };
 return {img,view};
}

describe('Cryptex carousel – ARCANE IVORY icons retain full size when shifting slots',()=>{
 it('uses untransformed slot width; perspective/scale never double-shrink a picture',()=>{
  const api=createApi();
  const {img,view}=cryptexIcon(160);
  api.positionImage(img,view,{x:50,y:50,zoom:120});
  // The artwork should be 120% of the *160px slot*, not 120% of 100.8px
  expect(Number.parseFloat(img.style.width)).toBeCloseTo(192,2);
  expect(Number.parseFloat(img.style.height)).toBeCloseTo(192,2);
  expect(Number.parseFloat(img.style.left)).toBeCloseTo(-16,2);
  expect(Number.parseFloat(img.style.top)).toBeCloseTo(-16,2);
 });
 it('refits an already-loaded 72px thumbnail after carousel measures its 160px centre',()=>{
  const api=createApi(),{img,view}=cryptexIcon(72,155,70,30);
  const root={querySelectorAll:selector=>selector==='.combat-carousel-spell-art'?[view]:[]};
  api.refreshCarouselCrops(root);
  expect(Number.parseFloat(img.style.width)).toBeCloseTo(111.6,2);
  view.offsetWidth=160;view.offsetHeight=160;
  api.refreshCarouselCrops(root);
  expect(Number.parseFloat(img.style.width)).toBeCloseTo(248,2);
  expect(Number.parseFloat(img.style.left)).toBeCloseTo(-61.6,2);
  expect(Number.parseFloat(img.style.top)).toBeCloseTo(-26.4,2);
 });
 it('ignores unloaded artwork, and leaves editor artwork sizing unchanged',()=>{
  const api=createApi();
  const unloaded=cryptexIcon();
  unloaded.img.naturalWidth=0;
  expect(()=>api.refreshCarouselCrops({querySelectorAll:()=>[unloaded.view]})).not.toThrow();
  expect(unloaded.img.style.width).toBeUndefined();
  const img={naturalWidth:640,naturalHeight:640,style:{}};
  const editor={
   classList:{contains:()=>false},offsetWidth:160,offsetHeight:160,
   getBoundingClientRect:()=>({width:100,height:100})
  };
  api.positionImage(img,editor,{x:50,y:50,zoom:120});
  expect(Number.parseFloat(img.style.width)).toBeCloseTo(120,2);
 });
 it('resizes the actual carousel tiles before refreshing their image crops',()=>{
  const carousel=read('features/combat/magic-carousel.js');
  const start=carousel.indexOf("track.style.setProperty('--combat-carousel-tile-width'");
  const resize=carousel.indexOf('refreshCarouselCrops?.(track)',start);
  expect(start).toBeGreaterThan(0);
  expect(resize).toBeGreaterThan(start);
  expect(resize).toBeLessThan(carousel.indexOf('measureNameplate()',start));
  expect(read('features/combat/spell-art.js')).toContain('hydrateCombat,positionImage,positionCutout,refreshCarouselCrops');
  expect(read('features/combat/arcane-cryptex.css')).toContain('aspect-ratio:1536/1024');
 });
});
