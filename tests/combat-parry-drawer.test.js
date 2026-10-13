import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js'),css=read('features/combat/attack-participants.css');
const begin=runtime.indexOf('function combatDefenseReactionHtml('),
 end=runtime.indexOf('function combatTurnPortraitHtml(',begin);
if(begin<0||end<=begin)throw Error('Combat defense reaction helpers missing');

const escAttr=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);

function harness(opportunity=null){
 const context={
  escAttr,
  combatAntimagicPromptHtml:()=>'',combatSpellCastPanelHtml:()=>'',combatPendingParryOpportunity:()=>opportunity,
  combatAttackResultHtml:action=>'<div class="combat-attack-result">'+escAttr(action.id)+'</div>',
  combatMiniParticipantHtml:(role,person)=>'<div>'+role+' '+escAttr(person.name_snapshot)+'</div>',
  combatActiveActor:()=>null,combatChosenAction:()=>null,combatActionDefinition:()=>null
 };
 runInNewContext(runtime.slice(begin,end)+
  '\nthis.exports={drawer:combatDefenseReactionHtml,mobile:combatDefenseMobileHtml,panel:combatAttackPanelHtml};',context);
 return context.exports;
}

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
describe('Desktop defense reaction slides out from the attack panel',()=>{
 it('renders shield and weapon defenses as separate, executable choices',()=>{
  const html=harness().drawer(sample());
  expect(html).toContain('combat-defense-drawer');
  expect(html).toContain('FÖRSVARSREAKTION');
  expect(html).toContain("Kva'argh");
  expect(html).toContain('Sköldparering');
  expect(html).toContain('Vapenparering');
  expect(html).toContain('FV 13');
  expect(html).toContain('FV 15');
  expect(html).toContain('chooseCombatParry(&quot;def-1&quot;,&quot;attack-42&quot;,&quot;shield:medium&quot;)');
  expect(html).toContain('chooseCombatParry(&quot;def-1&quot;,&quot;attack-42&quot;,&quot;weapon:blade&quot;)');
  expect(html).toContain('declineCombatParry(&quot;def-1&quot;,&quot;attack-42&quot;)');
 });
 it('escapes option text and ids inside the generated controls',()=>{
  const opportunity=sample();
  opportunity.options[0].name='<img src=x onerror=alert(1)>';
  const html=harness().drawer(opportunity);
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img src=x');
 });
 it('keeps existing mobile inline controls but uses the drawer on desktop',()=>{
  const source=harness(sample()).panel();
  expect(source).toContain('combat-defense-attack');
  expect(source).toContain('combat-defense-drawer');
  expect(source).toContain('combat-defense-mobile');
  expect(source).toContain('combat-attack-result');
  expect(source).toContain('combat-duel');
  expect(css).toContain('@media (min-width:1024px)');
  expect(css).toContain('.combat-defense-attack > .combat-defense-mobile');
  expect(css).toContain('display:none;');
  expect(css).toContain('left:calc(100% + 12px)');
  expect(css).toContain('animation:aleaDefenseDrawerEnter');
  expect(css).toContain('z-index:40');
 });
 it('does not render defense popup for an attack without an eligible reaction',()=>{
  expect(harness(null).panel()).toBe('');
  expect(runtime).toContain('if(!combatCanParryAttack(defender))return null;');
  expect(runtime).toContain('combatHasUnusedAction(defender)');
  expect(runtime).toContain('async function chooseCombatParry(');
  expect(runtime).toContain('async function declineCombatParry(');
 });
});
