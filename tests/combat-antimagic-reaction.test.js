import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const start=source.indexOf('function combatAntimagicOptions('),end=source.indexOf('async function chooseCombatParry(',start);
if(start<0||end<start)throw Error('Antimagic helpers missing');
const code=source.slice(start,end);
function harness(known=true,spent=false){
 const caster={id:'caster',name_snapshot:'Eldra',side:'enemies',status:'active',q:0,r:0},
  target={id:'target',name_snapshot:'Nox',side:'heroes',status:'active',q:1,r:0,current_psy:20};
 const spell={name:'ANTIMAGI',fv:15,school_fv:15,rule_id:'anti',range_text:'Sx10 rutor'};
 const action={id:'spell',combatant_id:'caster',round_number:2,status:'pending',
  source_data:{spell_name:'ELD (F)',effect_grade:2,damage_text:'1T6 per EG'},
  target_combatant_id:'target',
  result:{success:true,roll:4,effect_grade:2,full_damage:false,awaiting_antimagic:true,antimagic_kind:'damage',antimagic_target_ids:['target']}};
 const writes=[],damage=[];
 const env={activeCombat:{id:'fight',round_number:2},centralCampaignId:'camp',
  combatants:[caster,target],combatActions:[action],combatActiveEffects:[],combatEffectRegistry:[],
  combatSpellOptions:()=>known?[spell]:[],combatCannotReact:()=>false,combatHasUnusedAction:()=>!spent,
  combatChosenAction:()=>null,combatSpellRangeHexes:()=>10,combatAxialDistance:()=>1,combatHasLineOfSight:()=>true,
  combatMagicCastPreflight:()=>({valid:true}),combatExpertRoll:async()=>({success:true,outcome:'success',roll:7}),
  combatMagicPsyCost:()=>1,combatSpendMagicPsy:async()=>{},combatAwardSpellErf:async()=>null,
  combatRollDice:async()=>({rolls:[{value:12}]}),combatOutcomeLabel:s=>s,combatShowOutcomeOverlay:()=>{},
  combatMagicTargetAllocations:()=>[],combatMagicDamageFormula:()=> '2T6',
  combatResolveDamage:async(a,victim)=>{damage.push(victim.id);return {total:7}},
  combatLoadEffects:async()=>{},loadActiveCombat:async()=>{},
  combatCanManage:()=>true,activeUser:()=>({id:'gm'}),escAttr:s=>String(s),
  document:{getElementById:()=>({value:'2'})},crypto:{randomUUID:()=> 'new-reaction'},alert:()=>{},
  dbJson:async(path,options={})=>{writes.push({path,body:options.body?JSON.parse(options.body):null});return path.includes('status=eq.pending')?[{id:'spell'}]:[]}
 };
 runInNewContext(code+'this.api={combatAntimagicOptions,combatPendingAntimagic,combatAntimagicEgResistance,combatAntimagicPromptHtml,combatChooseAntimagic,combatDeclineAntimagic};',env);
 return {env,caster,target,action,writes,damage,api:env.api}
}
describe('Antimagi som reaktion',()=>{
 test('erbjuds bara om den är känd och handling kvarstår',()=>{
  expect(harness().api.combatPendingAntimagic().options).toHaveLength(1);
  expect(harness(false).api.combatPendingAntimagic().options).toHaveLength(0);
  expect(harness(true,true).api.combatPendingAntimagic().options).toHaveLength(0);
 });
 test('motstånd använder EG mot EG och kan reflektera',()=>{
  const a=harness().api;
  expect(a.combatAntimagicEgResistance(2,2,12)).toMatchObject({target:10,penetrates:false});
  expect(a.combatAntimagicEgResistance(5,1,12)).toMatchObject({target:14,penetrates:true});
 });
 test('reaktionsrutan visar Antimagi, effektgrad och Avstå',()=>{
  const html=harness().api.combatAntimagicPromptHtml();
  expect(html).toContain('Kasta Antimagi');expect(html).toContain('Avstå Antimagi');
 });
 test('försvarsmagin förbrukar handling och reflekterar direkt skada till kastaren',async()=>{
  const x=harness();await x.api.combatChooseAntimagic('target','spell','target');
  expect(x.writes.some(w=>w.body?.source_data?.action_key==='antimagic_reaction')).toBe(true);
  expect(x.writes.some(w=>w.body?.result?.antimagic?.reflected===true)).toBe(true);
  expect(x.damage).toEqual(['caster']);
 });
 test('avstående låter besvärjelsen slå ordinarie mål',async()=>{
  const x=harness();await x.api.combatDeclineAntimagic('spell');
  expect(x.damage).toEqual(['target']);
  expect(x.writes.some(w=>w.body?.source_data?.action_key==='antimagic_reaction')).toBe(false);
 });
 test('förhindrar turbyte medan antimagi väntar och fångar effekt före upplösning',()=>{
  expect(source).toContain('!combatPendingParryOpportunity()&&!combatPendingAntimagic()');
  expect(source).toContain("await combatDeferForAntimagic(actor,action,result,[target.id],'status')");
  expect(source).toContain("await combatDeferForAntimagic(actor,action,result,affected,'area')");
  expect(source).toContain("await combatDeferForAntimagic(actor,action,result,targets.map(t=>t.target_id),'damage')");
 });
});
