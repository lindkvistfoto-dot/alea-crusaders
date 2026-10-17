import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const js=read('features/combat/art-viewer.js'),css=read('features/combat/art-viewer.css'),runtime=read('features/combat/runtime.js');
function apiFor(){
 const fields={
  '.combat-art-viewer-image':{hidden:true,isConnected:true,complete:true,naturalWidth:960,src:'',removeAttribute(){this.src=''}},
  '.combat-art-viewer-empty':{hidden:false,textContent:''},
  '.combat-art-viewer-title':{textContent:''},
  '.combat-art-viewer-type':{textContent:''},
  '.combat-art-viewer-clear':{hidden:true}
 };
 const frame={classList:{toggle(){}},querySelector:key=>fields[key]};
 const window={aleaSpellArt:{validPath:()=>false,resolveUrl:()=>{throw Error('should not call spell resolver')}}};
 const document={getElementById:key=>key==='combatArtViewer'?frame:null};
 runInNewContext(js,{window,document,Promise,URL});
 return {api:window.aleaCombatArtViewer,fields};
}
describe('Combat Arcane Gallery compact multi-source preview',()=>{
 it('retains a single desktop-only gallery below Turordning',()=>{
  expect(runtime).toContain('window.aleaCombatArtViewer?.html?.(activeCombat.id)');
  expect(runtime).toContain('window.aleaCombatArtViewer?.bind?.(body)');
  expect(css).toContain('@media(max-width:1023px)');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('.combat-art-viewer-photo .combat-art-viewer-image{object-fit:cover}');
 });
 it('shows equipment art using existing image URL without spell resolver',async()=>{
  const {api,fields}=apiFor();
  api.show({battleId:'battle-1',source:'equipment',src:'https://example.com/weapon.webp',title:'Långsvärd'});
  for(let i=0;i<4;i++)await Promise.resolve();
  expect(fields['.combat-art-viewer-image'].src).toBe('https://example.com/weapon.webp');
  expect(fields['.combat-art-viewer-type'].textContent).toBe('UTRUSTNING');
  expect(fields['.combat-art-viewer-title'].textContent).toBe('Långsvärd');
 });
 it('handles combatant source separately and respects battle isolation',async()=>{
  const {api,fields}=apiFor();
  api.show({battleId:'a',source:'combatant',src:'blob:https://example.com/id',title:'Astrid'});
  for(let i=0;i<4;i++)await Promise.resolve();
  expect(fields['.combat-art-viewer-type'].textContent).toBe('KOMBATANT');
  api.html('b');
  expect(api.current).toBeNull();
 });
 it('binds only existing visible equipment and initiative/detail portrait images',()=>{
  expect(js).toContain('.combat-turn-equip-art .combat-turn-art');
  expect(js).toContain('.combatant-card .combat-row-portrait img');
  expect(js).toContain('.combat-detail-header .combat-row-portrait img');
  expect(js).toContain("root.addEventListener('click',handle,true)");
  expect(js).toContain('event.stopPropagation()');
  expect(js).toContain("url.pathname.startsWith('/storage/v1/object/')");
  expect(js).toContain('url.origin===window.location.origin');
  expect(js).not.toContain('dbJson(');
 });
 it('reduces gallery heading and inset without cropping ornate spell or equipment icons',()=>{
  expect(css).toContain('margin:4px 5px 8px;padding:5px');
  expect(css).toContain('padding:0;');
  expect(css).toContain('object-fit:contain');
 });
});
