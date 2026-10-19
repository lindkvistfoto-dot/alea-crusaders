import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const legacy=read('legacy/app.js'),runtime=read('features/combat/runtime.js');
const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)+a.length));
function harness(){
 const data={_dbId:'hero-source',base:{Styrka:{v:22,g:5}},derived:{Svärdshand:'Vänster'},
  currentEquipment:{leftHand:{kind:'weapon',itemId:'sword'},rightHand:{kind:'weapon',itemId:'dagger'}},
  weapons:[{equipId:'sword',name:'Svärd',handling:'1H',strengthGroup:3,fv:18},
   {equipId:'dagger',name:'Dolk',handling:'1H',strengthGroup:1,fv:16}],
  skills:[{skillId:'tva_vapen',fv:22,specializations:[{swordWeaponId:'Svärd',shieldWeaponId:'Dolk'}]}]};
 const hero={id:'hero',source_type:'character',source_id:'hero-source',status:'active',q:0,r:0,
  state:{initiative_rank:1},movement_max:10,movement_remaining:10};
 const enemy={...hero,id:'enemy',source_id:'enemy-source',state:{initiative_rank:2,attack_profile:{}}};
 const calls=[];
 const ctx={console,structuredClone,crypto:globalThis.crypto,Date,Math,Map,Set,
  window:{addEventListener:()=>{},combatUndoBeforeActorAction:async()=>({}),combatUndoAfterTurnAdvanced:async()=>{}},
  document:{addEventListener:()=>{},querySelector:()=>null},$ :()=>null,
  activeUser:()=>({id:'gm',admin:true}),centralCampaignRole:'gm',centralCampaignId:'campaign',
  activeCombat:{id:'combat',round_number:1,phase:'movement',status:'active',active_actor_id:'hero',initiative:{status:'resolved',order:['hero','enemy']}},
  combatants:[hero,enemy],combatActions:[],combatLogRows:[],combatActiveEffects:[],combatAreaEffects:[],
  chars:[data],ruleWeapons:[],ruleSkills:[],ruleSpells:[],
  escAttr:v=>String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
  ruleWeaponForItem:()=>null,
  alert:message=>{throw new Error(message)},
  dbJson:async(path,options={})=>{
   const body=options.body?JSON.parse(options.body):null;calls.push({path,body});
   if(path.startsWith('combat_instances?')&&body)Object.assign(ctx.activeCombat,body);
   if(path==='rpc/combat_advance_turn')Object.assign(ctx.activeCombat,{active_actor_id:body.p_next_actor_id,phase:body.p_next_phase,round_number:body.p_round+(body.p_new_round?1:0)});
   return [];
  }
 };
 runInNewContext(read('src/features/combat/hand-rules.js')+'\n'+
  section(legacy,'function baseGroup(','function damageBonus(')+'\n'+
  section(legacy,'function weaponSkillId(','function characterWeaponFv(')+'\n'+runtime,ctx);
 ctx.loadActiveCombat=async()=>ctx.activeCombat;
 ctx.combatTickAreaStay=async()=>calls.push({tick:'area'});
 ctx.combatTickOngoingEffects=async()=>calls.push({tick:'effects'});
 ctx.combatRollAndApplyInitiative=async()=>{};
 return {ctx,data,hero,enemy,calls};
}
function action(actor,slot='primary',type='attack',status='planned',extra={}){
 const hand=slot==='primary'?'leftHand':'rightHand',weapon=slot==='primary'?'sword':'dagger';
 return {id:actor+'-'+slot,combatant_id:actor,round_number:1,slot_key:slot,action_type:type,status,
  phase:slot==='secondary'&&type==='attack'?'late':'normal',
  source_data:{action_key:type,mode:type==='attack'?'melee':'reaction',two_weapons:true,
   combination_mode:'attack_attack',first_hand:'leftHand',hand,weapon_key:weapon,weapon_name:weapon},...extra};
}

