import {describe,it,expect} from 'vitest';
import './arcane-paper-doll-pose-resolver.js';
const {POSES,poseFamily,fromCharacter,resolve}=globalThis.aleaBattlePoseCatalog;
describe('Sisyfos: Swedish battle poses',()=>{
 it('covers all 18 classes including unarmed and compatible shield variants',()=>{
  expect(POSES.filter(p=>p.id!=='standard'&&!p.id.endsWith('_shield'))).toHaveLength(18);
  expect(POSES.some(p=>p.id==='stavar_shield')).toBe(false);
  expect(POSES.some(p=>p.id==='enhandssvard_shield')).toBe(true);
 });
 it('reads equipped weapon independent of left/right hand',()=>{
  const character={currentEquipment:{leftHand:{kind:'weapon',itemId:'w',hands:1},rightHand:{kind:'shield',itemId:'s'}},weapons:[{equipId:'w',name:'Dödsbringaren',weaponClass:'enhandssvard',handling:'1-2H'}]};
  expect(resolve(fromCharacter(character),['standard','enhandssvard_shield']).poseId).toBe('enhandssvard_shield');
 });
 it('shares one-handed sword visuals across sword skill groups',()=>{
  expect(poseFamily('ovriga_svard')).toBe('ovriga_svard');
  expect(resolve({weaponClass:'ovriga_svard',hasShield:true,handling:'1-2H',grip:'1H'},['enhandssvard_shield']).match).toBe('exact');
 });
 it('does not offer a shield pose for pure two-hand weapons',()=>{
  expect(resolve({weaponClass:'stavar',hasShield:true,handling:'2H'},['stavar']).poseId).toBe('stavar');
 });
 it('does not replace missing shield pose with an incorrect unshielded pose',()=>{
  expect(resolve({weaponClass:'enhandssvard',hasShield:true,handling:'1H'},['enhandssvard','standard']).poseId).toBe('standard');
 });
 it('falls back safely to the combatant standard pose',()=>{
  expect(resolve({weaponClass:'pilbagar'},['standard']).poseId).toBe('standard');
  expect(resolve({weaponClass:'pilbagar'},[]).poseId).toBeNull();
 });
});
