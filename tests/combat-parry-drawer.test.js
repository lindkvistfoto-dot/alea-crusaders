import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js'),css=read('features/combat/attack-participants.css');
const begin=runtime.indexOf('function combatDefenseReactionHtml('),
 end=runtime.indexOf('function combatTurnPortraitHtml(',begin);
if(begin<0||end<=begin)throw Error('Combat defense reaction helpers missing');
const code=runtime.slice(begin,end);
const centerTile=runtime.slice(runtime.indexOf('function combatDuelCenterHtml('),runtime.indexOf('// Spell feedback is presentation-only'));
const escAttr=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);

function sample(){
 return {
  defender:{id:'def-1',name_snapshot:"Kva'argh"},
  attacker:{id:'att-1',name_snapshot:'Astrid'},
  attack:{id:'attack-42',result:{success:true,weapon_name:'Dödsbringaren'},source_data:{}},
  options:[
   {key:'shield:medium',kind:'shield',name:'Medelstor sköld',fv:13},
   {key:'weapon:blade',kind:'weapon',name:'Bastardsvärd',fv:15}
  ]
 }
}
function harness(opportunity=null,extra={}){
 const env={
  escAttr,console,
  combatAntimagicPromptHtml:()=>'',combatSpellCastPanelHtml:()=>'',combatPendingParryOpportunity:()=>opportunity,
  combatAttackResultHtml:action=>'<div class="combat-attack-result">'+escAttr(action.id)+'</div>',
  combatMiniParticipantHtml:(role,person)=>'<div>'+role+' '+escAttr(person.name_snapshot)+'</div>',
  combatActiveActor:()=>null,combatChosenAction:()=>null,combatActionDefinition:()=>null,
  ...extra
 };
 runInNewContext(centerTile+code+'\nthis.exports={drawer:combatDefenseReactionHtml,panel:combatAttackPanelHtml,choose:combatSubmitDefenseChoice};',env);
 return env.exports;
}
describe('Responsive parry reaction outside the attack panel',()=>{
 it('shows shield and weapon defenses as distinct clickable options',()=>{
  const html=harness().drawer(sample());
  expect(html).toContain('combat-defense-drawer');
  expect(html).toContain('FÖRSVAR');
  expect(html).toContain('Kva&#39;argh');
  expect(html).toContain('Sköldparering');
  expect(html).toContain('Vapenparering');
  expect(html).toContain('FV 13');
  expect(html).toContain('FV 15');
  expect(html).toContain('combatSubmitDefenseChoice(this,&#39;parry&#39;,&quot;def-1&quot;,&quot;attack-42&quot;,&quot;shield:medium&quot;)');
  expect(html).toContain('combatSubmitDefenseChoice(this,&#39;parry&#39;,&quot;def-1&quot;,&quot;attack-42&quot;,&quot;weapon:blade&quot;)');
  expect(html).toContain('combatSubmitDefenseChoice(this,&#39;take-hit&#39;,&quot;def-1&quot;,&quot;attack-42&quot;)');
  expect(html).toContain('Ta smällen');
 });
 it('always shows exactly three illustration-ready slots, with no explanatory paragraphs',()=>{
  const html=harness().drawer(sample());
  expect((html.match(/<button /g)||[])).toHaveLength(3);
  expect(html).toContain('data-defense-art="shield"');
  expect(html).toContain('data-defense-art="weapon"');
  expect(html).toContain('data-defense-art="take-hit"');
  expect(html).not.toContain('combat-defense-drawer-copy');
  expect(html).not.toContain('combat-defense-drawer-hint');
  expect(html).toContain('Ta smällen');
 });
 it('uses the painted fantasy frames without visible weapon headers',()=>{
  const solo=harness().drawer(sample());
  expect(solo).not.toContain('<strong>Vapen</strong>');
  expect(solo).toContain('<small>Bastardsvärd</small>');
  expect(solo).toContain('Vapenparering');
  const dual=sample();
  dual.options=[
   {key:'weapon:left',kind:'weapon',name:'Kortsvärd',fv:12,item:{equipId:'left'}},
   {key:'weapon:right',kind:'weapon',name:'Dolk',fv:9,item:{equipId:'right'}}
  ];
  const html=harness(dual,{
   combatAttackProfile:()=>({currentEquipment:{leftHand:{kind:'weapon',itemId:'left'},rightHand:{kind:'weapon',itemId:'right'}}})
  }).drawer(dual);
  expect(html).toContain('combat-defense-multi');
  expect(html).not.toContain('combat-defense-multi-title');
  expect(html).toContain('Kortsvärd');
  expect(html).toContain('Dolk');
  expect((html.match(/combat-defense-weapon-option"/g)||[])).toHaveLength(2);
 });
 it('enlarges the weapon artwork outside the painted frame while preserving independent crop and click targets',()=>{
  expect(css).toContain('v0.35.165 – defense artwork owns its gilded frame');
  expect(css).toContain('border:0!important;');
  expect(css).toContain('overflow:visible;');
  expect(css).toContain('width:162%;');
  expect(css).toContain('width:194%;');
  expect(css).toContain('width:230%;');
  expect(css).toContain('overflow:hidden;');
  expect(css).toContain('pointer-events:none;');
  expect(css).toContain('.combat-defense-weapon-option:focus-visible');
  expect(css).toContain('background-image:linear-gradient(to bottom');
  expect(css).toContain('url("./assets/defense-bg-weapon.webp")');
 });
 it('keeps unavailable shield or weapon slots visible and disabled',()=>{
  const withoutShield=sample();
  withoutShield.options=withoutShield.options.filter(o=>o.kind==='weapon');
  let html=harness().drawer(withoutShield);
  expect(html).toContain('Ingen sköld');
  expect(html).toContain('class="btn combat-parry-btn combat-defense-choice shield is-disabled"');
  expect(html).toContain('disabled aria-disabled="true"');
  expect(html).toContain('&quot;weapon:blade&quot;');
  const withoutWeapon=sample();
  withoutWeapon.options=withoutWeapon.options.filter(o=>o.kind==='shield');
  html=harness().drawer(withoutWeapon);
  expect(html).toContain('Inget parervapen');
  expect(html).toContain('class="btn combat-parry-btn combat-defense-choice weapon is-disabled"');
  const noEquipment=sample();noEquipment.options=[];
  html=harness().drawer(noEquipment);
  expect((html.match(/disabled aria-disabled="true"/g)||[])).toHaveLength(2);
  expect(html).toContain('combatSubmitDefenseChoice(this,&#39;take-hit&#39;');
 });
 it('chooses the best legal FV in each slot when multiple items are available',()=>{
  const opportunity=sample();
  opportunity.options.push({key:'shield:strong',kind:'shield',name:'Tornsköld',fv:18});
  const html=harness().drawer(opportunity);
  expect(html).toContain('FV 18');
  expect(html).toContain('&quot;shield:strong&quot;');
  expect(html).not.toContain('&quot;shield:medium&quot;');
 });
 it('offers each equipped weapon with its own Runda artwork, crop, FV and key',()=>{
  const opportunity=sample();
  opportunity.options=[
   {key:'weapon:left',kind:'weapon',name:'Kortsvärd',fv:12,item:{equipId:'left',imageOverridePath:'unique/sword.png'}},
   {key:'weapon:right',kind:'weapon',name:'Dolk',fv:9,item:{equipId:'right',image_path:'dagger.png'}}
  ];
  const html=harness(opportunity,{
   window:{aleaEquipmentArt:{src:p=>'/art/'+p}},
   combatAttackProfile:()=>({currentEquipment:{leftHand:{kind:'weapon',itemId:'left'},rightHand:{kind:'weapon',itemId:'right'}}}),
   ruleWeaponForItem:i=>({image_path:'master/sword.png',combat_crop_quadrant:i.equipId==='left'?'bottom-left':'top-right'})
  }).drawer(opportunity);
  expect(html).toContain('combat-defense-multi');
  expect(html).toContain('data-combat-crop="bottom-left"');
  expect(html).toContain('/art/unique/sword.png');
  expect(html).toContain('/art/master/sword.png');
  expect(html).toContain('&quot;weapon:left&quot;');
  expect(html).toContain('&quot;weapon:right&quot;');
  expect((html.match(/combat-defense-weapon-option"/g)||[])).toHaveLength(2);
 });
 it('shows Evalins equipped kastspjut, not a generic weapon, even when it cannot parry',()=>{
  const pending=sample();
  pending.defender.name_snapshot='Evalin';
  pending.options=[{key:'shield:medium',kind:'shield',name:'Medelstor sköld',fv:13}];
  const html=harness(pending,{
   window:{aleaEquipmentArt:{src:path=>'/art/'+path}},
   combatAttackProfile:()=>({
    currentEquipment:{rightHand:{kind:'weapon',itemId:'evalin-spear'}},
    weapons:[{equipId:'evalin-spear',name:'Kastspjut',weaponCategory:'thrown',imageOverridePath:'evalin/kastspjut.png'}]
   }),
   ruleWeaponForItem:()=>({image_path:'master/kastspjut.png',combat_crop_quadrant:'bottom-right'})
  }).drawer(pending);
  expect(html).toContain('Kastspjut');
  expect(html).toContain('/art/evalin/kastspjut.png');
  expect(html).toContain('data-combat-crop="bottom-right"');
  expect(html).toContain('class="btn combat-parry-btn combat-defense-choice weapon is-disabled"');
  expect(html).not.toContain('Inget parervapen');
  expect(html).not.toContain('onclick="combatSubmitDefenseChoice(this,&#39;parry&#39;,&quot;def-1&quot;,&quot;attack-42&quot;,&quot;weapon:evalin-spear&quot;)"');
 });
 it('prefers the held weapon over a higher-FV weapon that is not equipped',()=>{
  const pending=sample();
  pending.options=[
   {key:'weapon:sword',kind:'weapon',name:'Svärd',fv:18,item:{equipId:'sword',image_path:'sword.png'}},
   {key:'weapon:spear',kind:'weapon',name:'Kastspjut',fv:9,item:{equipId:'spear',image_path:'spear.png'}}
  ];
  const html=harness(pending,{
   window:{aleaEquipmentArt:{src:path=>'/art/'+path}},
   combatAttackProfile:()=>({currentEquipment:{leftHand:{kind:'weapon',itemId:'spear'}},weapons:[{equipId:'spear',name:'Kastspjut',image_path:'spear.png'}]})
  }).drawer(pending);
  expect(html).toContain('Kastspjut');
  expect(html).toContain('FV 9');
  expect(html).toContain('/art/spear.png');
  expect(html).not.toContain('FV 18');
  expect(html).toContain('&quot;weapon:spear&quot;');
  expect(html).not.toContain('&quot;weapon:sword&quot;');
 });
 it('shows both held weapons but disables parry on the unavailable one',()=>{
  const pending=sample();
  pending.options=[{key:'weapon:dagger',kind:'weapon',name:'Dolk',fv:14,item:{equipId:'dagger',image_path:'dagger.png'}}];
  const html=harness(pending,{
   window:{aleaEquipmentArt:{src:path=>'/art/'+path}},
   combatAttackProfile:()=>({currentEquipment:{leftHand:{kind:'weapon',itemId:'spear'},rightHand:{kind:'weapon',itemId:'dagger'}},
    weapons:[{equipId:'spear',name:'Kastspjut',weaponCategory:'thrown',image_path:'spear.png'},{equipId:'dagger',name:'Dolk',image_path:'dagger.png'}]})
  }).drawer(pending);
  expect(html).toContain('combat-defense-multi');
  expect(html).toContain('/art/spear.png');
  expect(html).toContain('/art/dagger.png');
  expect(html).toContain('combat-defense-weapon-option is-disabled');
  expect(html).toContain('&quot;weapon:dagger&quot;');
  expect((html.match(/combat-defense-weapon-option"/g)||[])).toHaveLength(1);
 });
 it('does not duplicate a two-handed weapon',()=>{
  const pending=sample();
  pending.options=[{key:'weapon:staff',kind:'weapon',name:'Stav',fv:10,item:{equipId:'staff',image_path:'staff.png'}}];
  const html=harness(pending,{
   window:{aleaEquipmentArt:{src:path=>'/art/'+path}},
   combatAttackProfile:()=>({currentEquipment:{leftHand:{kind:'weapon',itemId:'staff',hands:2},rightHand:{kind:'weapon',itemId:'staff',hands:2}}}),
   ruleWeaponForItem:()=>({combat_crop_quadrant:'top-right'})
  }).drawer(pending);
  expect(html).not.toContain('combat-defense-multi');
  expect(html).toContain('combat-defense-item-art twohand');
 });
 it('escapes untrusted names and attribute arguments',()=>{
  const opportunity=sample();
  opportunity.options[0].name='<img src=x onerror=alert(1)>';
  const html=harness().drawer(opportunity);
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img src=x');
 });
 it('uses one popout for desktop and mobile, below attack results on mobile',()=>{
  const html=harness(sample()).panel();
  expect(html).toContain('combat-defense-attack');
  expect(html).toContain('combat-defense-drawer');
  expect(html).not.toContain('combat-defense-mobile');
  expect(html.indexOf('combat-attack-result')).toBeLessThan(html.indexOf('combat-defense-drawer'));
  expect(html).toContain('combat-mini-duel');
  expect(css).toContain('left:calc(100% + 12px)');
  expect(css).toContain('animation:aleaDefenseDrawerEnter');
  expect(css).toContain('@media (max-width:1023px)');
  expect(css).toContain('top:calc(100% - 1px)');
  expect(css).toContain('animation:aleaDefenseMobileDrop');
  expect(css).toContain('animation:aleaDefenseMobileRetract');
  expect(css).toContain('z-index:50');
  expect(css).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
  expect(css).toContain('height:84px');
 });
 it('locks the panel during its return animation, then invokes shield parry once',async()=>{
  const opportunity=sample(),ticks=[],resolved=[],changes=[];
  const choices=[{disabled:false},{disabled:false}];
  const drawer={
   isConnected:true,
   classList:{add:v=>changes.push('add:'+v),remove:v=>changes.push('remove:'+v)},
   setAttribute:(k,v)=>changes.push(k+':'+v),
   removeAttribute:k=>changes.push('remove:'+k),
   querySelectorAll:()=>choices
  };
  const api=harness(opportunity,{
   combatCanManage:()=>true,
   chooseCombatParry:async(...args)=>resolved.push(args),
   declineCombatParry:async()=>{},
   setTimeout:(cb,ms)=>ticks.push({cb,ms}),
   window:{matchMedia:()=>({matches:false})}
  });
  const button={closest:()=>drawer};
  api.choose(button,'parry','def-1','attack-42','shield:medium');
  expect(changes).toContain('add:is-retracting');
  expect(choices.every(b=>b.disabled)).toBe(true);
  expect(ticks[0].ms).toBe(240);
  expect(resolved).toHaveLength(0);
  api.choose(button,'parry','def-1','attack-42','shield:medium');
  expect(ticks).toHaveLength(1);
  await ticks[0].cb();
  expect(resolved).toEqual([['def-1','attack-42','shield:medium']]);
  expect(choices.every(b=>!b.disabled)).toBe(true);
  expect(changes).toContain('remove:is-retracting');
 });
 it('restores disabled slots after the reaction resolves',async()=>{
  const opportunity=sample(),ticks=[];
  const choices=[{disabled:true},{disabled:false},{disabled:false}];
  const drawer={
   isConnected:true,
   classList:{add:()=>{},remove:()=>{}},
   setAttribute:()=>{},removeAttribute:()=>{},
   querySelectorAll:()=>choices
  };
  const api=harness(opportunity,{
   combatCanManage:()=>true,
   chooseCombatParry:async()=>{},
   setTimeout:cb=>ticks.push(cb),
   window:{matchMedia:()=>({matches:true})}
  });
  api.choose({closest:()=>drawer},'parry','def-1','attack-42','weapon:blade');
  expect(choices.every(c=>c.disabled)).toBe(true);
  await ticks[0]();
  expect(choices.map(c=>c.disabled)).toEqual([true,false,false]);
 });
 it('retracts after choosing to take the hit, without delaying reduced-motion mode',async()=>{
  const opportunity=sample(),ticks=[],resolved=[];
  const api=harness(opportunity,{
   combatCanManage:()=>true,
   chooseCombatParry:async()=>{throw Error('Unexpected parry')},
   declineCombatParry:async(...args)=>resolved.push(args),
   setTimeout:(cb,ms)=>ticks.push({cb,ms}),
   window:{matchMedia:()=>({matches:true})}
  });
  api.choose(null,'take-hit','def-1','attack-42');
  expect(ticks[0].ms).toBe(0);
  await ticks[0].cb();
  expect(resolved).toEqual([['def-1','attack-42']]);
 });
 it('offers no drawer if no legal reaction is pending and preserves Expert rules',()=>{
  expect(harness(null).panel()).toBe('');
  expect(runtime).toContain('if(!combatCanParryAttack(defender))return null;');
  expect(runtime).toContain('combatHasUnusedAction(defender)');
  expect(runtime).toContain('async function chooseCombatParry(');
  expect(runtime).toContain('async function declineCombatParry(');
 });
});
