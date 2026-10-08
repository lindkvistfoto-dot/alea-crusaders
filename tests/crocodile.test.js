import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261008103000_crocodile_periodic_damage.sql',import.meta.url),'utf8');
const ward={id:'ward',name:'Skyddsfält',active:true,modifiers:{type:'protection',damage_kind:'all'}};
const poisonWard={id:'poison_ward',name:'Giftskydd',active:true,modifiers:{type:'protection',damage_kind:'poison'}};
const fireWard={id:'fire_ward',name:'Eldskydd',active:true,modifiers:{type:'protection',damage_kind:'fire'}};
const poison={id:'poison',name:'Gift',active:true,modifiers:{type:'damage_over_time',damage_kind:'poison'}};
const definitions=[ward,poisonWard,fireWard,poison];
const hero={id:'hero',name_snapshot:'Hjälte',current_kp:20,status:'active'};
const foe={id:'foe',name_snapshot:'Fiende'};
const effect=(id,points,key='protection_points',rest={})=>({
 id:'effect-'+id,effect_id:id,combatant_id:'hero',status:'active',applied_round:3,
 parameters:{[key]:points},...rest
});
const start=src.indexOf('function combatProtectionValue(');
const stop=src.indexOf('let combatEffectRegistry=',start);
const damageFrom=src.indexOf('async function combatResolveDamage(');
const damageTo=src.indexOf('function combatDamageResultHtml(',damageFrom);
if(start<0||stop<=start||damageFrom<0||damageTo<=damageFrom)throw Error('KROKODIL functions unavailable');
function sandbox(effects=[]){
 const writes=[];
 const ctx={
  combatActiveEffects:effects,combatEffectRegistry:definitions,
  combatEffectIsActive:e=>e.status==='active'&&e.applied_round<=3&&(e.expires_round==null||e.expires_round>=3),
  combatEffectDefinition:e=>definitions.find(d=>d.id===e.effect_id),
  combatCanManage:()=>true,activeCombat:{id:'combat',round_number:3},centralCampaignId:'campaign',
  combatParseDamageFormula:()=>({qty:0,sides:0,modifier:8,formula:'8'}),
  combatDamageBonusSpec:()=>({qty:0,sides:0,modifier:0,formula:'Ingen'}),
  combatArmorAbsorption:()=>({absorption:2,names:['Läder']}),
  combatNumber:(value,fallback=0)=>value==null?fallback:Number(value),
  combatants:[hero,foe],
  dbJson:async(path,options)=>{
   writes.push({path,options});
   if(path.startsWith('combatants?'))return [{current_kp:JSON.parse(options.body).current_kp,status:JSON.parse(options.body).status||'active'}];
   if(path.startsWith('rpc/'))return {applied:true,net:4,round:3};
   return null
  },
  encodeURIComponent
 };
 runInNewContext(src.slice(start,stop)+'\n'+src.slice(damageFrom,damageTo)+
 'this.api={combatProtectionValue,combatTickOngoingEffects,combatResolveDamage};',ctx);
 return {api:ctx.api,writes}
}
describe('KROKODIL: periodic poison, ongoing damage and typed wards',()=>{
 test('strongest matching ward wins, unrelated wards do not stack',()=>{
  const {api}=sandbox([effect('ward',3),effect('poison_ward',5),effect('fire_ward',4)]);
  expect(api.combatProtectionValue(hero,'poison').points).toBe(5);
  expect(api.combatProtectionValue(hero,'fire').points).toBe(4);
  expect(api.combatProtectionValue(hero,'physical').points).toBe(3);
  expect(api.combatProtectionValue(hero,'magic').points).toBe(3)
 });
 test('inactive, wrong-target and expired wards are not applied',()=>{
  const effects=[effect('ward',9,'protection_points',{expires_round:2}),effect('poison_ward',8,'protection_points',{combatant_id:'foe'})];
  expect(sandbox(effects).api.combatProtectionValue(hero,'poison').points).toBe(0)
 });
 test('missing and malformed ward values are ignored',()=>{
  const effects=[effect('ward','broken'),effect('poison_ward',-1),effect('fire_ward',10000)];
  expect(sandbox(effects).api.combatProtectionValue(hero,'poison').points).toBe(0);
  expect(sandbox(effects).api.combatProtectionValue(hero,'fire').points).toBe(0)
 });
 test('physical attack damage subtracts armor and matching ward, then saves KP',async()=>{
  const victim={...hero};
  const {api,writes}=sandbox([effect('ward',3)]);
  const damage=await api.combatResolveDamage(foe,victim,{name:'Klubba',damage:'8'},true,null);
  expect(damage.gross_damage).toBe(8);
  expect(damage.armor_absorption).toBe(2);
  expect(damage.effect_protection).toBe(3);
  expect(damage.net_damage).toBe(3);
  expect(damage.kp_before).toBe(20);
  expect(damage.kp_after).toBe(17);
  expect(writes.some(w=>w.path.startsWith('combatants?')&&JSON.parse(w.options.body).current_kp===17)).toBe(true);
  expect(writes.some(w=>w.path==='combat_log'&&JSON.parse(w.options.body).details.effect_protection===3)).toBe(true)
 });
 test('typed poison or fire ward does not reduce an ordinary physical attack',async()=>{
  const {api}=sandbox([effect('poison_ward',5),effect('fire_ward',5)]);
  const damage=await api.combatResolveDamage(foe,{...hero},{name:'Klubba',damage:'8'},true,null);
  expect(damage.net_damage).toBe(6);
  expect(damage.effect_protection).toBe(0)
 });
 test('magical fire damage uses fire ward and generic ward',async()=>{
  const {api}=sandbox([effect('fire_ward',4),effect('ward',2)]);
  const damage=await api.combatResolveDamage(foe,{...hero},{name:'Eld',damage:'8',damage_kind:'fire'},true,null);
  expect(damage.net_damage).toBe(2);
  expect(damage.protection_names.includes('Eldskydd')).toBe(true)
 });
 test('periodic processing invokes only active damage effects for the current combatant',async()=>{
  const {api,writes}=sandbox([effect('poison',2,'damage_per_round'),effect('ward',2)]);
  const result=await api.combatTickOngoingEffects(hero,3);
  expect(result.length).toBe(1);
  const call=writes.filter(w=>w.path==='rpc/resolve_combat_dot');
  expect(call.length).toBe(1);
  expect(JSON.parse(call[0].options.body)).toEqual({p_effect_id:'effect-poison',p_round:3})
 });
 test('periodic processing ignores dead/removed/expired effect assignments',async()=>{
  const {api,writes}=sandbox([effect('poison',2,'damage_per_round',{status:'removed'})]);
  expect(await api.combatTickOngoingEffects(hero,3)).toEqual([]);
  expect(writes.some(w=>w.path.startsWith('rpc/'))).toBe(false)
 });
 test('server mutation validates campaign GM, active actor and expected round',()=>{
  expect(sql).toContain('private.is_campaign_gm');
  expect(sql).toContain('v_effect.instance_actor IS DISTINCT FROM v_effect.combatant_id');
  expect(sql).toContain('v_effect.instance_round<>p_round');
  expect(sql).toContain("v_effect.instance_status<>'active'");
  expect(sql).toContain('FOR UPDATE OF e,c,i')
 });
 test('database function is designed for at-most-once ticks and atomic KP audit',()=>{
  expect(sql).toContain("'last_tick_round'");
  expect(sql).toContain("v_raw::integer>=p_round");
  expect(sql).toContain("jsonb_set(coalesce(parameters,'{}'::jsonb),'{last_tick_round}',to_jsonb(p_round))");
  expect(sql).toContain('UPDATE public.combatants SET current_kp');
  expect(sql).toContain('INSERT INTO public.combat_log');
  expect(sql).toContain("RAISE EXCEPTION 'Effektens skada per SR");
 });
 test('SQL protection matches type and uses strongest applicable value',()=>{
  expect(sql).toContain("d.modifiers->>'damage_kind' IN ('all',v_kind)");
  expect(sql).toContain('v_protection:=greatest(v_protection,v_raw::integer)');
  expect(sql).toContain('v_net:=greatest(0,v_base-v_protection)')
 });
 test('effect registry seeds reusable records without guessing Expert formulas',()=>{
  for(const name of ['condition_poison','condition_burning','condition_bleeding','condition_ward','condition_antipoison','condition_fire_shield'])expect(sql).toContain("'"+name+"'");
  expect(sql).toContain('ON CONFLICT (code) DO NOTHING');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.resolve_combat_dot');
  expect(sql).toContain('TO authenticated')
 });
 test('GM configures explicit damage and shields with persistent parameter payload',()=>{
  expect(src).toContain('combatEffectDamagePerRound');
  expect(src).toContain('combatEffectProtectionPoints');
  expect(src).toContain('damage_per_round:Number(dotRaw)');
  expect(src).toContain('protection_points:Number(wardRaw)');
  expect(src).toContain('await combatTickOngoingEffects(actor,currentRound);')
 });
});
