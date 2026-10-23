import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/combat/astrid-paper-doll.css',import.meta.url),'utf8');
it('highlights only cells returned by authoritative movement path resolver',()=>{
 expect(runtime).toContain('combatMovementHexPath(planningActor,combatMovementPlan.q,combatMovementPlan.r)');
 expect(runtime).toContain("roadKeys.has(cell.key)");
 expect(runtime).toContain("cls.push('yellow-brick-road')");
 expect(css).toContain('.combat-hex.yellow-brick-road');
});
