import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js'),css=read('features/combat/attack-participants.css');
const begin=runtime.indexOf('function combatDefenseReactionHtml('),
 end=runtime.indexOf('function combatTurnPortraitHtml(',begin);
if(begin<0||end<=begin)throw Error('Combat defense reaction helpers missing');
const code=runtime.slice(begin,end);
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
 runInNewContext(code+'\nthis.exports={drawer:combatDefenseReactionHtml,panel:combatAttackPanelHtml,choose:combatSubmitDefenseChoice};',env);
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
