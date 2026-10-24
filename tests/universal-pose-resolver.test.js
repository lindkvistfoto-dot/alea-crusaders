import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../features/ui/arcane-paper-doll-pose-resolver.js',import.meta.url),'utf8');
const mapSource=readFileSync(new URL('../features/combat/paper-doll-map.js',import.meta.url),'utf8');
function catalog(){const root={};new Function('globalThis',source)(root);return root.aleaBattlePoseCatalog}
describe('Universal Pose Resolver',()=>{
 it('uses an equipped one-handed sword on a monster',()=>{
  const c=catalog(),actor={state:{attack_profile:{weapons:[{equipId:'npc-weapon-0',name:'Kortsvärd',handling:'1H'}],currentEquipment:{leftHand:null,rightHand:{kind:'weapon',hands:1,itemId:'npc-weapon-0'}}}}};
  expect(c.resolve(c.fromCombatant(actor),['standard','enhandssvard']).poseId).toBe('enhandssvard');
 });
 it('does not infer equipped weapons from inventory alone',()=>{
  const c=catalog(),actor={state:{attack_profile:{weapons:[{name:'Kortsvärd'}],currentEquipment:null}}};
  expect(c.fromCombatant(actor).hasWeapon).toBe(false);
  expect(c.resolve(c.fromCombatant(actor),['standard','enhandssvard']).poseId).toBe('standard');
 });
 it('recognizes shields and avoids shield pose for two-handed grip',()=>{
  const c=catalog(),actor={state:{attack_profile:{weapons:[{equipId:'w',weaponClass:'enhandssvard',handling:'1-2H'}],currentEquipment:{leftHand:{kind:'shield'},rightHand:{kind:'weapon',hands:2,itemId:'w'}}}}};
  expect(c.resolve(c.fromCombatant(actor),['standard','enhandssvard','enhandssvard_shield']).poseId).toBe('enhandssvard');
 });
 it('is wired to combat map for non-characters',()=>{
  expect(mapSource).toContain("fromCombatant(actor)");
 });
});
