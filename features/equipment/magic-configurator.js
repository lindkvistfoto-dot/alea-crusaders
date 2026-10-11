/* v0.35.86 – universal configuration for magical powers.
   A power describes WHAT is cast, at which EG/FV, its multiplier and recovery.
   It deliberately does not execute a spell or change the spell's native EG. */
(function(root){
 'use strict';
 const recovery={none:'Ingen tidsgräns',next_day:'Efter nästa kampanjdag',manual:'Återställs manuellt'};
 const casting={wearer:'Bärarens FV',fixed:'Föremålets FV',automatic:'Utan färdighetsslag'};
 const activation={action:'Handling',passive:'Passiv',reaction:'Reaktion',trigger:'Utlöses vid villkor'};
 function whole(value,min=0,max=9999,def=min){
  const n=value===null||value===undefined||value===''?def:Number(value);
  if(!Number.isInteger(n)||n<min||n>max)throw new Error('Ogiltigt heltal: '+String(value));
  return n
 }
 function normalize(config={}){
  const kind=config.kind||'spell';
  const legacyMultiplier=config.effect_multiplier??(kind==='spell'&&config.summon_count>0?config.summon_count:1);
  const multiplier=whole(legacyMultiplier,1,1000,1);
  const eg=whole(config.effect_grade,1,50,1);
  const castMode=config.cast_mode||'fixed';
  if(!Object.hasOwn(casting,castMode)&&castMode!=='none')throw new Error('Okänt sätt att kasta');
  const fv=castMode==='fixed'?whole(config.fixed_fv,1,100,5):null;
  const rule=config.recharge_rule||'none';
  if(!Object.hasOwn(recovery,rule))throw new Error('Okänd återhämtningsregel');
  const max=config.max_charges==null||config.max_charges===''?null:whole(config.max_charges,0,9999);
  const price=whole(config.charge_cost,0,9999,0);
  const uses=config.uses_per_day==null||config.uses_per_day===''?null:whole(config.uses_per_day,0,9999);
  return {
   ...config,kind,effect_grade:eg,effect_multiplier:multiplier,
   cast_mode:castMode,fixed_fv:fv,recharge_rule:rule,
   max_charges:max,charge_cost:price,uses_per_day:uses
  }
 }
 function dayNumber(value){const n=Number(value);return Number.isInteger(n)&&n>=1?n:null}
 function state(config={},campaignDay=null){
  const c=normalize(config),day=dayNumber(campaignDay),usedDay=dayNumber(c.last_used_day);
  const usedToday=day!==null&&usedDay===day;
  const previousDay=day!==null&&usedDay!==null&&usedDay<day;
  const usage=usedToday?whole(c.uses_today,0,9999,0):0;
  const charges=c.max_charges===null?null:
   (c.recharge_rule==='next_day'&&previousDay?c.max_charges:
    whole(c.charges_remaining,0,9999,c.max_charges));
  let reason='';
  if(c.recharge_rule==='next_day'){
   if(day===null)reason='Kampanjdag saknas – kan inte kontrollera återhämtning';
   else if(usedDay!==null&&day<=usedDay)reason='Tillgänglig efter nästa kampanjdag';
  }
  if(!reason&&c.recharge_rule==='manual'&&c.manual_locked===true)reason='Måste återställas manuellt';
  if(!reason&&day===null&&c.uses_per_day!==null)reason='Kampanjdag saknas';
  if(!reason&&c.uses_per_day!==null&&usage>=c.uses_per_day)reason='Dagens användningar förbrukade';
  if(!reason&&charges!==null&&charges<c.charge_cost)reason='Inte tillräckligt med laddningar';
  return {ready:!reason,reason,charges,uses_today:usage,day};
 }
 function markUsed(config={},campaignDay=null){
  const c=normalize(config),status=state(c,campaignDay);
  if(!status.ready)throw new Error(status.reason);
  if(status.day===null)throw new Error('Kampanjdag saknas – kan inte registrera användning');
  return {...c,
   last_used_day:status.day,
   uses_today:status.uses_today+1,
   manual_locked:c.recharge_rule==='manual',
   charges_remaining:status.charges===null?null:status.charges-c.charge_cost
  }
 }
 function reset(config={}){
  const c=normalize(config);
  return {...c,last_used_day:null,uses_today:0,manual_locked:false,
   charges_remaining:c.max_charges===null?null:c.max_charges}
 }
 function preview(config={}){
  const c=normalize(config);
  return {effect_grade:c.effect_grade,effect_multiplier:c.effect_multiplier,
   cast_mode:c.cast_mode,fixed_fv:c.fixed_fv,recharge_rule:c.recharge_rule,
   // for spells that yield discrete objects/creatures: one base unit times N.
   // This is NOT equivalent to raising EG, and does NOT cast anything.
   result_units:c.effect_multiplier
  }
 }
 root.aleaMagicConfigurator={normalize,state,markUsed,reset,preview,casting,recovery,activation};
})(typeof window!=='undefined'?window:globalThis);
