import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
const start=runtime.indexOf('function combatPlayerMiniatureSvg(');
const end=runtime.indexOf('function combatHexNeighbors(',start);
if(start<0||end<start)throw Error('Hex miniature renderer not found');
const mini=runtime.slice(start,end);

function miniature(actor,src){
 const ctx={
  combatRowPortraitUrl:()=>src,
  combatPlayerPortraitSource:()=>src?{url:src}:null,
  combatPortraitHexPoints:size=>String(size)+'-hex',
  combatPlayerMiniatureKind:()=>null,
  combatMiniatureWarrior:()=>'',combatMiniatureWizard:()=>'',combatMiniatureDuck:()=>'',
  escAttr:x=>String(x).replaceAll('&','&amp;').replaceAll('"','&quot;'),
 };
 runInNewContext(mini+'\nthis.renderHex=combatPlayerMiniatureSvg;',ctx);
 return ctx.renderHex({...actor,id:actor.id||'actor'}, {x:100,y:200},{size:42});
}
describe('Porträtt i hexagonkartan',()=>{
 test('fiende visar sitt riktiga porträtt i en rödmarkerad hexagon',()=>{
  const svg=miniature({source_type:'monster',name_snapshot:"Kva'argh"},'blob:kva-argh');
  expect(svg).toContain('combat-portrait-hex enemy-mini');
  expect(svg).toContain('href="blob:kva-argh"');
  expect(svg).toContain('clip-path=');
  expect(css).toContain('.combat-portrait-hex.enemy-mini:not(.selected):not(.attack-target)');
  expect(css).toContain('stroke:#c64d45');
 });
 test('SLP visar registrerat porträtt i blåmarkerad hexagon',()=>{
  const svg=miniature({source_type:'npc',name_snapshot:'Riddar Johan'},'blob:riddar-johan');
  expect(svg).toContain('combat-portrait-hex npc-mini');
  expect(svg).toContain('href="blob:riddar-johan"');
  expect(css).toContain('.combat-portrait-hex.npc-mini:not(.selected):not(.attack-target)');
  expect(css).toContain('stroke:#3984c6');
 });
 test('spelarens befintliga porträtt är fortfarande grönt',()=>{
  const svg=miniature({source_type:'character',name_snapshot:'Lyra'},'blob:lyra');
  expect(svg).toContain('combat-portrait-hex player-mini');
  expect(svg).toContain('href="blob:lyra"');
 });
 test('saknat SLP-porträtt återgår till befintlig kartmarkör',()=>{
  expect(miniature({source_type:'npc'},'')).toBe('');
  expect(miniature({source_type:'monster'},'')).toBe('');
  expect(runtime).toContain('visual=miniature||(');
  expect(runtime).toContain('combatTokenInitials(c.name_snapshot)');
 });
 test('hexbrickan använder SVG-vyns origo i stället för sin egen nederkant',()=>{
  const baseRule=css.match(/\.combat-miniature\s*\{([^}]+)\}/)?.[1]||'';
  // Ett g-element översätts till exakt centerkoordinat. Om skalan har en
  // annan pivot flyttas även (0,0) och modellen hamnar mellan karthexar.
  expect(baseRule).toMatch(/transform-box:\s*view-box\s*;/);
  expect(baseRule).toMatch(/transform-origin:\s*0\s+0\s*;/);
  expect(mini).toContain("transform=\"translate('+cell.x+' '+cell.y+') scale(");
  expect(runtime).toContain("combatHexPoints(cell.x,cell.y,g.size*.97)");
 });
 test('mapparen återanvänder samma porträtthämtare som turordningen',()=>{
  expect(mini).toContain('combatRowPortraitUrl(combatant)');
  expect(runtime).toContain('const miniature=combatPlayerMiniatureSvg(c,cell,g,selected+turn+targetClass+planningClass)');
 });
});
