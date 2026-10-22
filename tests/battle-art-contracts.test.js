import {describe,it,expect,vi} from 'vitest';
import {createApi,id,rules,ref,profile,fixture,freeze,combatContext,read} from './helpers/battle-art.mjs';

describe('BENGALI registry contracts',()=>{
 const api=createApi();
 it.each([
  ['character',{id:id(1),data:{}},'characterId'],['character',{id:'local',_dbId:id(1)},'characterId'],
  ['npc',{id:id(1)},'campaignNpcId'],['enemy',{id:id(1)},'campaignMonsterId'],
  ['monster',{id:id(1)},'campaignMonsterId'],['global_npc',{id:id(1)},'globalNpcId']
 ])('adapts %s to a stable typed owner', (kind,row,field)=>{
  expect(api.readOwner(kind,freeze(row))).toMatchObject({owner:{[field]:id(1)}});
 });
 it('rejects unsaved local characters, name matches and multiple owner FKs',()=>{
  expect(api.readOwner('character',{id:'astrid',name:'Astrid'})).toBeNull();
  expect(api.readOwner('character',{id:id(1)})).toBeNull();
  expect(api.ownerKey({characterId:id(1),globalNpcId:id(2)})).toBeNull();
 });
 it.each(['npc','monster','character'])('resolves the %s combat source without merging identities',type=>{
  const descriptor=api.readCombatantOwner({id:id(3),source_type:type,source_id:id(1)});
  expect(descriptor.combatantId).toBe(id(3));
  expect(Object.values(descriptor.owner)).toEqual([id(1)]);
 });
 it('treats enemy as metadata on the monster registry',()=>{
  const actor={id:id(3),source_type:'monster',source_id:id(1)};
  expect(api.readCombatantOwner(actor,{monsters:new Map([[id(1),{id:id(1),actor_kind:'enemy'}]])}))
   .toMatchObject({actorKind:'enemy',owner:{campaignMonsterId:id(1)}});
 });
 it('gives a null-source quick enemy an instance owner without registry lookup',()=>{
  const get=vi.fn(()=>{throw Error('must not query null')});
  expect(api.readCombatantOwner({id:id(3),source_type:'quick_enemy',source_id:null},{monsters:{get}}))
   .toMatchObject({owner:{combatantId:id(3)},actorKind:'enemy'});
  expect(get).not.toHaveBeenCalled();
 });
 it('keeps global NPC provenance pinned to the campaign owner',()=>{
  const owner=api.readOwner('npc',{id:id(1),source_global_npc_id:id(7)});
  expect(owner.owner).toEqual({campaignNpcId:id(1)});
  expect(owner.sourceGlobalNpcId).toBe(id(7));
 });
 it('rejects cross-campaign and missing-source IDs',()=>{
  expect(api.readCombatantOwner({id:id(3),source_type:'npc',source_id:id(1),campaign_id:id(2)},
   {npcs:[{id:id(1),campaign_id:id(9)}]})).toBeNull();
  expect(api.readCombatantOwner({id:id(3),source_type:'monster',source_id:null})).toBeNull();
  expect(api.readCombatantOwner({id:id(3),source_type:'quick_enemy',campaign_id:'invalid'})).toBeNull();
 });
 it('reads new registry rows dynamically, retaining UUID and category rather than skill grouping',()=>{
  const rows=api.readWeaponRegister([...rules,{id:id(99),name:'Ny',category:'thrown',handling:'1H'}]);
  expect(rows).toHaveLength(6);
  expect(rows[0].id).not.toBe(rows[1].id);
  expect(rows.at(-1)).toMatchObject({id:id(99),category:'thrown'});
 });
 it('loads the classic contracts before runtime without installing a rendering hook',()=>{
  const html=read('index.html');
  expect(html.indexOf('features/battle-art/contracts.js')).toBeLessThan(html.indexOf('features/combat/runtime.js'));
  const {request}=fixture(api);
  expect(api.resolveBattleArt(request)).toEqual({kind:'disabled',reason:'feature-disabled'});
  expect(api.resolveBattleArt(request,{battlePoses:'true'}).kind).toBe('disabled');
 });
});

