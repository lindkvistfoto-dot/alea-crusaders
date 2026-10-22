/* Registry identity adapters. No name matching, network access or implicit global inheritance. */
(function(api){
 'use strict';
 function readOwner(type,record){
  if(!record||typeof record!=='object')return null;
  const field={character:'characterId',npc:'campaignNpcId',enemy:'campaignMonsterId',
   monster:'campaignMonsterId',global_npc:'globalNpcId',combatant:'combatantId'}[type];
  // A hydrated character has _dbId; a DB row has id + data. Local aliases are never owners.
  const id=type==='character'?(record._dbId||(record.data?record.id:null)):record.id;
  if(!field||!api.uuid(id))return null;
  const owner={[field]:id.toLowerCase()};
  const campaignId=record.campaign_id||null;
  if(campaignId!==null&&!api.uuid(campaignId))return null;
  return {owner,key:api.ownerKey(owner),actorKind:type==='global_npc'?'npc':type,campaignId,
   sourceGlobalNpcId:api.uuid(record.source_global_npc_id)?record.source_global_npc_id:null};
 }
 function readCombatantOwner(combatant,sources={}){
  if(!combatant||!api.uuid(combatant.id))return null;
  if(combatant.campaign_id!=null&&!api.uuid(combatant.campaign_id))return null;
  if(combatant.source_type==='quick_enemy'){
   return {...readOwner('combatant',combatant),actorKind:'enemy',combatantId:combatant.id};
  }
  const table={character:'characters',npc:'npcs',monster:'monsters'}[combatant.source_type];
  if(!table||!api.uuid(combatant.source_id))return null;
  const rows=sources[table];
  const row=typeof rows?.get==='function'?rows.get(combatant.source_id):api.list(rows).find(item=>
   (item?._dbId||item?.id)===combatant.source_id);
  // A missing master can still use its source UUID and this combat instance's safe manifest.
  const source=row||{id:combatant.source_id,...(table==='characters'?{data:{}}:{})};
  const kind=table==='monsters'?(source.actor_kind==='enemy'?'enemy':'monster'):combatant.source_type;
  const result=readOwner(kind,source);
  if(!result||(combatant.campaign_id&&result.campaignId&&combatant.campaign_id!==result.campaignId))return null;
  return {...result,campaignId:result.campaignId||combatant.campaign_id||null,combatantId:combatant.id};
 }
 function readWeaponRegister(rows){
  // The Manager reads the current rule_weapons register; no hardcoded weapon count or skill aliases.
  return api.list(rows).filter(row=>row&&api.uuid(row.id)&&
   ['melee','projectile','thrown'].includes(row.category)).map(row=>({
    id:row.id,name:api.text(row.name),category:row.category,handling:api.text(row.handling),
    strengthGroup:row.strength_group??null,skillId:row.skill_id??null
   }));
 }
 // Wire these callbacks to the existing combat functions after runtime/legacy have loaded.
 function readCombatantLoadout(combatant,{attackProfile,normalizeNpc,ruleWeapons=[]}={}){
  if(typeof attackProfile!=='function')return api.readBattleLoadout(null);
  // Ask the existing authority once. Record legacy provenance from the original snapshot,
  // since combatAttackProfile may already have normalized its returned copy.
  let profile=attackProfile(combatant);
  let assumedLegacyHands=false;
  if(['npc','monster'].includes(combatant?.source_type)){
   const original=combatant?.state?.attack_profile||profile;
   const originalHasHands=original?.currentEquipment&&['rightHand','leftHand'].some(key=>Object.hasOwn(original.currentEquipment,key));
   const hasHands=profile?.currentEquipment&&['rightHand','leftHand'].some(key=>Object.hasOwn(profile.currentEquipment,key));
   assumedLegacyHands=!originalHasHands&&!api.list(original?.weapons).concat(api.list(original?.shields))
    .some(item=>item?.hand!==undefined&&item.hand!=='');
   if(!hasHands){
    if(typeof normalizeNpc!=='function')return api.readBattleLoadout(null);
    // The existing normalizer is pure. Do not reproduce its legacy defaults here.
    profile=normalizeNpc(profile);
   }
  }
  return api.readBattleLoadout(profile,combatant?.state,{ruleWeapons,assumedLegacyHands});
 }
 // Master previews for the next Manager. Combat always uses readCombatantLoadout instead.
 function readRegistryLoadout(type,record,{normalizeNpc,ruleWeapons=[]}={}){
  if(!record||typeof record!=='object')return api.readBattleLoadout(null);
  if(type==='character')return api.readBattleLoadout(record.data||record,{}, {ruleWeapons});
  if(!['npc','enemy','monster','global_npc'].includes(type))return api.readBattleLoadout(null);
  const profile={...record,shields:Array.isArray(record.shields)?record.shields:
   Array.isArray(record.shield)?record.shield:(record.shield&&typeof record.shield==='object'?[record.shield]:[])};
  return readCombatantLoadout({source_type:type==='npc'||type==='global_npc'?'npc':'monster',state:{attack_profile:profile}},
   {attackProfile:()=>profile,normalizeNpc,ruleWeapons});
 }
 Object.assign(api,{readOwner,readCombatantOwner,readWeaponRegister,readCombatantLoadout,readRegistryLoadout});
})(globalThis.AleaBattleArt);
