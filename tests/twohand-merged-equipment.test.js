import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('legacy/app.js');
const css=read('features/character/current-equipment-gandalf.css');
const artCss=read('features/equipment/art.css');
const selection=app.slice(app.indexOf('function clearTwoHandIfNeeded(){'),app.indexOf('/* v0.35.09 — Food & provisions',app.indexOf('function clearTwoHandIfNeeded(){')));
const render=app.slice(app.indexOf('function renderCurrentEquipment(){'),app.indexOf('function openCurrentEquipment(){'));
const twohand=app.slice(app.indexOf('function twoHandDisplayProfile(item){'),app.indexOf('function showCurrentEquipmentProjectileInfo(){'));

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
  expect(html).toContain('<span class="gandalf-equip-face" data-twohand-profile="staff" style="');
  expect(html).toContain('><img class="gandalf-equip-art"></span>');
  expect(html).toContain('--twohand-rotate:-35deg');
  expect(html).toContain('--twohand-scale:1.58');
  expect(html).toContain('<span class="gandalf-equip-label"><b>Stav</b><small>Båda händerna</small></span>');
  expect(html).toContain("openCurrentEquipmentPicker('leftHand')");
  ctx.window.aleaEquipmentArt.imageTag=()=> '';
  expect(ctx.gandalfTwoHandSlotHtml({name:'Stav'})).toContain('gandalf-equip-value');
 });
 it('classifies master-register weapon types with crossbow ahead of bow and polearm ahead of axe',()=>{
  let rule={};
  const ctx={ruleWeaponForItem:()=>rule};
  runInNewContext(twohand,ctx);
  const cases=[
   [{name:'Trästav',icon_key:'staff',tags:['staff','wood']},'staff',-35],
   [{name:'Lyra stav'},'staff',-35],
   [{name:'Långspjut',icon_key:'spear',tags:['spear']},'polearm',-18],
   [{name:'Hillebard',icon_key:'halberd',tags:['polearm','axe']},'polearm',-18],
   [{name:'Bastardsvärd',icon_key:'sword',tags:['sword']},'sword',-15],
   [{name:'Tvåhandssvärd',icon_key:'sword'},'sword',-15],
   [{name:'Långbåge',icon_key:'bow',tags:['bow']},'bow',-8],
   [{name:'Tungt armborst',icon_key:'crossbow',tags:['crossbow','projectile']},'crossbow',-6],
   [{name:'Tvåhandsyxa',icon_key:'axe',tags:['axe']},'axe',-12],
   [{name:'Främmande vapen',icon_key:'unknown'},'standard',-17]
  ];
  for(const [master,expected,rotate] of cases){
   rule=master.name==='Lyra stav'?{}:master;
   const p=ctx.twoHandDisplayProfile({name:master.name});
   expect(p.type).toBe(expected);
   expect(p.rotate).toBe(rotate);
   for(const field of ['scale','width','height','x','y'])
    expect(Number.isFinite(p[field])).toBe(true);
  }
 });
 it('does not rotate single-hand equipment and leaves the original image asset untouched',()=>{
  expect(artCss).toContain('.gandalf-equip-twohand .gandalf-equip-art');
  expect(artCss).toContain('.gandalf-equip-face[data-twohand-profile="staff"] .gandalf-equip-art');
  expect(artCss).toContain('brightness(1.15) contrast(1.16)');
  expect(artCss).toContain('.gandalf-equip-face[data-twohand-profile="staff"]::after');
  expect(artCss).toContain('opacity:.58');
  expect(artCss).toContain('var(--twohand-rotate,-17deg)');
  expect(artCss).toContain('var(--twohand-scale,1.32)');
  expect(artCss).not.toContain('transform:rotate(-17deg)');
  const rule={name:'Trästav',icon_key:'staff',image_path:'weapon/asset.webp',tags:['staff']};
  const ctx={ruleWeaponForItem:()=>rule};
  runInNewContext(twohand,ctx);
  const before=JSON.stringify(rule);
  ctx.twoHandDisplayProfile({name:'Trästav'});
  expect(JSON.stringify(rule)).toBe(before);
  expect(app).toContain("currentEquipSlotHtml('leftHand')+currentEquipSlotHtml('rightHand')");
  expect(app).toContain("Number(left.hands)===2&&equipRefEquals(left,right)");
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