describe('SISYPHUS real combat runtime integration',()=>{
 it('copies saved sword hand, skills and equipment at combat creation without moving refs',()=>{
  const {ctx,data}=harness(),before=JSON.stringify(data);
  const result=ctx.combatSourceStats({source_type:'character',source_id:'hero-source'},
   {characters:new Map([['hero-source',{data}]]),npcs:new Map(),monsters:new Map()});
  expect(result.attack_profile.swordHand).toBe('leftHand');
  expect(result.attack_profile.skills[0].skillId).toBe('tva_vapen');
  expect(result.attack_profile.currentEquipment.leftHand.itemId).toBe('sword');
  expect(JSON.stringify(data)).toBe(before);
 });
 it('honours saved derived hand over contradictory legacy equipment metadata',()=>{
  const {ctx,data,hero}=harness();data.currentEquipment.mainHand='right';
  expect(ctx.combatPrimaryHandWeapon(hero).equipId).toBe('sword');
  data.derived.Svärdshand='Höger';expect(ctx.combatPrimaryHandWeapon(hero).equipId).toBe('dagger');
 });
 it('uses a persisted secondary action only during the late pass',()=>{
  const {ctx,hero}=harness();ctx.combatActions=[action('hero','primary','attack','resolved'),action('hero','secondary')];
  expect(ctx.combatChosenAction(hero).slot_key).toBe('primary');
  ctx.activeCombat.phase='late';expect(ctx.combatChosenAction(hero).slot_key).toBe('secondary');
 });
 it('keeps both parry reservations available until their own incoming attack',()=>{
  const {ctx,hero}=harness();ctx.combatActions=[action('hero','primary','parry','reserved'),action('hero','secondary','parry','reserved')];
  expect(ctx.combatParryOptions(hero).map(p=>p.item.equipId)).toEqual(['sword']);
  ctx.combatActions[0].status='resolved';
  expect(ctx.combatParryOptions(hero).map(p=>p.item.equipId)).toEqual(['dagger']);
  ctx.combatActions[1].status='resolved';expect(ctx.combatCanParryAttack(hero)).toBe(false);
 });
 it('attack + parry reserves the offhand without consuming it when attacking',()=>{
  const {ctx,hero}=harness();ctx.combatActions=[action('hero','primary','attack','resolved'),action('hero','secondary','parry','reserved')];
  expect(ctx.combatCanParryAttack(hero)).toBe(true);expect(ctx.combatParryOptions(hero)[0].hand).toBe('rightHand');
 });
 it('does not change weapon or hand to compensate for a dropped selected weapon',()=>{
  const {ctx,hero}=harness(),a=action('hero');ctx.combatActions=[a];
  hero.state.dropped_weapon_keys=['sword'];
  expect(ctx.combatActionWeapon(hero,a)).toBe(null);expect(ctx.combatWeaponActionIsLegal(hero,a)).toBe(false);
 });
 it('effective STY changes invalidate grip without touching saved gear',()=>{
  const {ctx,data,hero}=harness();data.weapons[0].handling='1-2H';data.weapons[0].strengthGroup=4;
  const before=JSON.stringify(data.currentEquipment);
  ctx.combatActions=[action('hero'),action('hero','secondary')];
  expect(ctx.combatTwoWeaponContext(hero).eligible).toBe(true);
  ctx.combatEffectiveAttribute=()=>18;
  expect(ctx.combatTwoWeaponContext(hero).eligible).toBe(false);
  expect(ctx.combatParryOptions(hero)).toHaveLength(0);expect(JSON.stringify(data.currentEquipment)).toBe(before);
 });
 it('blocks switching a spent first attack into magic, other action or a fresh attack',async()=>{
  const {ctx,hero,calls}=harness();ctx.combatActions=[action('hero','primary','attack','resolved'),action('hero','secondary')];
  for(const key of ['attack','spell_cast','other'])await ctx.chooseCombatPrimaryAction(hero.id,key);
  expect(calls).toHaveLength(0);
 });
 it('full movement invalidates both secondary attacks and reserved parries',()=>{
  const {ctx,hero}=harness();ctx.combatActions=[action('hero'),action('hero','secondary','parry','reserved')];hero.movement_remaining=4;
  expect(ctx.combatHasUnusedAction(hero)).toBe(false);expect(ctx.combatCanParryAttack(hero)).toBe(false);
 });
 it('a cast carried from an earlier SR blocks new dual actions and weapon reactions',async()=>{
  const {ctx,hero,calls}=harness();ctx.activeCombat.round_number=2;
  ctx.combatActions=[{...action('hero','primary','spell'),source_data:{action_key:'spell_cast',casting_spell:true}}];
  await ctx.chooseCombatTwoWeapons(hero.id,'parry_parry');
  expect(calls).toHaveLength(0);expect(ctx.combatParryAction(hero)).toBe(null);
 });
 it('Antimagi cannot consume a dual-weapon slot while normal availability is preserved',()=>{
  const {ctx,hero,enemy}=harness();hero.side='heroes';enemy.side='enemies';hero.current_psy=10;
  ctx.combatSpellOptions=()=>[{name:'ANTIMAGI',school_fv:12,range_text:'20'}];
  ctx.combatSpellRangeHexes=()=>20;ctx.combatFootprintDistance=()=>1;ctx.combatHasLineOfSight=()=>true;
  expect(ctx.combatAntimagicOptions(enemy,[hero.id])).toHaveLength(1);
  ctx.combatActions=[action('hero','primary','parry','reserved'),action('hero','secondary','parry','reserved')];
  expect(ctx.combatAntimagicOptions(enemy,[hero.id])).toHaveLength(0);
 });
 it('enters late pass after everyone, preserves SR and ticks effects only once',async()=>{
  const {ctx,hero,enemy,calls}=harness();
  ctx.combatActions=[action('hero','primary','attack','resolved'),action('hero','secondary')];ctx.activeCombat.active_actor_id=enemy.id;
  await ctx.endCombatTurn(null,enemy.id);
  expect(ctx.activeCombat).toMatchObject({phase:'late',active_actor_id:hero.id,round_number:1});
  const ticks=calls.filter(c=>c.tick).length;
  ctx.combatActions[1].status='resolved';await ctx.endCombatTurn(null,hero.id);
  expect(ctx.activeCombat).toMatchObject({phase:'initiative',round_number:2});
  expect(calls.filter(c=>c.tick)).toHaveLength(ticks);
 });
 it('orders multiple late attackers by the original initiative order',()=>{
  const {ctx,enemy,data}=harness();ctx.chars.push({...structuredClone(data),_dbId:'enemy-source'});
  ctx.combatActions=['enemy','hero'].flatMap(id=>[action(id,'primary','attack','resolved'),action(id,'secondary')]);
  expect(ctx.combatLateAttackOrder()).toEqual(['hero',enemy.id]);
 });
 it('does not queue a second attack if the first attack was never performed',()=>{
  const {ctx}=harness();ctx.combatActions=[action('hero'),action('hero','secondary')];expect(ctx.combatLateAttackOrder()).toEqual([]);
 });
 it('reloads rows, retains spent slots after equipment changes and resets on a new SR',()=>{
  const {ctx,hero}=harness();ctx.combatActions=JSON.parse(JSON.stringify([action('hero','primary','attack','resolved'),action('hero','secondary')]));
  hero.state.broken_weapon_keys=['dagger'];expect(ctx.combatWeaponActionIsLegal(hero,ctx.combatActions[1])).toBe(false);
  expect(ctx.combatRoundWeaponActions(hero)[0].status).toBe('resolved');
  ctx.activeCombat.round_number=2;expect(ctx.combatChosenAction(hero)).toBe(null);
 });
 it('shows both hands, modified FV, reserved/spent status and the next weapon',()=>{
  const {ctx,hero}=harness();ctx.combatActions=[action('hero','primary','attack','resolved'),action('hero','secondary','parry','reserved')];
  const html=ctx.combatTwoWeaponsHtml(hero);
  for(const expected of ['TVÅ VAPEN','Höger hand','Vänster hand','Svärdshand: Vänster','1H','Attack + Attack','Attack + Parering','Parering + Parering','Förbrukad','Parering reserverad','dagger'])expect(html).toContain(expected);
 });
 it('undo distinguishes an actor’s normal and late turns in the same SR',()=>{
  const {ctx}=harness();
  runInNewContext(section(read('src/main.js'),'function combatUndoSnapshotMatchesActiveTurn(','function combatUndoActiveTurnAlreadyStarted('),ctx);
  const snapshot={turn_start:true,combat_id:'combat',actor_id:'hero',round_number:1,phase:'movement'};
  expect(ctx.combatUndoSnapshotMatchesActiveTurn(snapshot)).toBe(true);
  ctx.activeCombat.phase='late';expect(ctx.combatUndoSnapshotMatchesActiveTurn(snapshot)).toBe(false);
 });
});
