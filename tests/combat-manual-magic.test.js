import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function section(start,end){
 const i=rt.indexOf(start),j=rt.indexOf(end,i+start.length);
 if(i<0||j<i)throw Error('Kan inte hitta magikod '+start);
 return rt.slice(i,j)
}
describe('Besvärjelser utan automatisk effekt i strid',()=>{
 const bindingCode=section('function combatMagicCastingRules(', 'function combatMagicDamageFormula(');
 const context={combatIsSummoningSpell:()=>false,
  combatSpellEffectProfile:()=>({category:'none',effect:null,target:null}),
  combatMagicRuleProfile:()=>({category:'none'})};
 runInNewContext(bindingCode+'this.magicBinding=combatMagicBinding;this.preflight=combatMagicCastPreflight;this.casting=combatMagicCastingRules;',context);
 test('okänd besvärjelse tillåts med SL-styrd effekt men behåller regler för FV, EG och PSY',()=>{
  const spell={name:'FINNA VATTEN',fv:15,school_fv:15};
  expect(context.magicBinding(spell)).toMatchObject({kind:'manual',supported:true});
  expect(context.preflight({current_psy:10},spell,2)).toMatchObject({
   valid:true,effect_grade:2,psy_cost:2,casting:{resolve_round_offset:1,cl_modifier:-2}
  });
  expect(context.preflight({current_psy:1},spell,2).valid).toBe(false);
  expect(context.preflight({current_psy:10},spell,16).valid).toBe(false);
 });
 test('ritual släpps igenom endast med tydlig SL-markering; K är fortfarande kvick',()=>{
  expect(context.magicBinding({name:'VÄDERKONTROLL (R)',fv:15,ritual:true})).toMatchObject({
   kind:'manual',supported:true,ritual:true
  });
  expect(context.magicBinding({name:'TROLLDOM (F, R)',fv:15})).toMatchObject({kind:'manual',ritual:true});
  expect(context.casting({name:'DISTRAKTION (K)',kvick:true},2).resolve_round_offset).toBe(0);
  expect(context.casting({name:'FINNA VATTEN'},2).resolve_round_offset).toBe(1);
 });
 test('verifierad skade-, status- och områdesmagi behåller sina automatiska kopplingar',()=>{
  expect(context.magicBinding({name:'ELD (F)',damage_text:'1T6 per EG'}).kind).toBe('damage');
  expect(context.magicBinding({name:'FLYGA'}).kind).toBe('status');
  expect(context.magicBinding({name:'DIMMA'}).kind).toBe('area');
  expect(context.magicBinding({name:'GASMOLN (F)',damage_text:'Gift (special)'}).kind).toBe('manual');
 });
 test('SL-val visas utan falskt påstående om att magin saknas',()=>{
  const choose=section('function combatSpellChooserHtml(', 'async function combatMagicButton(');
  const ui={combatSpellOptions:()=>[{rule_id:'test',name:'FINNA VATTEN',fv:15}],
   combatSpellKey:s=>s.rule_id,combatMagicRuleProfile:()=>({category:'none'}),
   combatMagicBinding:context.magicBinding,escAttr:s=>String(s)};
  runInNewContext(choose+'this.render=combatSpellChooserHtml;',ui);
  const html=ui.render({id:'a'},{source_data:{effect_grade:1}});
  expect(html).toContain('SL avgör effekten');
  expect(html).toContain('FINNA VATTEN');
  expect(html).not.toContain('Saknar verifierad effektkoppling');
 });
});
describe('Manuellt kast: färdighetsslag, PSY, logg – inga påhittade effekter',()=>{
 const source=section('async function combatCastManualSpell(', 'async function combatCastStatusSpell(');
 async function simulate(outcome,success){
  const writes=[],spent=[],alerts=[];
  const actor={id:'actor',name_snapshot:'Eldra Rödglöd',current_psy:99};
  const action={id:'action1',source_data:{spell_name:'FINNA VATTEN',
   spell_fv:15,effect_grade:2,magic_binding:{kind:'manual',supported:true}}};
  const env={activeCombat:{id:'combat1',round_number:3},centralCampaignId:'campaign1',
   combatCannotAct:()=>false,
   combatExpertRoll:async(label,fv)=>{expect(fv).toBe(13);return {outcome,success,roll:7,confirmation_roll:null}},
   combatMagicPsyCost:(result,eg)=>result==='perfect'?Math.max(1,Math.ceil(eg/2)):success?eg:1,
   combatSpendMagicPsy:async(_actor,cost)=>spent.push(cost),
   combatAwardSpellErf:async()=>null,
   combatShowOutcomeOverlay:(...args)=>alerts.push(args),
   combatOutcomeLabel:s=>s,
   dbJson:async(path,opts)=>{writes.push({path,method:opts.method,body:JSON.parse(opts.body)});return []},
   loadActiveCombat:async()=>null};
  runInNewContext(source+'this.cast=combatCastManualSpell;',env);
  await env.cast(actor,action);
  return {writes,spent,alerts};
 }
 test('lyckat kast avslutar handlingen med kostnad EG och SL-anteckning',async()=>{
  const {writes,spent,alerts}=await simulate('success',true);
  expect(spent).toEqual([2]);expect(alerts).toHaveLength(1);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toMatchObject({method:'PATCH',body:{status:'resolved',result:{
   success:true,manual_effect:true,effect_applied:false,gm_resolution_required:true,
   fv:13,psy_cost:2,effect_grade:2}}});
  expect(writes[1]).toMatchObject({path:'combat_log',method:'POST',body:{event_type:'spell_manual'}});
  expect(writes[1].body.message).toContain('SL avgör effekten');
 });
 test('misslyckat kast drar en PSY och tilldelar ingen effekt',async()=>{
  const {writes,spent}=await simulate('fail',false);
  expect(spent).toEqual([1]);
  expect(writes[0].body.result).toMatchObject({success:false,effect_applied:false,
   gm_resolution_required:false,psy_cost:1});
 });
 test('perfekt kast använder halverad PSY-kostnad',async()=>{
  const {writes,spent}=await simulate('perfect',true);
  expect(spent).toEqual([1]);
  expect(writes[0].body.result).toMatchObject({outcome:'perfect',psy_cost:1});
 });
});
