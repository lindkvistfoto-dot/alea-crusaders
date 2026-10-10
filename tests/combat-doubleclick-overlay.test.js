import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const combat=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function functionBody(name){
 const begin=combat.indexOf('function '+name+'(');
 if(begin<0)throw Error('Missing '+name);
 const end=combat.indexOf('\nfunction ',begin+1);
 return combat.slice(begin,end<0?undefined:end);
}
function htmlFixture(){
 const helper=functionBody('combatMovementHitTargetsHtml');
 const run=new Function('cells','reachable','actor','originKey','occupied',`
 const combatMovementOccupied=(actor,q,r)=>occupied.has(q+','+r);
 const combatHexPoints=(x,y,size)=>[x,y,size].join(',');
 `+helper+`
 return combatMovementHitTargetsHtml(cells,reachable,actor,originKey,{size:25})
 `);
 return (occupied=new Set())=>run([
  {key:'0,0',q:0,r:0,x:20,y:20},
  {key:'1,0',q:1,r:0,x:40,y:20},
  {key:'2,0',q:2,r:0,x:60,y:20},
  {key:'3,0',q:3,r:0,x:80,y:20}
 ],new Map([['0,0',0],['1,0',1],['2,0',2]]),{id:'actor'},'0,0',occupied)
}
describe('Hit targets for mouse doubleclick after movement preview',()=>{
 it('places a transparent clickable movement polygon above the miniature',()=>{
  const html=htmlFixture()();
  expect(html).toContain('combat-movement-hit');
  expect(html).toContain('data-q="1" data-r="0"');
  expect(html).toContain('data-q="2" data-r="0"');
  expect(html).toContain('pointer-events:all');
  expect(html).toContain('fill:transparent');
  expect(html).toContain('previewCombatMovementToHex(event,1,0)');
  expect(html).not.toContain('data-q="0"');
  expect(html).not.toContain('data-q="3"');
  // SVG paint order: destination hit targets must be appended after miniatures.
  expect(combat).toContain("+terrain+areasOverlay+tokens+movementHitTargets+'</svg>'");
 });
 it('does not allow occupied hexes or create targets outside movement mode',()=>{
  expect(htmlFixture()(new Set(['1,0']))).not.toContain('data-q="1"');
  expect(htmlFixture()(new Set(['1,0']))).toContain('data-q="2"');
  expect(combat).toContain('planningActor&&!gmPlaceMode&&!spellAreaMode&&!areaMode');
 });
 it('keeps click tracking when clicking the overlay rather than the preview miniature',()=>{
  expect(combat).toContain("event.target?.closest?.('.combat-hex.move-reachable')");
  expect(combat).toContain('now-last.when<=500');
  expect(combat).toContain('combatMovementPlan=null;');
  expect(combat).toContain('combatMovementCommitting=true');
 });
});
