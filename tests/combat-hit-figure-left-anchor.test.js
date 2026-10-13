import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('features/combat/hit-figures.js');
const css=read('features/combat/hit-figures.css');
const start=js.indexOf(' function hitFigureVisibleBounds(');
const end=js.indexOf(' async function list(',start);
if(start<0||end<start)throw Error('Hit-image framing helpers missing');
function helpers(context={}){
 const scope={console,...context};
 runInNewContext(js.slice(start,end)+
  '\nthis.bounds=hitFigureVisibleBounds;this.camera=hitFigureLeftAnchoredCamera;this.apply=hitFigureFrameLoadedImage;',scope);
 return scope;
}
describe('Combat hit portrait: keep left body visible and fill right border',()=>{
 it('preserves the silhouette left edge while allowing cropping only on the right',()=>{
  const {camera}=helpers();
  for(const [left,right,baseScale] of [[.2,.84,2.05],[.18,.71,1.9],[0,.7,1.55]]){
   const frame=camera({left,right},baseScale);
   const shownLeft=left*frame.scale+frame.translateX/100;
   const shownRight=right*frame.scale+frame.translateX/100;
   expect(shownLeft).toBeCloseTo(.007,6);
   expect(shownRight).toBeGreaterThanOrEqual(1.009);
   expect(frame.scale).toBeGreaterThanOrEqual(baseScale);
  }
 });
 it('zooms up when the visible figure is too narrow and ignores invalid bounds',()=>{
  const {camera}=helpers();
  const narrow=camera({left:.25,right:.6},1.4);
  expect(narrow.scale).toBeGreaterThan(2.8);
  expect(narrow.translateX).toBeLessThan(0);
  expect(camera(null,2)).toBeNull();
  expect(camera({left:.5,right:.3},2)).toBeNull();
 });
 it('detects alpha silhouette instead of treating transparent canvas as body',()=>{
  const width=128,height=192,rgba=new Uint8ClampedArray(width*height*4);
  for(let y=25;y<175;y++)for(let x=20;x<=109;x++)rgba[(y*width+x)*4+3]=200;
  const scope=helpers({document:{createElement:()=>({
   width:0,height:0,getContext:()=>({
    drawImage:()=>{},getImageData:()=>({data:rgba})
   })
  })}});
  const result=scope.bounds({naturalWidth:1024,naturalHeight:1536});
  expect(result.left).toBeCloseTo(20/128);
  expect(result.right).toBeCloseTo(110/128);
 });
 it('applies only the transparent image crop and keeps the legacy zone overlay untouched',()=>{
  const calls=[];
  const scope=helpers({document:{createElement:()=>({
   width:0,height:0,getContext:()=>({
    drawImage:()=>{},getImageData:()=>({
     data:new Uint8ClampedArray(128*192*4).fill(200)
    })
   })
  })}});
  const img={naturalWidth:1024,naturalHeight:1536,parentElement:{style:{getPropertyValue:()=> '2.05'}},
   style:{setProperty:(name,value)=>calls.push([name,value])}};
  scope.apply(img);
  expect(calls.map(([name])=>name)).toEqual(['--hit-scale','--hit-tx']);
  expect(css).toContain('padding-right:0');
  expect(css).toContain('overflow:hidden');
  expect(css).toContain('.combat-hit-image-switch{');
  expect(css).toContain('width:100%');
  expect(read('src/main.js')).toContain("return '<div class=\"combat-hit-image-switch\"");
  expect(js).toContain('hitFigureFrameLoadedImage(img)');
 });
});
