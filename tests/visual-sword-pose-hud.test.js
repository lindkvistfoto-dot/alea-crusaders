import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const resolver=readFileSync(new URL('../features/ui/arcane-paper-doll-pose-resolver.js',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const root={};new Function('globalThis',resolver)(root);
const poses=root.aleaBattlePoseCatalog;
it('maps a one-handed other sword and shield to the shared sword pose',()=>{
 const equipment={weaponClass:'ovriga_svard',handling:'1-2H',grip:'1H',hasShield:true,hasWeapon:true};
 expect(poses.resolve(equipment,['standard','enhandssvard_shield']).poseId).toBe('enhandssvard_shield');
});
it('does not use one-handed sword pose when gripped with two hands',()=>{
 const equipment={weaponClass:'ovriga_svard',handling:'1-2H',grip:'2H',hasShield:false,hasWeapon:true};
 expect(poses.resolve(equipment,['standard','enhandssvard','ovriga_svard']).poseId).toBe('ovriga_svard');
});
it('renders main hand first and shield arm second',()=>{
 expect(runtime).toContain("hand('rightHand','Huvudhand')+hand('leftHand','Sköldarm')");
 expect(runtime).not.toContain("hand('leftHand','Vänster hand')+hand('rightHand','Höger hand')");
});
