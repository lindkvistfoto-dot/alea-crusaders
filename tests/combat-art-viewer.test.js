import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function makeFrame(){
 const values={
  '.combat-art-viewer-image':{
   hidden:true,isConnected:true,complete:true,naturalWidth:1024,
   src:'',removeAttribute(key){if(key==='src')this.src=''}
  },
  '.combat-art-viewer-empty':{textContent:'',hidden:false},
  '.combat-art-viewer-title':{textContent:''},
  '.combat-art-viewer-type':{textContent:''},
  '.combat-art-viewer-clear':{hidden:true}
 };
 const section={querySelector:selector=>values[selector]};
 return {section,values};
}
function createApi(frame=null,resolver=async path=>'./'+path){
 const window={aleaSpellArt:{
  validPath:path=>/^assets\/spells\/arcane-ivory\/[a-z0-9-]+\.webp$/.test(String(path)),
  resolveUrl:vi.fn(resolver)
 }};
 const document={getElementById:id=>id==='combatArtViewer'?frame?.section:null};
 runInNewContext(read('features/combat/art-viewer.js'),{window,document,Promise});
 return {api:window.aleaCombatArtViewer,window};
}
describe('Desktop Combat Art Gallery – future-proof local display slot',()=>{
 it('mounts below initiative, never alters participant controls, and is hidden on mobile',()=>{
  const runtime=read('features/combat/runtime.js');
  const start=runtime.indexOf('function renderCombat(){');
  const renderer=runtime.slice(start);
  const participants=renderer.indexOf('<aside class="combat-panel combat-participants"><h3>Turordning</h3>');
  const list=renderer.indexOf("'+participantHtml+'</div>'",participants);
  const viewer=renderer.indexOf('window.aleaCombatArtViewer?.html?.(activeCombat.id)',participants);
  const end=renderer.indexOf("+'</aside>'",participants);
  expect(participants).toBeGreaterThan(0);
  expect(viewer).toBeGreaterThan(list);
  expect(viewer).toBeLessThan(end);
  expect(renderer).toContain('window.aleaCombatArtViewer?.render?.()');
  const css=read('features/combat/art-viewer.css');
  expect(css).toContain('@media(min-width:1024px)');
  expect(css).toContain('@media(max-width:1023px)');
  expect(css).toContain('.combat-art-viewer{display:none!important}');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('aspect-ratio:1/1');
 });
 it('provides a general reusable, safe viewer state without persisting battle images',()=>{
  const {api}=createApi();
  expect(api.html('fight-one')).toContain('Klicka på en besvärjelse');
  expect(api.html('fight-one')).toContain('class="combat-art-viewer"');
  expect(api.show({title:'Eld (F)',path:'assets/spells/arcane-ivory/eld.webp',source:'spell',battleId:'fight-one'})).toBe(true);
  expect(api.current.title).toBe('Eld (F)');
  api.html('fight-two');
  expect(api.current).toBeNull();
  expect(api.show({title:'No battle'})).toBe(false);
  expect(read('features/combat/art-viewer.js')).not.toContain('dbJson');
  expect(read('features/combat/art-viewer.js')).not.toContain('localStorage');
 });
 it('enlarges an actual ARCANE IVORY icon with the approved image resolver',async()=>{
  const frame=makeFrame();
  const resolver=vi.fn(async ()=>'./assets/spells/arcane-ivory/eld.webp');
  const {api,window}=createApi(frame,resolver);
  api.show({title:'Eld',path:'assets/spells/arcane-ivory/eld.webp',battleId:'1',source:'spell'});
  for(let i=0;i<5;i++)await Promise.resolve();
  expect(resolver).toHaveBeenCalledWith('assets/spells/arcane-ivory/eld.webp');
  expect(frame.values['.combat-art-viewer-image'].src).toBe('./assets/spells/arcane-ivory/eld.webp');
  expect(frame.values['.combat-art-viewer-image'].hidden).toBe(false);
  expect(frame.values['.combat-art-viewer-empty'].hidden).toBe(true);
  expect(frame.values['.combat-art-viewer-title'].textContent).toBe('Eld');
  expect(frame.values['.combat-art-viewer-type'].textContent).toBe('BESVÄRJELSE');
  api.clear();
  expect(frame.values['.combat-art-viewer-image'].hidden).toBe(true);
  expect(window.aleaSpellArt.resolveUrl).toHaveBeenCalledTimes(1);
 });
 it('never loads an unknown image path; shows a readable missing-art placeholder',async()=>{
  const frame=makeFrame();
  const {api,window}=createApi(frame);
  api.show({title:'Saknad',path:'invalid/secret.webp',battleId:'1'});
  await Promise.resolve();
  expect(window.aleaSpellArt.resolveUrl).not.toHaveBeenCalled();
  expect(frame.values['.combat-art-viewer-empty'].textContent).toContain('kan inte öppnas');
  api.show({title:'Ingen koppling',path:'',battleId:'1'});
  expect(frame.values['.combat-art-viewer-empty'].textContent).toContain('Ingen bild är kopplad');
 });
 it('connects the cryptex click before the existing Expert selection without changing it',()=>{
  const carousel=read('features/combat/magic-carousel.js');
  const start=carousel.indexOf('function combatPreviewSpellIcon(');
  const end=carousel.indexOf('function combatSpellCarouselHtml(',start);
  expect(start).toBeGreaterThan(0);
  const seen=[];
  const ctx={
   window:{matchMedia:()=>({matches:true}),aleaCombatArtViewer:{show:payload=>{seen.push(payload);return true}}},
   activeCombat:{id:'battle-1'},combatants:[{id:'caster'}],
   combatActiveActor:()=>({id:'caster'}),
   combatSpellOptions:()=>[{name:'Animera död',rule_id:'dead',icon_path:'assets/spells/arcane-ivory/eld.webp'}],
   combatSpellKey:row=>row.rule_id,
   combatSpellArtPath:value=>value,
   combatMagicCarouselTags:row=>({name:row.name})
  };
  runInNewContext(carousel.slice(start,end)+'\nthis.preview=combatPreviewSpellIcon;',ctx);
  expect(ctx.preview('caster','dead')).toBe(true);
  expect(seen[0].title).toBe('Animera död');
  expect(seen[0].source).toBe('spell');
  expect(seen[0].battleId).toBe('battle-1');
  ctx.window.matchMedia=()=>({matches:false});
  expect(ctx.preview('caster','dead')).toBe(false);
  expect(seen).toHaveLength(1);
  expect(carousel).toContain("combatPreviewSpellIcon(\\''+escAttr(actorId)");
  expect(carousel).toContain("selectCombatPreparedSpell(\\''+escAttr(actorId)");
  expect(read('index.html')).toMatch(/combat\/art-viewer\.js\?v=0\.35\.\d+/);
  expect(read('index.html')).toMatch(/combat\/art-viewer\.css\?v=0\.35\.\d+/);
 });
});
