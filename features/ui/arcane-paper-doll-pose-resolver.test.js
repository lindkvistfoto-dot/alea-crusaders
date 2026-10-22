import {describe,it,expect} from 'vitest';
import {resolveBattlePose,poseFamily,POSES} from './pose-resolver.js';
describe('Arcane Paper Doll pose resolver',()=>{
 it('matches Astrid by class and shield, not item name or hand',()=>{
  expect(resolveBattlePose({weaponClass:'ovriga_svard',hasShield:true,handling:'1-2H'},['standard','sword_shield']).poseId).toBe('sword_shield');
 });
 it('uses Standard when specialist pose missing',()=>{
  expect(resolveBattlePose({weaponClass:'pilbagar'},['standard']).poseId).toBe('standard');
 });
 it('never selects another combatant pose',()=>{
  expect(resolveBattlePose({weaponClass:'dolkar',hasShield:true},['standard','dagger']).poseId).toBe('dagger');
 });
 it('selects two handed when explicitly gripped',()=>{
  expect(resolveBattlePose({weaponClass:'ovriga_svard',grip:'2H'},['two_handed_sword']).poseId).toBe('two_handed_sword');
 });
 it('preserves Swedish catalog and unknown fallback',()=>{
  expect(POSES.find(x=>x.id==='sword_shield').label).toBe('Svärd och sköld');
  expect(poseFamily('not-defined')).toBeNull();
 });
});