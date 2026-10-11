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
     const isBattery=p.property_key==='magic_battery';
     const stored=isBattery?p.battery_loaded:null;
     if(isBattery&&!stored)continue;
     const magic=isBattery?stored:p;
     const rule=registry.find(r=>magic.spell_id&&str(r.id)===str(magic.spell_id))||
      registry.find(r=>magic.spell_key&&r.spell_key===magic.spell_key)||
      registry.find(r=>str(r.name).localeCompare(str(magic.spell_name),'sv',{sensitivity:'base'})===0);
     if(!rule||!rule.id||!item.equipId||!p.id)continue;
     const casting=isBattery?'fixed':p.cast_mode||'fixed';
     const learned=(Array.isArray(character.spells)?character.spells:[]).find(s=>
      (s.rule_id&&str(s.rule_id)===str(rule.id))||
      (s.spell_id&&str(s.spell_id)===str(rule.id))||
      str(s.name).localeCompare(str(rule.name),'sv',{sensitivity:'base'})===0);
     const fv=isBattery?Number(stored.fv):casting==='fixed'?Number(p.fixed_fv):casting==='automatic'?null:
      Number(learned?.fv??p.wearer_fv??0);
     const eg=Math.max(1,Math.floor(Number(isBattery?stored.effect_grade:p.effect_grade)||1));
     const multiplier=Math.max(1,Math.floor(Number(p.effect_multiplier??p.summon_count)||1));
     const provider=root.aleaMagicConfigurator;
     let availability={ready:true,reason:'',day:dayNumber};
     try{if(provider?.state)availability=provider.state(p,dayNumber)}catch(error){
      availability={ready:false,reason:'Ogiltiga inställningar',day:dayNumber}
     }
     if(!isBattery&&casting==='automatic')availability={...availability,ready:false,
      reason:'Automatisk aktivering utan färdighetsslag kräver separat regel'};
     else if((p.activation||'action')!=='action')availability={...availability,ready:false,
      reason:'Passiva och villkorsstyrda krafter kan inte aktiveras som handling'};
     else if(!(fv>0))availability={...availability,ready:false,
      reason:casting==='wearer'?'Bäraren saknar giltigt FV i besvärjelsen':'Föremålets besvärjelse saknar ett giltigt FV'};
     const key='item:'+group+':'+str(item.equipId)+':'+str(p.id);
     output.push({
      key,source:'item',group,group_label:groupLabel,item_index:index,
      item_id:str(item.equipId),item_name:str(item.name)||'Magiskt föremål',
      power_index:powerIndex,power_id:str(p.id),property_key:p.property_key||'cast_spell',battery:isBattery,
      spell_id:str(rule.id),spell_key:str(rule.spell_key),name:rule.name,
      rule_id:rule.id,rule,
      effect_grade:eg,effect_multiplier:multiplier,cast_mode:casting,
      fv:Number.isFinite(fv)&&fv>0?fv:null,
      psy_source:isBattery?'none':p.psy_source||'artifact',activation:p.activation||'action',
      recharge_rule:p.recharge_rule||'none',ready:availability.ready===true,battery_spell_id:isBattery?str(stored.spell_id):null,
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
