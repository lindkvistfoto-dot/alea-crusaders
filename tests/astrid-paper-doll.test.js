import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const pilot=readFileSync(new URL('../features/combat/astrid-paper-doll.js',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const miniature=runtime.slice(runtime.indexOf('function combatPlayerMiniatureSvg('),runtime.indexOf('function combatHexNeighbors('));
const astrid={id:'battle-astrid',source_type:'character',source_id:'astrid-db',name_snapshot:'Astrid Eldhjärta',status:'active'};
const cell={x:140,y:210},geometry={size:42};
function setup(search='?arcanePaperDoll=1',imageFails=false){
 const images=[];
 const ctx={
  window:{location:{search}},document:{currentScript:{src:'https://alea.test/features/combat/astrid-paper-doll.js'}},
  URL,URLSearchParams,chars:[{id:'astrid',_dbId:'astrid-db'}],
  Image:class{set src(value){images.push(value);queueMicrotask(()=>imageFails?this.onerror():this.onload())}},
  renderCombat:()=>{},
  combatHexPoints:(x,y,r)=>[x,y,r].join(','),
  combatPortraitHexPoints:r=>'hex-'+r,
  combatMiniatureVisual:()=>({url:'blob:original-portrait',type:'portrait'}),
  escAttr:String,
 };
 runInNewContext(pilot+'\n'+miniature+'\nthis.classic=combatPlayerMiniatureSvg;',ctx);
 const api=ctx.window.aleaAstridPaperDoll;
 return {ctx,api,images,draw(row=astrid,g=geometry,classes=''){
  const classic=ctx.classic(row,cell,g,classes);
  return api?api.render(classic,row,cell,g,classes):classic;
 }}
}
describe('Astrid Arcane Paper Doll visual pilot',()=>{
 it('does not install or load art without the explicit developer flag',()=>{
  for(const query of ['', '?arcanePaperDoll=0','?arcanePaperDoll=true']){
   const h=setup(query);
   expect(h.api).toBeUndefined();
   expect(h.images).toEqual([]);
   expect(h.draw()).toBe(h.ctx.classic(astrid,cell,geometry));
  }
 });
 it('starts classic and returns byte-identical classic markup after switching back',async()=>{
  const h=setup(),classic=h.draw();
  expect(h.api.controlsHtml()).toContain('aria-pressed="true"');
  expect(h.images).toEqual([]);
  await h.api.setMode('paper-doll');
  expect(h.draw()).toContain('combat-paper-doll-image');
  await h.api.setMode('classic');
  expect(h.draw()).toBe(classic);
  expect(setup().draw()).toBe(classic);
 });
 it('replaces only Astrid by stable source ID, never another name match or NPC',async()=>{
  const h=setup();
  await h.api.setMode('paper-doll');
  for(const row of [
   {...astrid,source_id:'lyra-db',name_snapshot:'Lyra'},
   {...astrid,source_id:'another-astrid',name_snapshot:'Astrid Eldhjärta'},
   {...astrid,source_type:'npc'},
   {...astrid,source_type:'monster'},
   {...astrid,source_id:''},
   {...astrid,status:'dead'},
   {...astrid,status:'removed'},
  ])expect(h.draw(row)).toBe(h.ctx.classic(row,cell,geometry));
  expect(h.draw({...astrid,source_id:'astrid',name_snapshot:'Changed name'})).toContain('combat-paper-doll-image');
  expect(h.draw({...astrid,name_snapshot:'Changed name'})).toContain('combat-paper-doll-image');
 });
 it('retains original hit markup, state classes and the cell anchor without clipping the new image',async()=>{
  const h=setup(),before=JSON.stringify({astrid,cell,geometry,chars:h.ctx.chars});
  await h.api.setMode('paper-doll');
  const states=' selected active-turn attack-target movement-planning';
  const svg=h.draw(astrid,geometry,states);
  expect(svg).toContain('<g class="combat-paper-doll-classic">'+h.ctx.classic(astrid,cell,geometry,states)+'</g>');
  expect(svg).toContain('combat-paper-doll'+states+'" transform="translate(140 210)"');
  const image=svg.match(/<image class="combat-paper-doll-image"[^>]+>/)[0];
  expect(image).toContain('pointer-events="none"');
  expect(image).not.toContain('clip-path');
  expect(image).toContain('preserveAspectRatio="xMidYMid meet"');
  expect(JSON.stringify({astrid,cell,geometry,chars:h.ctx.chars})).toBe(before);
 });
 it('scales with actual hex size even below the classic minimum scale',async()=>{
  const h=setup();await h.api.setMode('paper-doll');
  const widths=[10,42,84].map(size=>Number(h.draw(astrid,{size}).match(/combat-paper-doll-image[^>]*width="([^"]+)"/)[1]));
  expect(widths[1]/widths[0]).toBeCloseTo(4.2);
  expect(widths[2]/widths[1]).toBeCloseTo(2);
 });
 it('keeps classic while loading, permits switching back during load, and handles load failure',async()=>{
  const h=setup(),classic=h.draw();
  const load=h.api.setMode('paper-doll');
  expect(h.draw()).toBe(classic);
  await h.api.setMode('classic');await load;
  expect(h.draw()).toBe(classic);
  const failed=setup('?arcanePaperDoll=1',true),original=failed.draw();
  await failed.api.setMode('paper-doll');
  expect(failed.draw()).toBe(original);
  expect(failed.api.controlsHtml()).toContain('Bilden kunde inte laddas');
  expect(failed.images).toHaveLength(1);
 });
});
