import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const source=read('features/combat/round-gallery.js');
describe('Shared round background gallery',()=>{
 it('provides admin image actions and private storage, not public links',()=>{
  expect(source).toContain('alea-round-backgrounds');
  expect(source).toContain('round_background_id');
  expect(source).toContain('Math.random()');
  expect(source).toContain('mapStorageFetch');
  expect(source).not.toContain('/object/public/');
 });
 it('randomly picks from only enabled, non-archived rows and returns a persistent id',async()=>{
  const rows=[
   {id:'a',image_path:'assets/combat/round-hero-battle-pilot.avif',is_active:true,archived_at:null},
   {id:'b',image_path:'round/12345678-1234-4234-8234-123456789abc.webp',is_active:true,archived_at:null},
   {id:'c',image_path:'assets/combat/round-hero-battle-pilot.avif',is_active:false,archived_at:null},
   {id:'d',image_path:'assets/combat/round-hero-battle-pilot.avif',is_active:true,archived_at:'2026-10-12'}
  ];
  const window={};
  const ctx={window,console,Math:Object.assign(Object.create(Math),{random:()=>.999}),dbJson:async()=>rows,
   document:{querySelectorAll:()=>[]}};
  runInNewContext(source,ctx);
  expect(await window.aleaRoundGallery.pickRandomForCombat()).toBe('b');
  expect(await window.aleaRoundGallery.pickRandomForCombat()).toBe('b');
 });
 it('uses saved combat selection and builtin fallback without rerandomizing',async()=>{
  const window={};
  const panel={style:{setProperty:vi.fn(),removeProperty:vi.fn()}};
  const ctx={window,console,Math,dbJson:async()=>[
    {id:'a',image_path:'assets/combat/round-hero-battle-pilot.avif',is_active:true,archived_at:null}],
   document:{querySelectorAll:()=>[panel]}};
  runInNewContext(source,ctx);
  await window.aleaRoundGallery.activate({id:'combat-1',settings:{round_background_id:'a'}});
  expect(panel.style.setProperty).toHaveBeenCalledWith('--alea-round-illustration',expect.stringContaining('round-hero-battle-pilot.avif'));
  await window.aleaRoundGallery.activate({id:'combat-1',settings:{round_background_id:'not-found'}});
  expect(panel.style.setProperty).toHaveBeenCalledTimes(2);
 });
 it('uses the active actor and avoids stale image updates on turn change',async()=>{
  const panel={style:{setProperty:vi.fn(),removeProperty:vi.fn()}};
  let completedRead;
  const waiting=new Promise(resolve=>completedRead=resolve);
  const window={aleaCharacterRoundBackground:{resolveUrl:async()=>waiting}};
  const ctx={window,console,Math,document:{querySelectorAll:()=>[panel]}};
  runInNewContext(source,ctx);
  const battle={id:'combat-1',settings:{}};
  const first=window.aleaRoundGallery.activate(battle,{id:'actor-a',state:{round_background_source:'character',round_background_path:'round/custom.webp'}});
  await window.aleaRoundGallery.activate(battle,{id:'actor-b',state:{round_background_source:'library',round_background_path:'assets/combat/round-hero-battle-pilot.avif'}});
  completedRead('blob:outdated-image');
  await first;
  expect(panel.style.setProperty).toHaveBeenLastCalledWith('--alea-round-illustration',expect.stringContaining('round-hero-battle-pilot.avif'));
  expect(panel.style.setProperty).not.toHaveBeenCalledWith('--alea-round-illustration',expect.stringContaining('outdated-image'));
 });
 it('keeps admin UI, background rendering and CSS hooked to existing app',()=>{
  const legacy=read('legacy/app.js'),runtime=read('features/combat/runtime.js'),css=read('features/combat/round-gallery.css'),html=read('index.html');
  expect(legacy).toContain("specialImages:['Specialbilder'");
  expect(legacy).toContain("activeAdminSection==='specialImages'");
  expect(runtime).toContain("round_background_id:roundBackgroundId");
  expect(runtime).toContain('await window.aleaRoundGallery?.activate?.(activeCombat,combatActiveActor())');
  expect(runtime).toContain('void window.aleaRoundGallery?.activate?.(activeCombat,combatActiveActor())');
  expect(css).toContain('var(--alea-round-illustration');
  expect(html).toContain('data-admin-section="specialImages"');
  expect(html).toContain('features/combat/round-gallery.js?v=0.35.132');
 });
});
