import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
it('flight indicator uses existing capability resolver and does not alter movement',()=>{
 expect(runtime).toContain('const flightBadge=!defeated&&combatIsFlying(c)');
 expect(runtime).toContain('combat-flight-status');
 expect(runtime).toContain('turnBadge+flightBadge');
 expect(runtime).toContain('function combatIsFlying(combatant){return combatFlightCapabilities(combatant).flying}');
});
