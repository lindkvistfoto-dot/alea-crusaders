import {describe,it,expect} from 'vitest';
import {createApi,id,flags,rules,ref,profile,asset,declaration,fixture,freeze,read} from './helpers/battle-art.mjs';
import {runInNewContext} from 'node:vm';

describe('BENGALI deterministic safe resolver',()=>{
 const api=createApi();
 const resolve=request=>api.resolveBattleArt(request,flags);
 it.each(['characterId','campaignNpcId','campaignMonsterId','globalNpcId','combatantId'])
 ('resolves an active pose for typed owner %s',field=>{
  const {manifest,request}=fixture(api);manifest.owner={[field]:id(1)};request.owner={...manifest.owner};
  expect(resolve(freeze(request))).toMatchObject({kind:'battle_pose',tier:1,mirror:false,asset:{id:id(100)}});
 });
 it.each(['enemy','monster'])('shares one %s library across instances with independent requests',kind=>{
  const {manifest,request}=fixture(api);manifest.owner={campaignMonsterId:id(1)};request.owner=manifest.owner;
  const actor={id:id(3),source_type:'monster',source_id:id(1)};
  expect(api.readCombatantOwner(actor,{monsters:[{id:id(1),actor_kind:kind}]}).actorKind).toBe(kind);
  expect(resolve(request).kind).toBe('battle_pose');
  expect(resolve({...request,combatantId:id(4)}).kind).toBe('marker');
 });
 it('returns detached anchor/scale metadata and never mutates the manifest',()=>{
  const {request}=fixture(api);freeze(request);
  const result=resolve(request);result.transform.anchor.x=1;
  expect(request.manifest.assets[0].layouts[0].anchor.x).toBe(450);
  expect(result.transform).toMatchObject({groundWidthPx:200,groundWidthHex:1,scale:1});
 });
 it('requires and delivers an explicit shared base without drawing an embedded base twice',()=>{
  const {request,pose}=fixture(api);pose.baseMode='shared';
  expect(resolve(request)).toMatchObject({kind:'battle_pose',baseMode:'shared',base:{id:id(103)}});
  request.unavailableAssetIds=[id(103)];expect(resolve(request).kind).toBe('marker');
 });
 it('implements all five priorities in order with compatible synthetic variants',()=>{
  const {manifest,request,pose}=fixture(api);
  const close={...pose,id:id(201),view:'right',supportedFacings:[0],fallbackFacings:[]};
  const general={...pose,id:id(202),role:'general',equipmentNeutral:true};
  const cutout={...pose,id:id(203),kind:'cutout'};
  manifest.slots=[cutout,general,close,{...pose,facing:0,supportedFacings:[0]}];request.facing=0;
  expect(resolve(request).tier).toBe(1);
  manifest.slots.pop();request.view='left';close.fallbackFacings=[0];
  expect(resolve(request)).toMatchObject({tier:2,slotId:close.id});
  manifest.slots=manifest.slots.filter(s=>s!==close);expect(resolve(request).tier).toBe(3);
  manifest.slots=[cutout];expect(resolve(request).tier).toBe(4);
  manifest.slots=[];expect(resolve(request)).toMatchObject({tier:5,kind:'portrait',stand:{id:id(102)}});
 });
 it.each(['specific','general','cutout'])('rejects a %s image that omits the held shield',role=>{
  const {request,pose}=fixture(api);
  pose.role=role==='general'?'general':'specific';pose.kind=role==='cutout'?'cutout':'battle_pose';
  pose.loadouts[0].leftHand={kind:'empty'};
  expect(resolve(request).kind).toBe('portrait');
 });
 it('does not substitute a name, category or shared FV skill for a master weapon',()=>{
  const {request}=fixture(api),p=profile();p.currentEquipment.rightHand=ref('weapon','dagger');
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});
  expect(resolve(request).kind).toBe('portrait');
 });
 it('only accepts explicit reviewed visual aliases and preserves hand and grip',()=>{
  const {request,pose}=fixture(api),p=profile();p.currentEquipment.rightHand=ref('weapon','dagger');
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});
  pose.loadouts[0].rightHand.allowedMasterIds=[id(11)];
  expect(resolve(request)).toMatchObject({tier:2,reason:'compatible-pose'});
  pose.reviewed=false;expect(resolve(request).kind).toBe('portrait');
 });
 it('requires shield identity and never mirrors the hands',()=>{
  const {request}=fixture(api),p=profile();
  [p.currentEquipment.leftHand,p.currentEquipment.rightHand]=[p.currentEquipment.rightHand,p.currentEquipment.leftHand];
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});expect(resolve(request).kind).toBe('portrait');
  p.currentEquipment=profile().currentEquipment;p.shields[0].shield_id=id(21);
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});expect(resolve(request).kind).toBe('portrait');
 });
 it.each(['bow','staff'])('requires the correct two-hand %s pose',item=>{
  const {request,pose}=fixture(api),p=profile();p.currentEquipment={rightHand:ref('weapon',item,2),leftHand:ref('weapon',item,2)};
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});
  expect(resolve(request).kind).toBe('portrait');
  pose.loadouts=[declaration(request.loadout)];expect(resolve(request).kind).toBe('battle_pose');
 });
 it('distinguishes dual identical weapons from a single two-handed weapon',()=>{
  const {request,pose}=fixture(api),p=profile();p.currentEquipment.leftHand=ref('weapon','sword2');
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});pose.loadouts=[declaration(request.loadout)];
  expect(resolve(request).tier).toBe(1);
  p.currentEquipment={rightHand:ref('weapon','sword',2),leftHand:ref('weapon','sword',2)};
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});expect(resolve(request).kind).toBe('portrait');
 });
 it.each([null,{currentEquipment:{rightHand:null,leftHand:null}}])('uses neutral art for unknown or unarmed loadouts safely',p=>{
  const {request,pose}=fixture(api);request.loadout=api.readBattleLoadout(p);
  expect(resolve(request).kind).toBe('portrait');
  pose.equipmentNeutral=true;expect(resolve(request)).toMatchObject({kind:'battle_pose',tier:3});
  pose.reviewed=false;expect(resolve(request).kind).toBe('portrait');
 });
 it('requires explicit special-item compatibility',()=>{
  const {request,pose}=fixture(api),p=profile();p.currentEquipment.leftHand=ref('equipment','lantern');
  request.loadout=api.readBattleLoadout(p,{}, {ruleWeapons:rules});expect(resolve(request).kind).toBe('portrait');
  pose.loadouts=[declaration(request.loadout)];expect(resolve(request).tier).toBe(1);
  pose.loadouts[0].leftHand.instanceId='book';expect(resolve(request).kind).toBe('portrait');
 });
 it('permits unarmed art only for genuinely empty hands',()=>{
  const {request,pose}=fixture(api),p=profile();p.currentEquipment={rightHand:null,leftHand:null};
  request.loadout=api.readBattleLoadout(p);pose.loadouts=[declaration(request.loadout)];
  expect(resolve(request).kind).toBe('battle_pose');
  request.loadout=api.readBattleLoadout(profile(),{}, {ruleWeapons:rules});expect(resolve(request).kind).toBe('portrait');
 });
 it('requires identical mounted posture and mount profile, without inferring from names',()=>{
  const {request,pose}=fixture(api);request.name='Häst med lans';request.posture='mounted';request.mountProfile='saddle-v1';request.mountCombatantId=id(40);
  expect(resolve(request)).toMatchObject({kind:'portrait',mounted:true});
  pose.posture='mounted';pose.mountProfile='saddle-v2';expect(resolve(request).kind).toBe('portrait');
  pose.mountProfile='saddle-v1';expect(resolve(request).kind).toBe('battle_pose');
  pose.mountCombatantId=id(41);expect(resolve(request).kind).toBe('portrait');
  pose.mountCombatantId=id(40);expect(resolve(request).kind).toBe('battle_pose');
  request.mountCombatantId=request.combatantId;expect(resolve(request).kind).toBe('portrait');
  request.posture='standing';expect(resolve(request).kind).toBe('portrait');
 });
 it.each([0,1,2,3,4,5])('uses the shared axial preview convention for facing %i without raster rotation',facing=>{
  const {request,pose}=fixture(api);request.facing=facing;pose.view=api.DIRECTIONS[facing].view;
  pose.supportedFacings=[facing];pose.facing=facing;
  expect(resolve(request)).toMatchObject({tier:1,mirror:false,directionApproximate:false});
  expect(api.DIRECTIONS[facing]).toMatchObject([
   {dq:1,dr:0},{dq:0,dr:1},{dq:-1,dr:1},{dq:-1,dr:0},{dq:0,dr:-1},{dq:1,dr:-1}
  ][facing]);
 });
 it.each([4,5])('marks a three-view rear approximation as tier 2 for facing %i',facing=>{
  const {request,pose}=fixture(api);request.facing=facing;pose.view=api.DIRECTIONS[facing].view;pose.supportedFacings=[facing];
  expect(resolve(request)).toMatchObject({tier:2,directionApproximate:true});
 });
 it('requires declared direction fallback and does not guess left/right distance',()=>{
  const {request,pose}=fixture(api);request.facing=0;
  expect(resolve(request)).toMatchObject({tier:2,slotId:pose.id});
  pose.fallbackFacings=[];expect(resolve(request).kind).toBe('portrait');
 });
 it('sorts candidates by facing/view, reviewed alias, circular distance, then stable ID',()=>{
  const {request,manifest,pose}=fixture(api);request.facing=5;
  const farther={...pose,id:id(201),view:'right',supportedFacings:[2]},near={...pose,id:id(202),view:'right',supportedFacings:[0]};
  manifest.slots=[farther,near];expect(resolve(request).slotId).toBe(near.id);
  farther.supportedFacings=[0];expect(resolve(request).slotId).toBe(farther.id);
  manifest.slots.reverse();expect(resolve(request).slotId).toBe(farther.id);
  near.facing=5;expect(resolve(request).slotId).toBe(near.id);
 });
 const shapes=['single','line2','triangle3','line3','giant7'];
 it.each(shapes.flatMap(shape=>Array.from({length:6},(_,facing)=>[shape,facing])))
 ('requires a calibrated %s layout at facing %i without changing geometry', (shape,facing)=>{
  const {request,manifest,pose}=fixture(api);request.shape=shape;request.facing=facing;pose.facing=facing;
  if(shape!=='single')expect(resolve(request).kind).toBe('portrait');
  manifest.assets[0].layouts=[{...asset().layouts[0],profile:shape+'-v1',shape,facing}];
  const geometry={};runInNewContext(read('features/combat/footprint.js')+'\nthis.cells=combatFootprintCells;',geometry);
  const actor={q:4,r:4,state:{footprint:{shape,facing}}},before=geometry.cells(actor);
  expect(resolve(freeze(request)).kind).toBe('battle_pose');
  expect(geometry.cells(actor)).toEqual(before);
 });
 it.each([
  ['contractVersion',2],['status','draft'],['revision',0],['owner',{characterId:id(9)}],
  ['campaignId',id(9)],['combatantId',id(9)],['accessKey','other-session'],['versionId','broken']
 ])('fails closed on manifest %s mismatch', (field,value)=>{
  const {request,manifest}=fixture(api);manifest[field]=value;expect(resolve(request).kind).toBe('marker');
 });
 it('does not reveal images for invisible actors or inherit a global library automatically',()=>{
  const {request,manifest}=fixture(api);expect(resolve({...request,visible:false}).kind).toBe('marker');
  manifest.owner={globalNpcId:id(1)};request.owner={campaignNpcId:id(1)};
  expect(resolve(request).kind).toBe('marker');
 });
 it.each([
  ['path','https://example.test/file.webp'],['path','../original.png'],['path','battle/%2e%2e/file.webp'],
  ['path','/absolute.webp'],['path','battle/file.png'],['path','javascript:evil.webp'],
  ['app_sha256','bad'],['app_bytes',0],['bucket','combat-icons'],['width',0],['verified',false],['status','draft']
 ])('skips invalid asset %s=%s without throwing', (field,value)=>{
  const {request,manifest}=fixture(api);manifest.assets[0][field]=value;
  expect(resolve(request).kind).toBe('portrait');
 });
 it('falls through missing, failed, unclassified cutout and experimental images',()=>{
  const {request,manifest,pose}=fixture(api);
  request.unavailableAssetIds=[id(100)];expect(resolve(request).kind).toBe('portrait');
  delete request.unavailableAssetIds;manifest.assets=[];expect(resolve(request).kind).toBe('marker');
  manifest.assets=[asset(),asset(101),asset(102),asset(103)];pose.kind='cutout';delete pose.loadouts;
  expect(resolve(request).kind).toBe('portrait');
  pose.equipmentNeutral=true;pose.status='experimental';expect(resolve(request).kind).toBe('portrait');
 });
 it('requires reviewed portraits, then uses initials in the stand, then a geometric marker',()=>{
  const {request,manifest}=fixture(api);manifest.slots=[];
  expect(resolve(request).kind).toBe('portrait');
  manifest.portrait.reviewed=false;expect(resolve(request)).toMatchObject({kind:'initials',asset:null});
  request.unavailableAssetIds=[id(102)];expect(resolve(request).kind).toBe('marker');
 });
 it.each([undefined,null,{},[],{contractVersion:1,slots:[null],assets:[{}]}])('handles malformed/absent manifests',manifest=>{
  const {request}=fixture(api);expect(()=>resolve({...request,manifest})).not.toThrow();
  expect(resolve({...request,manifest}).kind).toBe('marker');
 });
 it('rejects duplicate slot/asset identities and invalid anchors',()=>{
  for(const field of ['slots','assets']){
   const {request,manifest}=fixture(api);manifest[field].push({...manifest[field][0]});
   expect(resolve(request).kind).toBe('marker');
  }
  const {request,manifest}=fixture(api);manifest.assets[0].layouts[0].anchor.x=Infinity;
  expect(resolve(request).kind).toBe('portrait');
 });
 it('keys every equipment, version, instance, facing, footprint, mount and access change',()=>{
  const {request}=fixture(api),key=resolve(request).key;
  for(const delta of [{facing:0},{shape:'line2'},{posture:'mounted'},{mountProfile:'saddle'},
   {mountRevision:2},{mountCombatantId:id(40)},{accessKey:'next'},{combatantId:id(4)},{visible:false}]){
   expect(resolve({...request,...delta}).key).not.toBe(key);
  }
  request.manifest.revision++;expect(resolve(request).key).not.toBe(key);
 });
});
