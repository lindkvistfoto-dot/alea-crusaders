import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
function body(from,to){
 const start=source.indexOf(from),end=source.indexOf(to,start);
 if(start<0||end<0)throw Error('Expected equipment functions missing');
 return source.slice(start,end);
}
const context={
 equipRefEquals:(a,b)=>Boolean(a&&b&&a.kind===b.kind&&a.itemId===b.itemId),
 equipItemByRef:(c,ref)=>c.weapons.find(w=>w.equipId===ref.itemId)
};
runInNewContext(
 body('function weaponGripRule(', 'function weaponGripForCharacter(')+
 body('function refreshEquippedWeaponGrip(', 'function armorTypeById(')+
 '\nthis.grip=weaponGripRule;this.refreshGrip=refreshEquippedWeaponGrip;',context
);
context.weaponGripForCharacter=(item,c)=>({
 linked:true,...context.grip(item.handling,item.strengthGroup,c.styGroup)
});

describe('one- or two-handed equipment with strength groups',()=>{
 it('allows group 4 bastardsword in one hand for strength group 4',()=>{
  const g=context.grip('1-2H',4,4);
  expect(g.canUse).toBe(true);expect(g.hands).toBe(1);
  expect(g.glMultiplier).toBe(1);expect(g.status).toBe('normal');
 });
 it('uses two hands when one strength group below and half GL when two below',()=>{
  expect(context.grip('1-2H',4,3).hands).toBe(2);
  expect(context.grip('1-2H',4,3).glMultiplier).toBe(1);
  expect(context.grip('1-2H',4,2).hands).toBe(2);
  expect(context.grip('1-2H',4,2).glMultiplier).toBe(.5);
  expect(context.grip('1-2H',4,1).canUse).toBe(false);
 });
 it('does not turn dedicated 2H weapons into one-handed weapons',()=>{
  expect(context.grip('2H',4,4).hands).toBe(2);
  expect(context.grip('1H',4,4).hands).toBe(1);
 });
 it('releases the secondary slot when previously saved as two-handed',()=>{
  const ref={kind:'weapon',itemId:'bastardsword',hands:2,primaryHand:'rightHand',ruleStatus:'normal',glMultiplier:1};
  const c={styGroup:4,weapons:[{equipId:'bastardsword',handling:'1-2H',strengthGroup:4}],currentEquipment:{leftHand:{...ref},rightHand:{...ref}}};
  expect(context.refreshGrip(c)).toBe(true);
  expect(c.currentEquipment.leftHand).toBe(null);
  expect(c.currentEquipment.rightHand.hands).toBe(1);
  expect(c.currentEquipment.rightHand.itemId).toBe('bastardsword');
  expect(context.refreshGrip(c)).toBe(false);
 });
});
