import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const gallery=read('features/combat/round-gallery.js');
const css=read('features/combat/round-gallery.css');
const runtime=read('features/combat/runtime.js');

function fixture(){
 const style={setProperty:vi.fn(),removeProperty:vi.fn()};
 const actor={id:'combat-char',source_type:'character',source_id:'db-char',state:{
  round_background_source:'library',
  round_background_path:'assets/combat/round-hero-battle-pilot.avif',
  round_background_focus:{x:56,y:29}
 }};
 const character={_dbId:'db-char',roundBackgroundFocus:{x:34,y:66}};
 const window={matchMedia:()=>({matches:true})};
 const ctx={
  window,console,Math,chars:[character],
  document:{querySelectorAll:selector=>selector==='.combat-turn-panel'?[{style}]:[]}
 };
 runInNewContext(gallery,ctx);
 return {actor,character,style,window};
}
describe('Justera utsnittet i Runda',()=>{
 it('använder rollpersonens sparade fokus i stridsvyn',async()=>{
  const {actor,style,window}=fixture();
  await window.aleaRoundGallery.activate({id:'battle',settings:{}},actor);
  expect(style.setProperty).toHaveBeenCalledWith('--alea-round-focus-x','34%');
  expect(style.setProperty).toHaveBeenCalledWith('--alea-round-focus-y','66%');
 });
 it('faller tillbaka på kombatantens stridssparade fokus när rollperson saknas',async()=>{
  const {actor,style,window}=fixture();
  actor.source_type='npc';
  await window.aleaRoundGallery.activate({id:'battle',settings:{}},actor);
  expect(style.setProperty).toHaveBeenCalledWith('--alea-round-focus-x','56%');
  expect(style.setProperty).toHaveBeenCalledWith('--alea-round-focus-y','29%');
 });
 it('rensar gammal placering vid kombatantbyte',async()=>{
  const {actor,style,window}=fixture();
  const combat={id:'battle',settings:{}};
  await window.aleaRoundGallery.activate(combat,actor);
  await window.aleaRoundGallery.activate(combat,{id:'new',source_type:'npc',state:{
   round_background_source:'library',
   round_background_path:'assets/combat/round-hero-battle-pilot.avif'
  }});
  expect(style.removeProperty).toHaveBeenCalledWith('--alea-round-focus-x');
  expect(style.removeProperty).toHaveBeenCalledWith('--alea-round-focus-y');
 });
 it('begränsar felaktiga fokusvärden till bildens 0–100 procent',async()=>{
  const {actor,character,style,window}=fixture();
  character.roundBackgroundFocus={x:250,y:-41};
  await window.aleaRoundGallery.activate({id:'battle'},actor);
  expect(style.setProperty).toHaveBeenCalledWith('--alea-round-focus-x','100%');
  expect(style.setProperty).toHaveBeenCalledWith('--alea-round-focus-y','0%');
 });
 it('har samma utsnitt i mobil och desktop när fokus sparats',()=>{
  expect(css).toContain('object-position:var(--alea-round-focus-x,100%) var(--alea-round-focus-y,24%)');
  expect(css).toContain('object-position:var(--alea-round-focus-x,75%) var(--alea-round-focus-y,18%)');
  expect(css).toContain('touch-action:none');
  expect(css).toContain('aspect-ratio');
 });
 it('kan dras, sparas, återställas och avbrytas utan att ändra bildfilen',()=>{
  expect(gallery).toContain("stage.addEventListener('pointermove'");
  expect(gallery).toContain("stage.addEventListener('pointerdown'");
  expect(gallery).toContain('writeFocusPreview(null)');
  expect(gallery).toContain('closeFocusEditor()');
  expect(gallery).toContain('roundBackgroundFocus=focus');
  expect(gallery).toContain('syncCharacterToCentral(character)');
  expect(gallery).toContain('updated.round_background_focus=focus');
  expect(gallery).toContain("dbJson('combatants?id=eq.'");
  expect(runtime).toContain('class="combat-round-adjust-button"');
  expect(runtime).toContain('round_background_focus:stats.round_background_focus||null');
 });
});
