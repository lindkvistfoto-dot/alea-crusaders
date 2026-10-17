import {describe,it,expect} from 'vitest';
import {createArcaneGallery} from '../features/material/arcane-gallery.js';

const campaign='846e8089-24da-4825-af34-32903117152a';
const alternative='cc6b82ea-040e-4b15-9a84-f38311199999';
const rows=[1,2].map(n=>({
 id:'123e4567-e89b-42d3-a456-42661417400'+n,campaign_id:campaign,
 title:'Bild '+n,asset_kind:'image',category:'location',
 storage_bucket:'campaign-materials',storage_path:campaign+'/picture'+n+'.webp'
}));
function node(){
 const set=new Set(),children=[];
 return {children,dataset:{},style:{},innerHTML:'',src:'',complete:true,
  naturalWidth:800,naturalHeight:600,clientWidth:390,clientHeight:350,
  classList:{add:k=>set.add(k),remove:k=>set.delete(k),
   contains:k=>set.has(k),toggle:(k,on)=>on?set.add(k):set.delete(k)},
  setAttribute(){},removeAttribute(k){if(k==='src')this.src='';},
  addEventListener(){},replaceChildren(){},scrollTo(){},
  querySelector(){return null},querySelectorAll(){return []},
  contains:v=>children.includes(v),append:v=>children.push(v),
  remove(){this.removed=true;}};
}
function harness({gm=false}={}){
 const session={logged:true,gm,campaign};
 const elements=Object.fromEntries(['arcaneGalleryCount','arcaneGalleryEmpty',
  'arcaneGalleryStrip','arcaneGalleryStatus','arcaneGalleryImage',
  'arcaneGalleryPicture','arcaneGalleryPrev','arcaneGalleryNext'
 ].map(k=>[k,node()]));
 const styleProps=[];
 const machine=node();
 machine.getBoundingClientRect=()=>({width:390});
 machine.style={setProperty:(k,v)=>styleProps.push([k,v]),removeProperty:()=>{}};
 const root=node();
 root.classList.add('arcane-gallery-kit'); // Match classList to the real root element.
 root.querySelector=k=>k==='.arcane-gallery-machine'?machine:
  k.startsWith('#')?elements[k.slice(1)]||null:null;
 const left=node(),right=node(),seal=node(),energy=node();
 const parts={'.goose-player-door--left':left,'.goose-player-door--right':right,
  '.goose-player-seal':seal,'.goose-player-energy':energy};
 for(const piece of [left,right,seal])piece.querySelector=()=>node();
 const scenes=[];
 const doc={getElementById:id=>elements[id]||null,createElement:tag=>{
  if(tag==='section')return root;
  if(tag==='div'){
   const scene=node();
   scene.querySelector=k=>parts[k]||null;
   scenes.push(scene);return scene;
  }
  return node();
 }};
 const revoked=[],reads=[],requestPaths=[];
 let next=0;
 const win={innerHeight:820,URL:{
  createObjectURL:()=>('blob:goose-'+(++next)),
  revokeObjectURL:url=>revoked.push(url)
 },addEventListener(){}};
 const history=[{revision:2,material_id:rows[1].id},{revision:1,material_id:rows[0].id}];
 const materials=[...rows];
 const gallery=createArcaneGallery({
  legolas:{readMedia:async(row,thumb)=>{reads.push({row,thumb});return new Blob(['secret']);},
   previewMaterial(){}},
  request:async path=>{requestPaths.push(path);
   return path.startsWith('campaign_material_presentation_history?')?history:materials;},
  getCampaign:()=>session.campaign,isLoggedIn:()=>session.logged,
  isGM:()=>session.gm,doc:()=>doc,win:()=>win
 });
 return {gallery,session,elements,styleProps,scenes,parts,history,materials,revoked,reads,requestPaths};
}
// Four mechanical locks add detent awaits; flush the entire synthetic animation cycle.
async function settle(){for(let n=0;n<240;n++)await Promise.resolve();}
describe('GOOSE 04B player-only integration',()=>{
 it('mounts the three real HERMES WebPs and opens once at 4:3 before morphing',async()=>{
  const h=harness();h.gallery.mount();h.gallery.sync(rows[0],1);
  await settle();
  expect(h.scenes).toHaveLength(1);
  expect(h.scenes[0].classList.contains('goose-player-shutter--open')).toBe(true);
  expect(h.parts['.goose-player-door--left'].style.transform).toBe('translateX(-110%)');
  const heightWrites=h.styleProps.filter(x=>x[0]==='--arcane-frame-height').map(x=>x[1]);
  expect(heightWrites).toContain('326px'); // 4:3 first
  expect(heightWrites.at(-1)).toBe('326px');
  expect(h.scenes[0].querySelector('.goose-player-seal')).toBe(h.parts['.goose-player-seal']);
  expect(h.gallery.root.innerHTML).toContain('arcane-gallery-picture');
  expect(h.gallery.state.selected).toBe(rows[0].id);
  expect(h.reads.some(x=>x.row.id===rows[0].id&&!x.thumb)).toBe(true);
 });
 it('keeps the gate open on image navigation while preserving the current image ratio',async()=>{
  const h=harness();h.gallery.mount();h.gallery.sync(rows[0],1);
  await settle();expect(h.gallery.step(1)).toBe(true);
  h.elements.arcaneGalleryImage.naturalWidth=1080;
  h.elements.arcaneGalleryImage.naturalHeight=1920;
  await settle();
  expect(h.scenes).toHaveLength(1);
  expect(h.scenes[0].classList.contains('goose-player-shutter--open')).toBe(true);
  const heights=h.styleProps.filter(x=>x[0]==='--arcane-frame-height').map(x=>x[1]);
  expect(heights.at(-1)).toBe('638px');
  expect(h.revoked).toContain('blob:goose-1');
 });
 it('immediately revokes private blob and destroys moving artwork on campaign change',async()=>{
  const h=harness();h.gallery.mount();h.gallery.sync(rows[0],1);
  await settle();
  h.session.campaign=alternative;
  h.gallery.clear();
  expect(h.revoked).toContain('blob:goose-1');
  expect(h.elements.arcaneGalleryImage.src).toBe('');
  expect(h.scenes[0].removed).toBe(true);
  expect(h.gallery.root.classList.contains('hidden')).toBe(true);
  expect(h.gallery.state.rows).toHaveLength(0);
 });
 it('uses the very same GOOSE and authenticated history for the GM',async()=>{
  const h=harness({gm:true});h.gallery.mount();h.gallery.sync(rows[0],1);
  await settle();
  expect(h.scenes).toHaveLength(1);
  expect(h.gallery.state.role).toBe('gm');
  expect(h.scenes[0].classList.contains('goose-player-shutter--open')).toBe(true);
  expect(h.reads.some(x=>x.row.id===rows[0].id&&!x.thumb)).toBe(true);
  expect(h.requestPaths.some(x=>x.startsWith('campaign_material_presentation_history?'))).toBe(true);
  expect(h.requestPaths.every(x=>!x.startsWith('rpc/'))).toBe(true);
 });
 it('manually closes and reopens the GM gate without changing the presentation',async()=>{
  const h=harness({gm:true});h.gallery.mount();h.gallery.sync(rows[0],1);
  await settle();
  expect(h.scenes[0].classList.contains('goose-player-shutter--open')).toBe(true);
  const before=h.gallery.state.selected,readCount=h.reads.length,requestCount=h.requestPaths.length;
  const firstUrl=h.gallery.state.original;
  h.elements.arcaneGalleryImage.naturalWidth=1080;
  h.elements.arcaneGalleryImage.naturalHeight=1920;
  expect(await h.gallery.testShutter('close')).toBe(true);
  expect(await h.gallery.testShutter('close')).toBe(true);
  expect(h.parts['.goose-player-door--left'].style.transform).toBe('translateX(0%)');
  expect(h.parts['.goose-player-seal'].style.opacity).toBe('1');
  expect(h.styleProps.filter(x=>x[0]==='--arcane-frame-height').at(-1)[1]).toBe('326px');
  expect(await h.gallery.testShutter('open')).toBe(true);
  expect(h.parts['.goose-player-door--left'].style.transform).toBe('translateX(-110%)');
  expect(h.parts['.goose-player-seal'].style.opacity).toBe('0');
  expect(h.styleProps.filter(x=>x[0]==='--arcane-frame-height').at(-1)[1]).toBe('638px');
  expect(h.gallery.state.selected).toBe(before);
  expect(h.gallery.state.original).toBe(firstUrl);
  expect(h.reads.length).toBe(readCount);
  expect(h.requestPaths.length).toBe(requestCount);
 });
 it('rejects manual shutter commands for players',async()=>{
  const h=harness();h.gallery.mount();h.gallery.sync(rows[0],1);
  await settle();
  expect(await h.gallery.testShutter('close')).toBe(false);
  expect(h.scenes[0].classList.contains('goose-player-shutter--open')).toBe(true);
 });
 it('resets the shutter when previously shared private images are revoked',async()=>{
  const h=harness();h.gallery.mount();h.gallery.sync(rows[0],1);
  await settle();h.history.splice(0);h.materials.splice(0);
  await h.gallery.refresh();await settle();
  expect(h.gallery.state.selected).toBe('');
  expect(h.parts['.goose-player-seal'].style.opacity).toBe('1');
  expect(h.parts['.goose-player-door--left'].style.transform).toBe('translateX(0%)');
  expect(h.revoked).toContain('blob:goose-1');
 });
});
