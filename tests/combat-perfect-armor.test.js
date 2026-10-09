import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
const begin=runtime.indexOf('async function combatResolveDamage(');
const finish=runtime.indexOf('function combatDamageResultHtml(',begin);
const renderFinish=runtime.indexOf('function combatParryResultHtml(',finish);
if(begin<0||finish<begin||renderFinish<finish)throw Error('Damage functions not found');
const damageSource=runtime.slice(begin,renderFinish);
const resultBegin=runtime.indexOf('function combatAttackResultHtml(');
const resultEnd=runtime.indexOf('function combatOutcomeEarnsErf(',resultBegin);
function harness({ward=0,armor=5,before=11}={}){
 const writes=[];
 const env={
  activeCombat:{id:'battle-1',round_number:1},centralCampaignId:'campaign-1',
  combatParseDamageFormula(text){if(text==='1T6+1')return {qty:1,sides:6,modifier:1,formula:text};
   if(text==='Ingen')return {qty:0,sides:0,modifier:0,formula:text};return null},
  combatDamageBonusSpec(){return {qty:0,sides:0,modifier:0,formula:'Ingen'}},
  combatArmorAbsorption(){return {absorption:armor,names:['Ringbrynja']}},
  combatProtectionValue(){return {points:ward,names:ward?['Beskyddare']:[]}},
  combatRollDice:async()=>({rolls:[{value:3}]}),
  combatNumber:(v,fallback=0)=>v==null?fallback:Number(v),
  dbJson:async(path,options)=>{const payload=JSON.parse(options.body);writes.push({path,payload});
   return path.startsWith('combatants?')?[{current_kp:payload.current_kp,status:payload.status||'active'}]:[]},
  escAttr:x=>String(x),combatOutcomeMeta:outcome=>({icon:'★',label:outcome}),
  combatHitLocationResultHtml:()=>'',combatHitLocationCameraHtml:()=>'',combatFumbleResultHtml:()=>'',combatParryResultHtml:()=>'', 
  Math,Date,Number,String,Array
 };
 runInNewContext(damageSource+'\n'+runtime.slice(resultBegin,resultEnd)+'\nthis.api={damage:combatResolveDamage,display:combatDamageResultHtml,attack:combatAttackResultHtml};',env);
 const actor={id:'evalin',name_snapshot:'Evalin Hugger',state:{}};
 const target={id:'kvaargh',name_snapshot:"Kva'argh",current_kp:before,status:'active'};
 const weapon={name:'Kastspjut',damage:'1T6+1'};
 return {api:env.api,actor,target,weapon,writes};
}
describe('Perfect hit penetrates armor v0.35.32',()=>{
 it('perfect Kastspjut hits for 7 without the 5-point ring mail, and flags bypass in event log',async()=>{
  const x=harness();
  const dmg=await x.api.damage(x.actor,x.target,x.weapon,true,{label:'Vänster arm'},true);
  expect(dmg).toMatchObject({gross_damage:7,armor_absorption:0,armor_original_absorption:5,
   armor_ignored:true,net_damage:7,kp_before:11,kp_after:4});
  expect(x.target.current_kp).toBe(4);
  expect(x.writes.find(w=>w.path==='combat_log').payload.message).toContain('ABS 0 [ingen rustning]');
  expect(x.api.display(dmg)).toContain('<span>Rustning</span><b>0</b><small>Ignorerad</small>');
  const card=x.api.attack({action_type:'attack',result:{outcome:'perfect',full_damage:true,
   roll:1,fv:12,damage:dmg}});
  expect(card).toContain('FULL SKADA');
  expect(card).toContain('INGEN RUSTNING');
 });
 it('a special strike has maximum damage but does NOT bypass armor',async()=>{
  const x=harness();
  const dmg=await x.api.damage(x.actor,x.target,x.weapon,true,{label:'Vänster arm'},false);
  expect(dmg).toMatchObject({gross_damage:7,armor_absorption:5,armor_ignored:false,net_damage:2,kp_after:9});
  expect(x.api.attack({action_type:'attack',result:{outcome:'special',full_damage:true,damage:dmg}})).not.toContain('INGEN RUSTNING');
 });
 it('ordinary strike subtracts armor, but wards still apply to perfect strikes',async()=>{
  const regular=harness();
  const dmg=await regular.api.damage(regular.actor,regular.target,regular.weapon,false,null,false);
  expect(dmg).toMatchObject({gross_damage:4,armor_absorption:5,net_damage:0,kp_after:11});
  const perfect=harness({ward:2});
  const r=await perfect.api.damage(perfect.actor,perfect.target,perfect.weapon,true,null,true);
  expect(r).toMatchObject({gross_damage:7,armor_absorption:0,effect_protection:2,net_damage:5,kp_after:6});
 });
 it('delayed parry resolution, ranged attacks and damage spells forward the perfect result',()=>{
  expect(runtime).toContain("attack.result?.full_damage===true,attackResult.hit_location,attack.result?.outcome==='perfect'");
  expect(runtime).toContain("opportunity.attack.result?.full_damage===true,attackResult.hit_location,opportunity.attack.result?.outcome==='perfect'");
  expect(runtime).toContain("weapon,fullDamage,result.hit_location,outcome==='perfect'");
  expect(runtime).toContain("pseudoWeapon,fullDamage,null,outcome==='perfect'");
  expect(runtime).toContain("result.full_damage===true,null,result.outcome==='perfect'");
  expect(css).toContain('.combat-no-armor-badge');
 });
 it('a historical perfect result with armor subtracted is not mislabeled as ignoring it',()=>{
  const x=harness();
  const card=x.api.attack({action_type:'attack',result:{outcome:'perfect',full_damage:true,
    damage:{armor_absorption:5,net_damage:2,kp_before:11,kp_after:9}}});
  expect(card).not.toContain('INGEN RUSTNING');
 });
});
