import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx={};
vm.runInNewContext(readFileSync(new URL('../features/ui/arcane-geometry-engine.js',import.meta.url),'utf8'),ctx);
vm.runInNewContext(readFileSync(new URL('../features/ui/hexagonia-image-lock.js',import.meta.url),'utf8'),ctx);
const lock=ctx.aleaHexagoniaImageLock;
const observed=ref=>ref.tiles.map(t=>({corners:t.corners.map(p=>({x:p.x,y:p.y}))}));
describe('HEXAGONIA shared geometry lock',()=>{
 for(const rows of [[1],[2],[1,2,3],[2,3,2]])it('locks shared edges for '+rows.join('-'),()=>{
  const a=lock.anchors(rows,{camera:{elevationDegrees:45}});
  expect(a.tiles.length).toBe(rows.reduce((x,y)=>x+y,0));
  expect(a.sharedEdges.length).toBe(a.qa.sharedPairs);
  expect(a.outerEdges.length).toBe(a.qa.outerEdges);
  expect(lock.validatePoints(a,observed(a)).valid).toBe(true);
 });
 it('rejects AI-shortened corners and changed camera',()=>{
  const a=lock.anchors([2],{camera:{elevationDegrees:45}});
  const bad=observed(a);bad[1].corners[2].x+=100;
  expect(lock.validatePoints(a,bad).valid).toBe(false);
 });
 it('blocks release until measured geometry, alpha and visual approval all pass',()=>{
  const a=lock.anchors([2]);const b=observed(a);
  expect(lock.releaseGate({reference:a,observed:b}).approved).toBe(false);
  expect(lock.releaseGate({reference:a,observed:b,alphaVerified:true}).approved).toBe(false);
  expect(lock.releaseGate({reference:a,observed:b,alphaVerified:true,visualApproved:true}).approved).toBe(true);
 });
});
