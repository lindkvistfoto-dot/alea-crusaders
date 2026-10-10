import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('legacy/app.js');
const css=read('features/character/current-equipment-gandalf.css');
const artCss=read('features/equipment/art.css');
const selection=app.slice(app.indexOf('function clearTwoHandIfNeeded(){'),app.indexOf('/* v0.35.09 — Food & provisions',app.indexOf('function clearTwoHandIfNeeded(){')));
const render=app.slice(app.indexOf('function renderCurrentEquipment(){'),app.indexOf('function openCurrentEquipment(){'));
const twohand=app.slice(app.indexOf('function gandalfTwoHandSlotHtml(item){'),app.indexOf('function showCurrentEquipmentProjectileInfo(){'));

function fixture(hands=2){
 const current={weapons:[{equipId:'staff',name:'Stav'},{equipId:'bastard',name:'Bastardsvärd'}],
  armor:[],shields:[],equipment:[],currentEquipment:{head:null,torso:null,arms:null,legs:null,leftHand:null,rightHand:null}};
 let saves=0;
 const context={
  current,currentEquipmentPickerSlot:null,
  ensureEquipmentState:()=>{},save:()=>{saves++},renderCurrentEquipment:()=>{},
  equipRefEquals:(a,b)=>!!a&&!!b&&a.kind===b.kind&&a.itemId===b.itemId,
  weaponGripForCharacter:()=>({linked:true,canUse:true,hands,glMultiplier:1,status:'ok'}),
  alert:msg=>{throw new Error(msg)}
 };
 runInNewContext(selection,context);
 return {current,setHands(value){hands=value},choose:(...args)=>context.chooseCurrentEquipment(...args),
  clear:slot=>context.clearCurrentEquipmentSlot(slot),saves:()=>saves};
}

describe('Sammanhängande tvåhandsruta',()=>{
 it('equips a true 2H staff in both hands and clears anything formerly in either hand',()=>{
  const f=fixture(2);
  f.current.currentEquipment.leftHand={kind:'shield',itemId:'shield'};
  f.current.currentEquipment.rightHand={kind:'equipment',itemId:'torch'};
  f.choose('leftHand','weapon','staff');
  const {leftHand,rightHand}=f.current.currentEquipment;
  expect(leftHand.itemId).toBe('staff');
  expect(rightHand.itemId).toBe('staff');
  expect(leftHand.hands).toBe(2);
  expect(rightHand.hands).toBe(2);
  expect(f.saves()).toBe(1);
 });
 it('resets to two individual hand slots after switching a versatile weapon to 1H',()=>{
  const f=fixture(2);
  f.choose('leftHand','weapon','bastard');
  f.setHands(1);
  f.choose('rightHand','weapon','bastard');
  expect(f.current.currentEquipment.leftHand).toBeNull();
  expect(f.current.currentEquipment.rightHand.itemId).toBe('bastard');
  expect(f.current.currentEquipment.rightHand.hands).toBe(1);
 });
 it('clearing either half of a merged 2H slot clears both hands',()=>{
  const f=fixture(2);
  f.choose('rightHand','weapon','staff');
  f.clear('leftHand');
  expect(f.current.currentEquipment.leftHand).toBeNull();
  expect(f.current.currentEquipment.rightHand).toBeNull();
 });
 it('shows exactly one merged slot when the same 2H weapon occupies both hands',()=>{
  const current={weapons:[{equipId:'staff',name:'Stav'}],
   currentEquipment:{leftHand:{kind:'weapon',itemId:'staff',hands:2},rightHand:{kind:'weapon',itemId:'staff',hands:2}}};
  const el={innerHTML:''},ctx={
   current,currentEquipmentPickerSlot:null,ensureEquipmentState:()=>{},
   $:()=>el,equipItemByRef:(_c,ref)=>ref?current.weapons[0]:null,
   equipRefEquals:(a,b)=>!!a&&!!b&&a.kind===b.kind&&a.itemId===b.itemId,
   gandalfTwoHandSlotHtml:()=>'<twohand/>',
   currentEquipSlotHtml:slot=>'<'+slot+'/>',
   currentEquipmentFigureHtml:()=>'',renderCurrentEquipmentPicker:()=>{}
  };
  runInNewContext(render+';renderCurrentEquipment();',ctx);
  expect(el.innerHTML).toContain('<twohand/>');
  expect(el.innerHTML).not.toContain('<leftHand/>');
  expect(el.innerHTML).not.toContain('<rightHand/>');
  expect(el.innerHTML).toContain('<head/>');
  expect(el.innerHTML).toContain('gandalf-equip-projectiles');
  current.currentEquipment.rightHand={kind:'equipment',itemId:'torch',hands:1};
  runInNewContext('renderCurrentEquipment();',ctx);
  expect(el.innerHTML).not.toContain('<twohand/>');
  expect(el.innerHTML).toContain('<leftHand/>');
  expect(el.innerHTML).toContain('<rightHand/>');
 });
 it('renders a weapon image in the middle and the item name below the continuous frame',()=>{
  const ctx={window:{aleaEquipmentArt:{imageTag:()=>'<img class="gandalf-equip-art">'}},
   ruleWeaponForItem:()=>({image_path:'weapon/example.webp'}),
   escAttr:x=>String(x)};
  runInNewContext(twohand,ctx);
  const html=ctx.gandalfTwoHandSlotHtml({name:'Stav'});
  expect(html).toContain('gandalf-equip-twohand');
  expect(html).toContain('<span class="gandalf-equip-face"><img class="gandalf-equip-art"></span>');
  expect(html).toContain('<span class="gandalf-equip-label"><b>Stav</b><small>Båda händerna</small></span>');
  expect(html).toContain("openCurrentEquipmentPicker('leftHand')");
  ctx.window.aleaEquipmentArt.imageTag=()=> '';
  expect(ctx.gandalfTwoHandSlotHtml({name:'Stav'})).toContain('gandalf-equip-value');
 });
 it('uses a real continuous tall frame, not two stacked square backgrounds',()=>{
  const asset=new URL('../features/character/assets/gandalf-twohand-frame.svg',import.meta.url);
  expect(existsSync(asset)).toBe(true);
  const svg=read('features/character/assets/gandalf-twohand-frame.svg');
  expect(svg).toContain('viewBox="0 0 256 560"');
  expect(svg).toContain('continuous ornate frame');
  expect(svg).toContain('<use href="#spark"');
  expect(css).toContain('background-image:url("./assets/gandalf-twohand-frame.svg")');
  expect(css).toContain('.gandalf-equip-twohand .gandalf-equip-face::after');
  expect(css).not.toContain('background-size:100% 50%,100% 50%');
  expect(artCss).toContain('.gandalf-equip-twohand .gandalf-equip-art');
  expect(css).toContain('.gandalf-equip-projectiles{top:53%');
 });
});