describe('BENGALI read-only equipped loadout',()=>{
 const api=createApi();
 const project=(p,state={})=>api.readBattleLoadout(p,state,{ruleWeapons:rules});
 it('preserves anatomical hands, shield identity and frozen input',()=>{
  const p=freeze(profile()),before=JSON.stringify(p);
  const result=project(p);
  expect(result).toMatchObject({known:true,unarmed:false,shieldHands:['leftHand'],
   hands:{rightHand:{kind:'weapon',masterId:id(10),category:'melee',grip:'one_hand'},leftHand:{kind:'shield',masterId:id(20)}}});
  expect(JSON.stringify(p)).toBe(before);
 });
 it('supports a left weapon and a right shield without mirroring',()=>{
  const p=profile();[p.currentEquipment.leftHand,p.currentEquipment.rightHand]=[p.currentEquipment.rightHand,p.currentEquipment.leftHand];
  expect(project(p).shieldHands).toEqual(['rightHand']);
  expect(project(p).hands.leftHand.masterId).toBe(id(10));
 });
 it.each(['staff','bow'])('deduplicates actual two-hand %s equipment',item=>{
  const p=profile();p.currentEquipment={leftHand:ref('weapon',item,2),rightHand:ref('weapon',item,2)};
  expect(project(p)).toMatchObject({known:true,shieldHands:[],weapons:[{instanceId:item,grip:'two_hands'}]});
 });
 it('keeps two instances of the same master as dual weapons',()=>{
  const p=profile();p.currentEquipment.leftHand=ref('weapon','sword2');
  const result=project(p);
  expect(result.weapons).toHaveLength(2);
  expect(result.weapons.map(w=>w.masterId)).toEqual([id(10),id(10)]);
 });
 it.each([
  {rightHand:ref('weapon','staff',2),leftHand:ref('shield','shield')},
  {rightHand:ref('weapon','sword'),leftHand:ref('weapon','sword')},
  {rightHand:ref('shield','shield'),leftHand:ref('shield','shield')}
 ])('marks inconsistent occupied hands unknown without repairing rules',currentEquipment=>{
  const p=freeze({...profile(),currentEquipment});expect(project(p).known).toBe(false);
 });
 it('distinguishes an unknown hand from unarmed and an unarmed action from empty hands',()=>{
  expect(project(null)).toMatchObject({known:false,unarmed:false});
  const p=profile();p.selectedAction={_unarmed:true};
  expect(project(p).unarmed).toBe(false);
  p.currentEquipment={rightHand:null,leftHand:null};
  expect(project(p)).toMatchObject({known:true,unarmed:true,weapons:[]});
 });
 it('preserves a held special item and treats an unresolved reference as unknown',()=>{
  const p=profile();p.currentEquipment.leftHand=ref('equipment','lantern');
  expect(project(p).hands.leftHand).toMatchObject({kind:'equipment',instanceId:'lantern'});
  p.currentEquipment.rightHand=ref('weapon','missing');
  expect(project(p)).toMatchObject({known:false,unarmed:false});
 });
 it('does not infer a natural weapon or master UUID from a name, skill or weapon_type',()=>{
  const p=profile();delete p.weapons[0].weapon_id;
  Object.assign(p.weapons[0],{name:'Svärd',skill_id:'same-skill',weapon_type:'L',natural:true});
  expect(project(p).hands.rightHand.kind).toBe('unknown');
 });
 it('reads existing grip and fractional GL without recalculating STY rules',()=>{
  const p=profile();Object.assign(p.weapons[0],{handling:'1-2H',gl:.5});
  expect(project(freeze(p)).hands.rightHand.grip).toBe('one_hand');
 });
 it('keeps a bow with no arrows but removes an exhausted thrown item from the visual projection',()=>{
  const p=profile();p.currentEquipment={rightHand:ref('weapon','bow',2),leftHand:ref('weapon','bow',2)};
  expect(project(p).weapons[0].category).toBe('projectile');
  p.currentEquipment={rightHand:ref('weapon','knife'),leftHand:null};
  expect(project(p).unarmed).toBe(true);
  p.projectiles=[{projectile_key:'knife',count:1}];
  expect(project(p).hands.rightHand.masterId).toBe(id(14));
 });
 it('reads dropped and broken weapon state without changing it',()=>{
  const p=profile(),state=freeze({dropped_weapon_keys:['sword']});
  expect(project(p,state).hands.rightHand.kind).toBe('empty');
  expect(project(p,{broken_weapon_keys:['sword']}).hands.rightHand.kind).toBe('unknown');
 });
 it('changes the signature on equipment changes while ignoring selected attacks and ammunition for a held bow',()=>{
  const p=profile(),a=project(p).signature;p.currentEquipment.rightHand=ref('weapon','dagger');
  expect(project(p).signature).not.toBe(a);
  const b=project(p).signature;p.action={_unarmed:true};expect(project(p).signature).toBe(b);
 });
 it('uses the actual combat authority for live characters and instance NPC/monster snapshots',()=>{
  const live=profile(),stored=profile();stored.currentEquipment={rightHand:null,leftHand:null};
  const context=combatContext({chars:[{...live,_dbId:id(1)}]});
  const character=freeze({id:id(3),source_type:'character',source_id:id(1),state:{attack_profile:stored}});
  expect(api.readCombatantLoadout(character,{...context.authority,ruleWeapons:rules}).hands.rightHand.masterId).toBe(id(10));
  for(const source_type of ['npc','monster']){
   const actor=freeze({...character,source_type});
   expect(api.readCombatantLoadout(actor,{...context.authority,ruleWeapons:rules}).unarmed).toBe(true);
  }
 });
 it('reuses the existing legacy NPC normalizer and reports assumed hand defaults',()=>{
  const {authority}=combatContext();
  const p={weapons:[{name:'Svärd',weapon_id:id(10),category:'melee'}]};
  const actor=freeze({source_type:'npc',state:{attack_profile:p}});
  const result=api.readCombatantLoadout(actor,{...authority,ruleWeapons:rules});
  expect(result).toMatchObject({assumedLegacyHands:true,hands:{rightHand:{masterId:id(10)},leftHand:{kind:'empty'}}});
  expect(p.currentEquipment).toBeUndefined();
 });
 it.each(['npc','enemy','monster','global_npc'])('adapts the %s master preview through the same NPC normalizer',type=>{
  const {authority}=combatContext();
  const master=freeze({weapons:[{equipId:'sword',weapon_id:id(10),category:'melee',hand:'right'}],
   shield:{equipId:'shield',shield_id:id(20),name:'Sköld',hand:'left'}});
  const result=api.readRegistryLoadout(type,master,{normalizeNpc:authority.normalizeNpc,ruleWeapons:rules});
  expect(result).toMatchObject({known:true,shieldHands:['leftHand'],weapons:[{masterId:id(10)}]});
  expect(master.shields).toBeUndefined();
 });
 it('does not assume a thrown item has left a hand when legacy stock cannot be identified',()=>{
  const p=profile();p.currentEquipment={rightHand:ref('weapon','knife'),leftHand:null};
  p.projectiles=[{name:'Kastknivar',count:2}];
  expect(project(p).hands.rightHand).toMatchObject({kind:'unknown',reason:'unknown-projectile-stock'});
 });
});
