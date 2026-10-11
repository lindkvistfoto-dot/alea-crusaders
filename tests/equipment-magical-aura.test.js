import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('legacy/app.js');
const combat=read('features/combat/runtime.js');
const css=read('features/character/magic-items.css');

const startOf=(source,marker)=>{
 const start=source.indexOf(marker);
 if(start<0)throw new Error('Missing function '+marker);
 return start;
};
const piece=(source,begin,end)=>{
 const start=startOf(source,begin),stop=startOf(source,end);
 return source.slice(start,stop);
};
const escape=value=>String(value);
const art={imageTag:path=>path?'<img class="gandalf-equip-art" alt="">':'',src:path=>path?'https://example.invalid/'+path:''};
const magic={magical:item=>item?.isMagical===true||item?.magic?.enabled===true};
const win={aleaEquipmentArt:art,aleaCharacterItemMagic:magic};
const item=(isMagical=true)=>({equipId:'sword',name:'Dödsbringaren',isMagical});
const hand=(x,kind='weapon')=>({currentEquipment:{leftHand:{kind,itemId:'sword'}},weapons:[x],shields:[x],armor:[],equipment:[]});

function slotMarkup(x,artwork=true){
 const source=piece(app,'function currentEquipSlotHtml(', '/* Narsil-style:');
 const factory=new Function('current','equipItemByRef','CURRENT_EQUIP_LABELS','window','currentEquipmentItemArtPath','escAttr',
  source+'return currentEquipSlotHtml;');
 const c=hand(x);
 const render=factory(c,()=>x,{leftHand:'Vänster hand'},
  {...win,aleaEquipmentArt:{imageTag:artwork?art.imageTag:()=>''}},
  ()=>artwork?'weapon/test.webp':null,escape);
 return render('leftHand');
}
function twoHandMarkup(x){
 const source=piece(app,'function gandalfTwoHandSlotHtml(', '/* Automatic ammunition');
 const factory=new Function('window','ruleWeaponForItem','escAttr','twoHandDisplayProfile',
  source+'return gandalfTwoHandSlotHtml;');
 const render=factory(win,()=>({image_path:'weapon/test.webp'}),escape,
  ()=>({type:'sword',rotate:-15,scale:1.4,x:5,y:10,width:90,height:62}));
 return render(x);
}
function combatMarkup(x,twoHands=false,second=null){
 const source=piece(combat,'function combatTurnEquipmentHtml(', 'function combatTurnPanelHtml(');
 const factory=new Function('combatAttackProfile','window','escAttr','ruleWeaponForItem','characterShieldRule','ruleArmorTypes',
  source+'return combatTurnEquipmentHtml;');
 const hands=twoHands
  ?{leftHand:{kind:'weapon',itemId:'sword',hands:2},rightHand:{kind:'weapon',itemId:'sword',hands:2}}
  :{leftHand:{kind:'weapon',itemId:'sword'},rightHand:second?{kind:'shield',itemId:'shield'}:null};
 const profile={weapons:[x],shields:second?[second]:[],armor:[],equipment:[],currentEquipment:hands};
 const render=factory(()=>profile,win,escape,()=>({image_path:'weapon/test.webp',category:'melee'}),
  ()=>({image_path:'shield/test.webp'}),[]);
 return render({});
}

describe('golden aura for individually magical equipment',()=>{
 it('adds the marker only to magical items in current equipment',()=>{
  expect(slotMarkup(item(true))).toContain('gandalf-equip-leftHand equipped magical');
  expect(slotMarkup(item(false))).not.toContain(' equipped magical');
 });
 it('supports legacy magic.enabled and transparent artwork fallback',()=>{
  expect(slotMarkup({equipId:'sword',name:'Sköld',magic:{enabled:true}},false)).toContain('magical-no-art');
  expect(slotMarkup(item(false),false)).not.toContain('magical-no-art');
 });
 it('shows the aura on a merged two-handed weapon',()=>{
  expect(twoHandMarkup(item(true))).toContain('gandalf-equip-twohand equipped magical');
  expect(twoHandMarkup(item(false))).not.toContain('gandalf-equip-twohand equipped magical');
 });
 it('marks magical combat weapon art while leaving normal shields unmarked',()=>{
  const normalShield={equipId:'shield',name:'Träsköld',isMagical:false};
  const markup=combatMarkup(item(true),false,normalShield);
  expect(markup).toContain('combat-turn-equip-art weapon magical');
  expect(markup).toContain('combat-turn-equip-art shield"');
  expect(markup).not.toContain('combat-turn-equip-art shield magical');
  expect(combatMarkup(item(true),true)).toContain('weapon twohand magical');
  expect(combatMarkup(item(false))).not.toContain('weapon magical');
 });
 it('has a pronounced pulsing golden halo and a reduced-motion alternative',()=>{
  expect(css).toContain('/* v0.35.90');
  expect(css).toContain('drop-shadow(0 0 28px rgba(232,140,24,.58))');
  expect(css).toContain('drop-shadow(0 0 38px rgba(240,150,28,.72))');
  expect(css).toContain('animation:aleaMagicalGoldPulse 2.2s ease-in-out infinite');
  expect(css).toContain('drop-shadow(0 0 22px rgba(241,160,40,.72))');
  expect(css).toContain('.gandalf-equip-slot.magical-no-art .gandalf-equip-value');
 });
 it('uses alpha-mask shadows rather than brightening equipment frames',()=>{
  expect(css).toContain('@keyframes aleaMagicalGoldPulse');
  expect(css).toContain('drop-shadow(');
  expect(css).toContain('.gandalf-equip-slot.magical .gandalf-equip-face > img.gandalf-equip-art');
  expect(css).toContain('.combat-turn-equip-art.magical .combat-turn-art-frame > img.combat-turn-art');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
 });
});
