/* Deterministic selection. No image IO, combat commands, globals from runtime, or mirroring. */
(function(api){
 'use strict';
 const compare=(a,b)=>a<b?-1:a>b?1:0;
 const assetRef=asset=>({id:asset.id,bucket:asset.bucket,path:asset.path,app_sha256:asset.app_sha256,
  app_bytes:asset.app_bytes,width:asset.width,height:asset.height});
 const requestKey=request=>JSON.stringify([
  api.ownerKey(request.owner),request.combatantId,request.campaignId,request.accessKey,request.visible,
  request.loadout?.signature,request.loadout?.hands,request.facing,request.view,request.shape,
  request.layoutProfile,request.posture,request.mountProfile,request.mountCombatantId,request.mountRevision,
  request.manifest?.setId,request.manifest?.versionId,request.manifest?.revision
 ]);
 function handMatch(actual,expected){
  if(!actual||!expected||actual.kind==='unknown'||actual.kind!==expected.kind)return false;
  if(actual.kind==='empty')return true;
  if(expected.instanceId&&actual.instanceId!==expected.instanceId)return false;
  const ids=[expected.masterId,...api.list(expected.allowedMasterIds)].filter(api.uuid);
  if(actual.masterId?!ids.includes(actual.masterId):expected.instanceId!==actual.instanceId)return false;
  if(actual.kind==='weapon')return actual.grip===expected.grip&&actual.category===expected.category;
  return true;
 }
 function equipmentMatch(loadout,slot){
  if(slot.reviewed!==true)return null;
  if(slot.equipmentNeutral===true)return {alias:false,neutral:true};
  if(!loadout?.known)return null;
  const matches=api.list(slot.loadouts).filter(declaration=>
   handMatch(loadout.hands?.rightHand,declaration?.rightHand)&&
   handMatch(loadout.hands?.leftHand,declaration?.leftHand));
  if(!matches.length)return null;
  const exact=matches.some(declaration=>['rightHand','leftHand'].every(name=>
   loadout.hands[name].kind==='empty'||loadout.hands[name].masterId===declaration[name].masterId));
  return {alias:!exact,neutral:false};
 }
 function manifestFor(request){
  const manifest=request.manifest;
  if(request.visible!==true||!api.text(request.accessKey)||!api.uuid(request.combatantId)||
   !manifest||manifest.contractVersion!==api.CONTRACT_VERSION||manifest.status!=='active'||
   !api.uuid(manifest.setId)||!api.uuid(manifest.versionId)||
   !Number.isSafeInteger(manifest.revision)||manifest.revision<1||
   !api.ownerKey(request.owner)||api.ownerKey(manifest.owner)!==api.ownerKey(request.owner)||
   manifest.combatantId!==request.combatantId||manifest.campaignId!==request.campaignId||
   manifest.accessKey!==request.accessKey)return null;
  const assets=api.list(manifest.assets),slots=api.list(manifest.slots);
  if(new Set(assets.map(a=>a?.id)).size!==assets.length||new Set(slots.map(s=>s?.id)).size!==slots.length)return null;
  return manifest;
 }
 function resolveBattleArt(request={},flags=api.DEFAULT_FLAGS){
  if(!api.enabled(flags))return {kind:'disabled',reason:'feature-disabled'};
  const normalized={...request,facing:api.facing(request.facing),shape:request.shape||'single'};
  const key=requestKey(normalized);
  const fallback=reason=>({kind:'marker',tier:5,reason,key,mirror:false,
   mounted:request.posture==='mounted',systemArtKey:api.SYSTEM_ART.stand});
  const manifest=manifestFor(normalized);
  if(!manifest)return fallback('manifest-unavailable');
  const failed=new Set(api.list(request.unavailableAssetIds));
  const getAsset=id=>{
   const asset=api.list(manifest.assets).find(item=>item?.id===id);
   return api.validAsset(asset)&&!failed.has(id)?asset:null;
  };
  const desiredView=['front','right','left'].includes(request.view)?request.view:
   (normalized.facing===null?'front':api.DIRECTIONS[normalized.facing].view);
  const candidates=[];
  for(const slot of api.list(manifest.slots)){
   if(!slot||!api.uuid(slot.id)||slot.status!=='active'||slot.verified!==true||
    !['battle_pose','cutout'].includes(slot.kind)||!['specific','general'].includes(slot.role)||
    !['standing','mounted'].includes(slot.posture)||slot.posture!==request.posture||
    !['front','right','left'].includes(slot.view)||
    (request.posture==='mounted'&&(!api.text(request.mountProfile)||!api.uuid(request.mountCombatantId)||
     request.mountCombatantId===request.combatantId||
     slot.mountProfile!==request.mountProfile||
     (slot.mountCombatantId!=null&&slot.mountCombatantId!==request.mountCombatantId))))continue;
   const match=equipmentMatch(request.loadout,slot);
   if(!match)continue;
   const asset=getAsset(slot.assetId),layout=api.layoutFor(asset,normalized);
   const base=slot.baseMode==='shared'?getAsset(manifest.systemArt?.[api.SYSTEM_ART.base]):null;
   if(!asset||asset.alpha_preserved!==true||!layout||
    !['embedded','shared'].includes(slot.baseMode)||!['baked','shared'].includes(slot.shadowMode)||
    (slot.baseMode==='shared'&&!base))continue;
   const native=api.list(slot.supportedFacings).filter(value=>Number.isInteger(value)&&value>=0&&value<=5);
   const allowed=[...native,...api.list(slot.fallbackFacings).filter(value=>Number.isInteger(value)&&value>=0&&value<=5)];
   if(normalized.facing!==null&&!allowed.includes(normalized.facing))continue;
   if(slot.facing!=null&&(!Number.isInteger(slot.facing)||slot.facing<0||slot.facing>5))continue;
   const exactFacing=normalized.facing!==null&&slot.facing===normalized.facing;
   const sameView=slot.view===desiredView;
   const exactView=slot.facing==null&&sameView&&
    (normalized.facing===null||native.includes(normalized.facing))&&![4,5].includes(normalized.facing);
   let tier=match.alias?2:((exactFacing||exactView)?1:2);
   if(slot.role==='general'||match.neutral)tier=3;
   if(slot.kind==='cutout')tier=4;
   const distance=normalized.facing===null?0:Math.min(6,...native.map(value=>{
    const d=Math.abs(value-normalized.facing);return Math.min(d,6-d);
   }));
   candidates.push({slot,asset,base,layout,tier,match,exactFacing,sameView,distance});
  }
  candidates.sort((a,b)=>a.tier-b.tier||Number(b.exactFacing)-Number(a.exactFacing)||
   Number(b.sameView)-Number(a.sameView)||Number(a.match.alias)-Number(b.match.alias)||
   a.distance-b.distance||compare(a.slot.id,b.slot.id));
  const chosen=candidates[0];
  if(chosen){
   const {slot,asset,base,layout,tier}=chosen;
   return {kind:slot.kind,tier,slotId:slot.id,asset:assetRef(asset),key,mirror:false,
    ...(base?{base:assetRef(base)}:{}),
    reason:['','exact-pose','compatible-pose','general-pose','compatible-cutout'][tier],
    versionId:manifest.versionId,revision:manifest.revision,
    directionApproximate:normalized.facing!==null&&!chosen.exactFacing,
    transform:{anchor:{x:layout.anchor.x,y:layout.anchor.y},groundWidthPx:layout.groundWidthPx,
     groundWidthHex:layout.groundWidthHex,scale:layout.scale,profile:layout.profile},
    baseMode:slot.baseMode,shadowMode:slot.shadowMode,mounted:request.posture==='mounted'};
  }
  const portrait=manifest.portrait,portraitAsset=getAsset(portrait?.assetId);
  const stand=getAsset(manifest.systemArt?.[api.SYSTEM_ART.stand]);
  const base=getAsset(manifest.systemArt?.[api.SYSTEM_ART.base]);
  if(!stand||!base)return fallback('system-art-unavailable');
  const safePortrait=portrait?.reviewed===true&&portrait.equipmentNeutral===true&&portraitAsset;
  return {kind:safePortrait?'portrait':'initials',tier:5,reason:safePortrait?'portrait-stand':'portrait-unavailable',
   key,mirror:false,asset:safePortrait?assetRef(portraitAsset):null,
   stand:assetRef(stand),base:assetRef(base),mounted:request.posture==='mounted',
   versionId:manifest.versionId,revision:manifest.revision};
 }
 Object.assign(api,{requestKey,equipmentMatch,resolveBattleArt});
})(globalThis.AleaBattleArt);
