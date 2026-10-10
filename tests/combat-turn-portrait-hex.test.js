import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
const start=runtime.indexOf('function combatTurnPortraitHtml(');
const end=runtime.indexOf('function combatTurnActionState(',start);
if(start<0||end<start)throw new Error('Active turn portrait renderer missing');
function portrait(source_type,id,url){
 const scope={
  combatRowPortraitUrl:()=>url,
  combatTokenInitials:name=>String(name||'?').slice(0,2).toUpperCase(),
  escAttr:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')
 };
 runInNewContext(runtime.slice(start,end)+'\nthis.renderPortrait=combatTurnPortraitHtml;',scope);
 return scope.renderPortrait({id,source_type,name_snapshot:'Evalin Hugger'});
}
describe('Aktiv kombatants porträtthex',()=>{
 it('ger spelare en grön ram med en enda SVG-form för bild och ram',()=>{
  const html=portrait('character','evalin','blob:evalin.webp');
  expect(html).toContain('combat-turn-portrait player-row');
  expect(html).toContain('viewBox="0 0 120 104"');
  const clipPoints=html.match(/<clipPath[^>]*><polygon points="([^"]+)"/)?.[1];
  const framePoints=html.match(/class="combat-turn-portrait-outline" points="([^"]+)"/)?.[1];
  expect(clipPoints).toBe('30,4 90,4 116,52 90,100 30,100 4,52');
  expect(framePoints).toBe(clipPoints);
  expect(html).toContain('href="blob:evalin.webp"');
  expect(html).toContain('clip-path="url(#combatTurnPortraitClip_evalin)"');
  expect(html).not.toContain('<img ');
 });
 it('unika clipPath-id så flera porträtt kan ritas samtidigt',()=>{
  expect(portrait('npc','slp-1','blob:slp')).toContain('combatTurnPortraitClip_slp-1');
  expect(portrait('monster','fiende-2','blob:enemy')).toContain('combatTurnPortraitClip_fiende-2');
 });
 it('SLP och fiender behåller sina blå och röda ramfärger',()=>{
  expect(portrait('npc','slp','blob:slp')).toContain('combat-turn-portrait npc-row');
  expect(portrait('monster','enemy','blob:enemy')).toContain('combat-turn-portrait enemy-row');
  expect(css).toContain('.combat-turn-portrait.player-row{--turn-side:#3ca95a}');
  expect(css).toContain('.combat-turn-portrait.npc-row{--turn-side:#3984c6}');
  expect(css).toContain('.combat-turn-portrait.enemy-row{--turn-side:#bd493e}');
 });
 it('initialer används när porträttbild saknas',()=>{
  const html=portrait('character','evalin','');
  expect(html).toContain('combat-turn-portrait-initials');
  expect(html).toContain('>EV</text>');
  expect(html).not.toContain('combat-turn-portrait-image');
 });
 it('portrettpanelens egen CSS bryter dubbelklippning utan att ändra kartbrickorna',()=>{
  const ownCss=css.slice(css.indexOf('/* v0.35.81 — separat SVG-porträtt'));
  expect(ownCss).toContain('.combat-turn-portrait{');
  expect(ownCss).toContain('clip-path:none;');
  expect(ownCss).toContain('stroke:var(--turn-side,#3ca95a)');
  expect(ownCss).not.toContain('.combat-portrait-green-ring');
  expect(css).toContain('transform-box:view-box;');
  expect(css).toContain('transform-origin:0 0;');
 });
});
