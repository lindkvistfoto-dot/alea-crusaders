import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function section(start,end){
 const from=rt.indexOf(start),to=rt.indexOf(end,from+start.length);
 if(from<0||to<from)throw Error('Missing HELA code '+start);
 return rt.slice(from,to)
}
function harness(start,end,ctx,names){
 const e={...ctx};
 runInNewContext(section(start,end)+'\n'+names.map(n=>'this.'+n+'='+n+';').join('\n'),e);
 return e
}
const actor={id:'mage',q:0,r:0,status:'active',name_snapshot:'Nox',current_kp:11,max_kp:19};
const far={id:'far',q:3,r:0,status:'active',name_snapshot:'Astrid'};
const neighbor={id:'neighbor',q:1,r:0,status:'active',name_snapshot:'Lyra'};
const action={id:'cast1',status:'resolved',combatant_id:actor.id,round_number:1,source_data:{magic_binding:{kind:'heal'},spell_name:'HELA'},result:{
 success:true,outcome:'success',roll:8,fv:15,effect_grade:1,psy_cost:1,target_name:'Nox',
 healing_target_id:actor.id,healing_pending:true,healing_applied:false}};
const range=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
function targetHarness(combatants){
 const ctx={combatSpellEffectTargets:(caster)=>combatants.filter(c=>c.status==='active'&&range(caster,c)<=1)};
 return harness('function combatHealingTarget(', 'function combatMagicTargetChooserHtml(',ctx,['combatHealingTarget']);
}
function applyHarness(overrides={}){
 const combatants=[{...actor}],combatActions=[structuredClone(action)],writes=[];
 const input={value:'6'},button={disabled:false};
 const document={getElementById:id=>id.startsWith('combatHealAmount-')?input:id.startsWith('combatHealApply-')?button:null};
 let loads=0;const alerts=[];
 const ctx={combatCanManage:()=>true,activeCombat:{id:'combat1',round_number:1},
  combatants,combatActions,document,alert:msg=>alerts.push(msg),centralCampaignId:'campaign1',
  dbJson:async(url,options)=>{
   const body=JSON.parse(options.body);writes.push({url,body});
   if(url.startsWith('combatants')){combatants[0].current_kp=body.current_kp;return[{id:'mage',current_kp:body.current_kp,status:'active'}]}
   return []
  },
  loadActiveCombat:async()=>{loads++},...overrides};
 const e=harness('async function combatApplySpellHealing(', 'async function combatCastStatusSpell(',ctx,['combatApplySpellHealing']);
 return {e,combatants,combatActions,writes,alerts,input,button,get loads(){return loads}}
}

describe('HELA · självläkning och tydligt KP-resultat',()=>{
 it('läker automatiskt magikern om ingen annan kan beröras, även om föregående mål var någon annan',()=>{
  const t=targetHarness([actor,far]);
  expect(t.combatHealingTarget(actor,action,far.id)?.id).toBe(actor.id)
 });
 it('kräver valt giltigt mål om någon annan står intill',()=>{
  const t=targetHarness([actor,neighbor]);
  expect(t.combatHealingTarget(actor,action,neighbor.id)?.id).toBe(neighbor.id);
  expect(t.combatHealingTarget(actor,action,'far')).toBe(null)
 });
 it('lyckad HELA återställer max till saknade KP och visar korrekt före/efter',async()=>{
  const t=applyHarness();
  await t.e.combatApplySpellHealing(action.id);
  expect(t.combatants[0].current_kp).toBe(17);
  expect(t.writes.find(w=>w.url.startsWith('combat_actions'))?.body.result).toMatchObject({
   healing_amount:6,healing_restored:6,kp_before:11,kp_after:17,kp_max:19,healing_applied:true,healing_pending:false
  });
  expect(t.writes.find(w=>w.url==='combat_log')?.body.message).toContain('6 KP (11 → 17 / 19)');
  expect(t.loads).toBe(1)
 });
 it('helar högst upp till max och visar skillnaden mellan angiven läkning och faktisk KP',async()=>{
  const t=applyHarness();t.input.value='15';
  await t.e.combatApplySpellHealing(action.id);
  const r=t.writes.find(w=>w.url.startsWith('combat_actions'))?.body.result;
  expect(t.combatants[0].current_kp).toBe(19);
  expect(r.healing_amount).toBe(15);expect(r.healing_restored).toBe(8)
 });
 it('full KP kan ge noll faktiskt återställda, utan att öka max-KP',async()=>{
  const t=applyHarness();
  t.combatants[0].current_kp=19;t.input.value='5';
  await t.e.combatApplySpellHealing(action.id);
  expect(t.writes.some(w=>w.url.startsWith('combatants'))).toBe(false);
  expect(t.writes.find(w=>w.url.startsWith('combat_actions')).body.result.healing_restored).toBe(0)
 });
 it('misslyckad, blockerad eller redan behandlad läkning får inte tilldelas',async()=>{
  for(const changed of [{success:false},{blocked_by_beskyddare:true},{healing_applied:true}]){
   const t=applyHarness();Object.assign(t.combatActions[0].result,changed);
   await t.e.combatApplySpellHealing(action.id);
   expect(t.writes).toHaveLength(0)
  }
 });
 it('icke-SL får inte tilldela läkning',async()=>{
  const t=applyHarness({combatCanManage:()=>false});
  await t.e.combatApplySpellHealing(action.id);
  expect(t.writes).toHaveLength(0)
 });
 it('felaktig inmatning avbryter läkning innan databasen ändras',async()=>{
  const t=applyHarness();t.input.value='negativ';
  await t.e.combatApplySpellHealing(action.id);
  expect(t.writes).toHaveLength(0);
  expect(t.alerts.length).toBe(1)
 });
 it('resultatkortet visar SL-knapp och numerisk läkning efter den tillämpats',()=>{
  expect(rt).toContain('Tillämpa läkning');
  expect(rt).toContain('KP återställda');
  expect(rt).toContain("escAttr(result.kp_before??'—')");
  expect(rt).toContain('healing_pending&&combatCanManage()')
 })
});
