import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
function slice(from,to){
 const start=source.indexOf(from),end=source.indexOf(to,start);
 if(start<0||end<0)throw Error(`Missing function boundary: ${from} → ${to}`);
 return source.slice(start,end);
}

describe('weapon class editing',()=>{
 it('keeps skill and weapon class independent when assigning a master weapon',()=>{
  const context={
   current:{weapons:[{name:'Custom blade',weaponClass:'old-class'}],projectiles:[]},
   ruleWeapons:[{id:'master-id',name:'Bastardsvärd',category:'melee',skill_id:'skill-id',weapon_class:'class-id'}],
   ruleSkills:[{id:'skill-id',name:'Bastardsvärd'},{id:'class-id',name:'Övriga svärd'}],
   save(){},renderWeapons(){},refreshTotalBep(){},
   ruleWeaponForItem(){return null},
  };
  runInNewContext(slice('function copyRuleWeaponToInstance(', 'function weaponRuleData(')+
   slice('function setWeapon(', 'function setArmor(')+
   '\nthis.assignMaster=setCharacterWeaponMaster;this.editWeapon=setWeapon;',context);

  context.assignMaster(0,'master-id');
  expect(context.current.weapons[0].skillId).toBe('skill-id');
  expect(context.current.weapons[0].weaponClass).toBe('class-id');
  context.editWeapon(0,'name','Dödsbringaren');
  expect(context.current.weapons[0].name).toBe('Dödsbringaren');
  expect(context.current.weapons[0].weaponClass).toBe('class-id');
 });

 it('places an independent class field after skill and persists it to rule_weapons',()=>{
  const editor=slice('function editRuleWeapon(', 'async function saveRuleWeapon(');
  const save=slice('async function saveRuleWeapon(', 'async function deleteRuleWeapon(');
  expect(editor.indexOf('id="rwSkillId"')).toBeGreaterThanOrEqual(0);
  expect(editor.indexOf('id="rwWeaponClassId"')).toBeGreaterThan(editor.indexOf('id="rwSkillId"'));
  expect(editor).toContain('r?.weapon_class||\'\'');
  expect(save).toContain("weapon_class:$('rwWeaponClassId')?.value||''");
  expect(source).toContain("w.weaponClass=rule.weapon_class||''");
 });

 it('edits character weaponClass in edit mode and keeps the read view unchanged',()=>{
  const renderer=slice('function renderWeapons(){','function projectileStepper(');
  expect(renderer).toContain("characterEquipmentEditField('Vapenslag'");
  expect(renderer).toContain('ruleWeaponSkillOptions(x.weaponClass||\'\')');
  expect(renderer).toContain("setWeapon('+i+', \\'weaponClass\\', this.value)");
  const readOnly=renderer.slice(renderer.indexOf(":\n  '<div class=\"weapon-head\""));
  expect(readOnly).not.toContain('Vapenslag');
  expect(source).toContain('if(weaponClass)w.weaponClass=weaponClass.value');
 });

 it('preserves weaponClass during detailed name edits and saves class changes',()=>{
  const weapon={name:'Dödsbringaren',weaponClass:'sword-class'};
  const fields={
   wiName:{value:'Dödsbringaren II'},wiCategory:{value:'melee'},wiHandling:{value:'1-2H'},
   wiStrength:{value:'4'},wiDamage:{value:'1T10+1'},wiLength:{value:'120'},wiBep:{value:'2'},
   wiBv:{value:'15'},wiType:{value:'Svärd'},wiPrice:{value:'0'},wiRange:{value:''},
   wiReload:{value:''},wiWeaponClass:{value:'sword-class'},
  };
  const context={
   weaponInstanceEditTarget:{scope:'character',index:0},current:{weapons:[weapon]},
   weaponInstanceByScope:(scope,index)=>scope==='character'?context.current.weapons[index]:null,
   weaponInstanceNum:value=>value===''?null:Number(value),$:id=>fields[id],save(){},
   renderWeapons(){},refreshTotalBep(){},closeSkillInfo(){},
  };
  runInNewContext(slice('function saveWeaponInstanceEditor(', 'function showWeaponInfo(')+
   '\nthis.saveWeapon=saveWeaponInstanceEditor;',context);
  context.saveWeapon();
  expect(weapon.name).toBe('Dödsbringaren II');
  expect(weapon.weaponClass).toBe('sword-class');
  fields.wiWeaponClass.value='different-class';
  context.saveWeapon();
  expect(weapon.weaponClass).toBe('different-class');
 });
});
