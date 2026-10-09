import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');

describe('Melee visual choreography on combat hex map',()=>{
 it('starts before the dice are rolled, then resolves from the actual Expert result',()=>{
  const hook=runtime.indexOf('async function combatResolveAttackAction(');
  const start=runtime.indexOf("const meleeFx=attackMode==='melee'?combatStartMeleeFx(actor,target):null;",hook);
  const roll=runtime.indexOf('rolled=await combatExpertRoll(label,fv)',start);
  const finish=runtime.indexOf('meleeFx?.finish(rolled.outcome)',roll);
  expect(start).toBeGreaterThan(hook);
  expect(roll).toBeGreaterThan(start);
  expect(finish).toBeGreaterThan(roll);
  expect(runtime).toContain('catch(error){meleeFx?.stop();throw error}');
 });
 it('uses the existing map SVG, including centering multihex creatures',()=>{
  expect(runtime).toContain("document.querySelector('#combatPage .combat-board .combat-map-svg')");
  expect(runtime).toContain('const cells=combatFootprintCells(combatant)');
  expect(runtime).toContain('x:x/cells.length,y:y/cells.length');
  expect(runtime).toContain('svg.appendChild(fx)');
  expect(runtime).toContain("fx.setAttribute('pointer-events','none')");
  expect(runtime).toContain('const lunge=token?.animate?.(');
 });
 it('preserves dice resolution and displays distinct results without implying that a parry is resolved',()=>{
  expect(runtime).toContain("if(!svg||!g||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return null;");
  expect(runtime).toContain("success:'LYCKAT',special:'SÄRSKILT',perfect:'PERFEKT'");
  expect(runtime).toContain("fail:'MISSLYCKAT',fumble:'FUMMEL'");
  expect(runtime).toContain("meleeFx?.finish(rolled.outcome)");
  expect(runtime).toContain("const outcome=rolled.outcome,success=rolled.success");
  expect(styles).toContain('.combat-melee-fx.resolved .combat-melee-impact-ring');
  expect(styles).toContain('.combat-melee-fx.miss');
  expect(styles).toContain('.combat-melee-fx.fumble');
  expect(styles).toContain('@media(prefers-reduced-motion:reduce)');
 });
});
