/* Pure rules shared by the classic equipment/combat clients and tests.
 * Loaded synchronously: static hosting must not depend on the dice module.
 * Grip is a translation of rule_weapon_grip, not an alternative rule table. */
(function(root){
 'use strict';
 const slots=['rightHand','leftHand'];
 const otherHand=hand=>hand==='leftHand'?'rightHand':'leftHand';
 const key=item=>String(item?.equipId||item?.id||item?.name||'');
 const present=value=>value!==null&&value!==undefined&&value!=='';
 function swordHand(value,ambidextrous=false){
  const raw=String(value??'').trim().toLocaleLowerCase('sv-SE').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/bada|ambi|both|two.?handed/.test(raw))return 'both';
  if(/^(vanster|left|v)(?:hand|hant|\s|$)/.test(raw))return 'leftHand';
  if(/^(hoger|right|h)(?:hand|hant|\s|$)/.test(raw))return 'rightHand';
  return ambidextrous?'both':'rightHand';
 }
 function grip(handling,weaponGroup,charGroup){
  const req=Number(weaponGroup),cg=Number(charGroup);
  if(!['1H','1-2H','2H'].includes(handling)||!present(weaponGroup)||!present(charGroup)||
   !Number.isInteger(req)||!Number.isInteger(cg)||req<0||cg<0)
   return {canUse:false,hands:null,glMultiplier:0,status:'invalid'};
  let hands=handling==='1H'?1:2;
  if(handling==='1-2H'&&cg>=req+1)hands=1;
  if(cg>=req)return {canUse:true,hands,glMultiplier:1,status:'normal'};
  if(cg===req-1)return {canUse:true,hands,glMultiplier:.5,status:'understrength'};
  return {canUse:false,hands,glMultiplier:0,status:'too_weak'};
 }
 function resolveHands(profile,group,ruleForItem=()=>null,disabled=[]){
  const eq=profile.currentEquipment||{},blocked=new Set(disabled.map(String)),hands={},issues=[];
  for(const slot of slots){
   const ref=eq[slot];
   if(!ref?.itemId){hands[slot]=null;continue}
   const list=ref.kind==='weapon'?profile.weapons:ref.kind==='shield'?profile.shields:profile.equipment;
   const item=(list||[]).find(w=>key(w)===String(ref.itemId));
   if(!item||blocked.has(key(item))||item.destroyed===true||item.dropped===true){hands[slot]=null;continue}
   const rule=ref.kind==='weapon'?ruleForItem(item):null;
   const handling=item.handling||rule?.handling||'';
   const req=present(item.strengthGroup)?item.strengthGroup:rule?.strength_group;
   const linked=!!handling&&present(req);
   const g=ref.kind==='weapon'?(linked?grip(handling,req,group):
    {canUse:true,hands:handling==='2H'?2:Number(ref.hands)===2?2:1,glMultiplier:1,status:'legacy'}):null;
   hands[slot]={slot,ref:{...ref},item,kind:ref.kind,grip:g,linked,usable:!g||g.canUse};
   if(g&&!g.canUse)issues.push((item.name||'Vapnet')+': '+(g.status==='too_weak'?'för låg STY-grupp':'fattningen kan inte beräknas'));
  }
  for(const slot of slots){
   const held=hands[slot],other=otherHand(slot),opposite=hands[other];
   if(!held||held.kind!=='weapon')continue;
   if(held.grip.hands===2){
    if(opposite&&key(opposite.item)!==key(held.item)){
     held.usable=false;opposite.usable=false;
     issues.push((held.item.name||'Vapnet')+' kräver båda händerna; den andra handen är upptagen');
    }else if(!opposite){hands[other]={...held,slot:other,virtual:true}}
   }else if(opposite&&opposite.kind==='weapon'&&key(opposite.item)===key(held.item)){
    // Historic merged refs are a single physical item, never two weapons.
    const primary=slots.includes(held.ref.primaryHand)?held.ref.primaryHand:slot;
    hands[otherHand(primary)]=null;
   }
  }
  const weapons=[],shields=[],seen=new Set();
  for(const slot of slots){
   const held=hands[slot];if(!held?.usable||seen.has(key(held.item)))continue;
   seen.add(key(held.item));
   if(held.kind==='weapon')weapons.push(held.item);
   if(held.kind==='shield')shields.push(held.item);
  }
  return {hands,weapons,shields,issues:[...new Set(issues)]};
 }
 function weaponType(item){return String(item?.weaponTypeId||item?.weapon_id||item?.name||'')}
 function twoWeapons(profile,held,firstHand=null){
  const preference=swordHand(profile.swordHand,profile.ambidextrous===true);
  const first=preference==='both'?(slots.includes(firstHand)?firstHand:'rightHand'):preference;
  const second=otherHand(first),a=held.hands[first],b=held.hands[second];
  const fail=reason=>({eligible:false,reason,firstHand:first,secondHand:second});
  if(!a||!b||a.kind!=='weapon'||b.kind!=='weapon'||key(a.item)===key(b.item))return fail('Två olika vapen måste hållas i varsin hand.');
  if(!a.usable||!b.usable||!a.linked||!b.linked||a.grip.hands!==1||b.grip.hands!==1)
   return fail(held.issues[0]||'Båda vapnen måste få användas med en hand vid aktuell STY.');
  if([a,b].some(h=>!['melee',''].includes(String(h.item.weaponCategory||h.item.category||'melee'))))
   return fail('Två vapen kräver två närstridsvapen.');
  const skill=(profile.skills||[]).find(s=>s.skillId==='tva_vapen'||s.skill_id==='tva_vapen');
  if(!skill||!(Number(skill.fv)>0))return fail('Två vapen kräver ett tränat FV; färdighetens BC är 0.');
  const x=weaponType(a.item),y=weaponType(b.item);
  const specialization=(skill.specializations||[]).find(s=>
   (s.swordWeaponId===x&&s.shieldWeaponId===y)||
   (preference==='both'&&s.swordWeaponId===y&&s.shieldWeaponId===x));
  const modifier=specialization?0:-15;
  const fv=Number(specialization?.fv??skill.fv)+modifier;
  return {eligible:true,reason:'',firstHand:first,secondHand:second,firstWeapon:a.item,secondWeapon:b.item,
   skill,specialization:specialization||null,trained:!!specialization,modifier,fv};
 }
 function actionFv(weaponFv,combination){
  if(weaponFv==null||!Number.isFinite(Number(weaponFv)))return null;
  return combination?.eligible?Math.min(Number(weaponFv),combination.fv):Number(weaponFv);
 }
 const spent=action=>!!action&&['pending','resolving','resolved'].includes(action.status);
 function remainingActions(actions,eligible=true){
  return actions.filter(a=>a.status!=='cancelled'&&!spent(a)&&
   (a.slot_key!=='secondary'||eligible));
 }
 root.aleaHandRules=Object.freeze({slots,otherHand,swordHand,grip,resolveHands,twoWeapons,weaponType,actionFv,spent,remainingActions});
})(globalThis);
