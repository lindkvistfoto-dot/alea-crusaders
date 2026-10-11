/* v0.35.87 — Shared, read-only spell projection for UNIQUE magical items.
   Never writes item powers to character.spells or learned spell snapshots. */
(function(root){
 'use strict';
 const groups={weapons:'Vapen',armor:'Rustning',shields:'Sköld',equipment:'Utrustning'};
 const str=v=>String(v??'');
 function itemSpells(character,registry=[],dayNumber=null){
  if(!character||!Array.isArray(registry))return [];
  const output=[];
  for(const [group,groupLabel] of Object.entries(groups)){
   const items=Array.isArray(character[group])?character[group]:[];
   for(const [index,item] of items.entries()){
    if(!item||(item.isMagical!==true&&item.magic?.enabled!==true))continue;
    const powers=Array.isArray(item.magicPowers)?item.magicPowers:[];
    for(const [powerIndex,p] of powers.entries()){
     if(!p||(p.property_key!=='cast_spell'&&p.kind!=='spell')||p.active===false)continue;
     const rule=registry.find(r=>p.spell_id&&str(r.id)===str(p.spell_id))||
      registry.find(r=>p.spell_key&&r.spell_key===p.spell_key)||
      registry.find(r=>str(r.name).localeCompare(str(p.spell_name),'sv',{sensitivity:'base'})===0);
     if(!rule||!rule.id||!item.equipId||!p.id)continue;
     const casting=p.cast_mode||'fixed';
     const fv=casting==='fixed'?Number(p.fixed_fv):casting==='automatic'?null:
      Number(p.wearer_fv??0);
     const eg=Math.max(1,Math.floor(Number(p.effect_grade)||1));
     const multiplier=Math.max(1,Math.floor(Number(p.effect_multiplier??p.summon_count)||1));
     const provider=root.aleaMagicConfigurator;
     let availability={ready:true,reason:'',day:dayNumber};
     try{if(provider?.state)availability=provider.state(p,dayNumber)}catch(error){
      availability={ready:false,reason:'Ogiltiga inställningar',day:dayNumber}
     }
     if(casting==='automatic')availability={...availability,ready:false,
      reason:'Automatisk aktivering stöds ännu inte i strid'};
     else if(!(fv>0))availability={...availability,ready:false,
      reason:'Föremålets besvärjelse saknar ett giltigt FV'};
     const key='item:'+group+':'+str(item.equipId)+':'+str(p.id);
     output.push({
      key,source:'item',group,group_label:groupLabel,item_index:index,
      item_id:str(item.equipId),item_name:str(item.name)||'Magiskt föremål',
      power_index:powerIndex,power_id:str(p.id),property_key:p.property_key||'cast_spell',
      spell_id:str(rule.id),spell_key:str(rule.spell_key),name:rule.name,
      rule_id:rule.id,rule,
      effect_grade:eg,effect_multiplier:multiplier,cast_mode:casting,
      fv:Number.isFinite(fv)&&fv>0?fv:null,
      psy_source:p.psy_source||'artifact',activation:p.activation||'action',
      recharge_rule:p.recharge_rule||'none',ready:availability.ready===true,
      unavailable_reason:availability.reason||'',charges:availability.charges??null,
      uses_today:availability.uses_today??0
     });
    }
   }
  }
  return output;
 }
 root.aleaItemSpells={list:itemSpells};
})(typeof window!=='undefined'?window:globalThis);
