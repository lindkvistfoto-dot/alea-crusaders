import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const equipment=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');

describe('combat weapon switch action',()=>{
 test('is available under other combat actions and costs the existing primary action slot',()=>{
  expect(runtime).toContain("{key:'weapon_switch',type:'other',label:'Byta/dra vapen'");
  expect(runtime).toContain("COMBAT_PRIMARY_ACTIONS.filter(def=>!def.automatic&&!def.reactive&&def.key!=='attack'&&def.type!=='spell')");
  expect(runtime).toContain("action_key:def.key,label:def.label,mode:def.mode");
  expect(runtime).toContain("slot_key:'primary'");
 });

 test('opens the existing equipment panel for the active character and stages changes until confirm',()=>{
  expect(runtime).toContain("window.aleaBeginCombatWeaponSwitch?.(refreshed,reserved)");
  expect(equipment).toContain("window.aleaBeginCombatWeaponSwitch=beginCombatWeaponSwitch");
  expect(equipment).toContain("if(combatWeaponSwitchSession)return;localStorage.setItem");
  expect(equipment).toContain("await syncCharacterToCentral(character)");
  expect(equipment).toContain("window.combatCommitWeaponSwitch?.");
  expect(equipment).toContain("character.currentEquipment=JSON.parse(JSON.stringify(session.original))");
 });

 test('limits combat edits to hand weapons and shields while reusing grip and two-hand rules',()=>{
  expect(equipment).toContain("if(combatEquipmentIsLocked(slot)||combatWeaponSwitchSession&&!['weapon','shield'].includes(kind))return");
  expect(equipment).toContain("combatWeaponSwitchSession?[['weapon','Vapen',current.weapons||[]],['shield','Sköldar',current.shields||[]]]");
  expect(equipment).toContain("weaponGripForCharacter(item,current)");
  expect(equipment).toContain("clearTwoHandIfNeeded()");
  expect(equipment).toContain("if(combatEquipmentIsLocked(slot))return");
 });

 test('confirms only the still-planned action and writes one player-visible combat log entry',()=>{
  expect(runtime).toContain("status=eq.planned&select=id");
  expect(runtime).toContain("status:'resolved',result:{weapon_switch:true");
  expect(runtime).toContain("event_type:'weapon_switch'");
  expect(runtime).toContain("message:(actor.name_snapshot||'Stridande')+' bytte/drog vapen'");
  expect(runtime).toContain("if(!updated||");
 });
});
