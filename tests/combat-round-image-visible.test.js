import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
describe('Visible round panel artwork on mobile',()=>{
 it('uses a real image element in both active and empty panels',()=>{
  const runtime=load('features/combat/runtime.js');
  expect(runtime).toContain("const combatRoundArtLayer='<span class=\"combat-round-artwork\"");
  expect(runtime.match(/combatOrnateFrameCorners\+combatRoundArtLayer\+head\+/g)).toHaveLength(2);
  expect(runtime).toContain('onerror=\"window.aleaRoundGallery?.fallbackImage?.(this)\"');
 });
 it('image layer is unobstructed and never captures taps',()=>{
  const css=load('features/combat/round-gallery.css');
  expect(css).toContain('.combat-turn-panel::after{display:none!important}');
  expect(css).toContain('.combat-turn-panel > .combat-round-artwork');
  expect(css).toContain('z-index:0!important');
  expect(css).toContain('pointer-events:none');
  expect(css).toContain('background:transparent!important');
  expect(css).toContain('object-fit:cover');
  expect(css).toContain('mask-image:linear-gradient');
 });
 it('updates actual image element when actor changes, not just the CSS variable',async()=>{
  const source=load('features/combat/round-gallery.js');
  let src='./assets/combat/round-hero-battle-pilot.avif';
  const image={hidden:false,getAttribute:()=>src,setAttribute:vi.fn((k,v)=>{if(k==='src')src=v})};
  const panel={querySelector:()=>image,style:{setProperty:vi.fn(),removeProperty:vi.fn()}};
  const window={aleaCharacterRoundBackground:{resolveUrl:async()=> 'blob:lyra'}};
  const ctx={window,console,Math,document:{querySelectorAll:()=>[panel]}};
  runInNewContext(source,ctx);
  await window.aleaRoundGallery.activate({id:'combat1',settings:{}},{id:'a',state:{round_background_source:'character',round_background_path:'campaign/character/pic.webp'}});
  expect(src).toBe('blob:lyra');
  await window.aleaRoundGallery.activate({id:'combat1',settings:{}},{id:'b',state:{round_background_source:'library',round_background_path:'assets/combat/round-hero-battle-pilot.avif'}});
  expect(src).toContain('round-hero-battle-pilot.avif');
  expect(panel.style.setProperty).toHaveBeenCalled();
 });
 it('falls back when an image URL fails to load without endless retries',()=>{
  const source=load('features/combat/round-gallery.js');
  const window={};runInNewContext(source,{window,console,Math,document:{querySelectorAll:()=>[]}});
  let src='blob:broken';
  const image={isConnected:true,hidden:false,getAttribute:()=>src,setAttribute:(k,v)=>{src=v}};
  window.aleaRoundGallery.fallbackImage(image);
  expect(src).toContain('round-hero-battle-pilot.avif');
  window.aleaRoundGallery.fallbackImage(image);
  expect(image.hidden).toBe(true);
 });
});
