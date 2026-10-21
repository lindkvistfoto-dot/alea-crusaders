/* Read-only visual projection of the authoritative combatAttackProfile. */
(function(api){
 'use strict';
 const handNames=['rightHand','leftHand'];
 const unknown=reason=>({kind:'unknown',reason});
 function readBattleLoadout(profile,combatState={},options={}){
  const rules=api.list(options.ruleWeapons),warnings=[];
  const equipment=profile?.currentEquipment;
  const dropped=new Set(api.list(combatState?.dropped_weapon_keys).map(String));
  const broken=new Set(api.list(combatState?.broken_weapon_keys).map(String));
  const readHand=name=>{
   if(!equipment||!Object.hasOwn(equipment,name))return unknown('missing-hand');
   const ref=equipment[name];
   if(ref===null)return {kind:'empty'};
   if(!ref||!['weapon','shield','equipment'].includes(ref.kind)||!api.text(ref.itemId))return unknown('invalid-reference');
   const items=api.list(profile?.[{weapon:'weapons',shield:'shields',equipment:'equipment'}[ref.kind]]);
   const matches=items.filter(item=>item&&String(item.equipId||item.id)===ref.itemId);
   if(matches.length!==1)return unknown('unresolved-item');
   const item=matches[0],instanceId=ref.itemId;
   if(ref.kind==='weapon'){
    const key=String(item.equipId||item.weapon_id||item.weaponTypeId||item.id||item.name||'');
    if(dropped.has(key))return {kind:'empty'};
    // A broken weapon may still be visible in hand: never silently call it empty/intact.
    if(broken.has(key))return unknown('broken-weapon');
    const masterId=item.weaponTypeId||item.weapon_id;
    const rule=rules.find(row=>row?.id===masterId);
    const category=rule?.category||item.weaponCategory||item.category;
    if(!api.uuid(masterId)||!['melee','projectile','thrown'].includes(category)||![1,2].includes(ref.hands))return unknown('unknown-weapon');
    if(category==='thrown'){
     const projectileKey=rule?.projectile_key||item.projectileKey||item.projectile_key;
     // Match the combat stock semantics, without consuming ammunition. A bow at zero stock stays visible.
     if(projectileKey){
      if(api.list(profile?.projectiles).some(p=>p&&!p.projectileKey&&!p.projectile_key))return unknown('unknown-projectile-stock');
      const stock=api.list(profile?.projectiles).reduce((sum,p)=>sum+
       ((p?.projectileKey||p?.projectile_key)===projectileKey?Math.max(0,Math.floor(Number(p.count)||0)):0),0);
      if(stock===0)return {kind:'empty'};
     }
    }
    return {kind:'weapon',instanceId,masterId,category,grip:ref.hands===2?'two_hands':'one_hand'};
   }
   const masterId=ref.kind==='shield'?(item.shieldTypeId||item.shield_id):(item.equipmentTypeId||item.equipment_id);
   return {kind:ref.kind,instanceId,masterId:api.uuid(masterId)?masterId:null};
  };
  const hands={rightHand:readHand('rightHand'),leftHand:readHand('leftHand')};
  const right=hands.rightHand,left=hands.leftHand;
  const same=right.kind==='weapon'&&left.kind==='weapon'&&right.instanceId===left.instanceId;
  if(right.instanceId&&right.instanceId===left.instanceId&&!same){
   hands.rightHand=unknown('duplicate-item');hands.leftHand=unknown('duplicate-item');
  }
  if((same&&(right.grip!=='two_hands'||left.grip!=='two_hands'))||
   (!same&&[right,left].some(hand=>hand.kind==='weapon'&&hand.grip==='two_hands'))){
   hands.rightHand=unknown('inconsistent-grip');hands.leftHand=unknown('inconsistent-grip');
  }
  const weapons=[];
  for(const name of handNames){
   const hand=hands[name];
   if(hand.kind==='unknown')warnings.push(name+':'+hand.reason);
   if(hand.kind==='weapon'&&!weapons.some(weapon=>weapon.instanceId===hand.instanceId))weapons.push({...hand});
  }
  const visual=hand=>{
   if(hand.kind==='empty')return ['empty'];
   if(hand.kind==='unknown')return ['unknown',hand.reason];
   // Weapon instances normally share master artwork; retained IDs allow explicit unique variants.
   return [hand.kind,hand.masterId,hand.grip||null,hand.category||null,
    hand.masterId?null:hand.instanceId];
  };
  return {contractVersion:api.CONTRACT_VERSION,hands,weapons,
   shieldHands:handNames.filter(name=>hands[name].kind==='shield'),
   unarmed:handNames.every(name=>hands[name].kind==='empty'),
   known:warnings.length===0,warnings,assumedLegacyHands:options.assumedLegacyHands===true,
   signature:JSON.stringify(handNames.map(name=>visual(hands[name])))};
 }
 Object.assign(api,{readBattleLoadout});
})(globalThis.AleaBattleArt);
