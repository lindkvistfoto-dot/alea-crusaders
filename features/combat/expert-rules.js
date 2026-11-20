// Shared Drakar och Demoner Expert calculations. Both the classic ALEA runtime
// and isolated encounter authorities load this dependency before resolving an action.
((root) => {
function expertSkillSpecialMax(fv){
 fv=Math.floor(Number(fv)||0);
 if(fv<20)return 5;
 return Math.min(19,5+Math.floor((fv-20)/4))
}
function expertSkillInitialResolution(ctx,roll){
 let cl=Number(ctx.target),fv=Number(ctx.baseTarget??cl),success=roll!==20&&roll<=cl;
 if(cl>=20){
  if(roll===1)return {outcome:'perfect'};
  if(roll===2)return {confirm:'high_perfect',fallback:'special',note:'Kontrollslag för perfekt slag.'};
  if(roll===20)return {confirm:'high_fumble',fallback:'fail',note:'Kontrollslag för fummel.'};
  if(roll>=2&&roll<=expertSkillSpecialMax(fv))return {outcome:'special'};
  return {outcome:success?'success':'fail'}
 }
 if(roll===1)return {confirm:'perfect',fallback:'success',note:'Kontrollslag för perfekt slag.'};
 if(roll===20)return {confirm:'fumble',fallback:'fail',note:'Kontrollslag för fummel.'};
 if(success&&roll>=2&&roll<=5)return {confirm:'special',fallback:'success',note:'Kontrollslag för särskilt slag.'};
 return {outcome:success?'success':'fail'}
}
function expertSkillConfirmationResolution(ctx,second){
 let kind=ctx.skillConfirmKind??ctx.confirmKind,fv=Number(ctx.baseTarget??ctx.target);
 if(kind==='perfect')return second<=fv?'perfect':'success';
 if(kind==='special')return second<=fv?'special':'success';
 if(kind==='fumble')return second>fv||second===20?'fumble':'fail';
 if(kind==='high_perfect')return second<=Math.max(0,fv-20)?'perfect':'special';
 if(kind==='high_fumble')return second===20?'fumble':'fail';
 return 'fail'
}
const COMBAT_HIT_LOCATION_TABLES={
 humanoid:{
  A:{die:8,label:'Projektil / oförsvarad närstrid',rows:[
   {min:1,max:1,key:'right_leg',label:'Höger ben'},
   {min:2,max:2,key:'left_leg',label:'Vänster ben'},
   {min:3,max:3,key:'abdomen',label:'Mage'},
   {min:4,max:5,key:'chest',label:'Bröstkorg'},
   {min:6,max:6,key:'right_arm',label:'Höger arm'},
   {min:7,max:7,key:'left_arm',label:'Vänster arm'},
   {min:8,max:8,key:'head',label:'Huvud'}
  ]},
  B:{die:10,label:'Försvarad närstrid',rows:[
   {min:1,max:1,key:'right_leg',label:'Höger ben'},
   {min:2,max:2,key:'left_leg',label:'Vänster ben'},
   {min:3,max:3,key:'abdomen',label:'Mage'},
   {min:4,max:4,key:'chest',label:'Bröstkorg'},
   {min:5,max:6,key:'right_arm',label:'Höger arm'},
   {min:7,max:8,key:'left_arm',label:'Vänster arm'},
   {min:9,max:10,key:'head',label:'Huvud'}
  ]}
 }
};
function combatParseDamageFormula(formula,fallback=''){
 const raw=String(formula||fallback||'').trim().toUpperCase().replace(/\s+/g,'');
 if(!raw)return null;
 if(/^[+-]?\d+$/.test(raw))return{qty:0,sides:0,modifier:Number(raw),formula:raw};
 const match=raw.match(/^(\d+)T(\d+)([+-]\d+)?$/);
 if(!match)return null;
 return{
  qty:Math.max(0,Number(match[1])||0),
  sides:Math.max(0,Number(match[2])||0),
  modifier:Number(match[3]||0),
  formula:raw
 }
}
function secureDie(sides){let max=0x100000000-(0x100000000%sides),a=new Uint32Array(1),v;do{crypto.getRandomValues(a);v=a[0]}while(v>=max);return(v%sides)+1}
function compareInitiative(a, b) {
  return b.total - a.total || b.smi - a.smi || a.original_sort - b.original_sort ||
    String(a.name).localeCompare(String(b.name), 'sv');
}
function halfMovement(maximum) {
  return Math.floor(maximum / 2);
}
function physicalDamage(weaponValue, bonusValue, absorption, ward, ignoreArmor) {
  const gross = Math.max(0, Math.max(0, Math.floor(weaponValue)) + Math.floor(bonusValue));
  const effectiveArmor = ignoreArmor === true ? 0 : absorption;
  return {gross, effectiveArmor, net: Math.max(0, gross - effectiveArmor - ward)};
}

// The client can animate each request and an isolated authority can roll it
// immediately. Both advance the same confirmation sequence and produce one result.
function* expertRoll(target) {
  const ctx = {target, baseTarget: target};
  const roll = yield {sides: 20, confirmation: false};
  const initial = expertSkillInitialResolution(ctx, roll);
  const confirmationRoll = initial.confirm ? yield {sides: 20, confirmation: true} : null;
  const outcome = initial.confirm
    ? expertSkillConfirmationResolution({...ctx, skillConfirmKind: initial.confirm}, confirmationRoll)
    : initial.outcome;
  return {roll, confirmation_roll: confirmationRoll, outcome, success: ['success','special','perfect'].includes(outcome)};
}
function attackPolicy(outcome) {
  return {fullDamage: outcome === 'special' || outcome === 'perfect', ignoreArmor: outcome === 'perfect'};
}
function damageDice(weaponSpec, bonusSpec, fullDamage) {
  const parts = [{kind:'weapon', ...weaponSpec}, {kind:'bonus', ...bonusSpec}];
  return {
    dice: fullDamage ? [] : parts.filter(p => p.qty > 0 && p.sides > 0).map(({qty,sides}) => ({qty,sides})),
    resolve(faces, armor, ward, ignoreArmor, before) {
      let i = 0;
      const damageRolls = [];
      const values = parts.map(part => {
        const dice = [];
        for (let n = 0; n < part.qty; n++) dice.push(fullDamage ? part.sides : (Number(faces[i++]) || 0));
        if (!fullDamage && dice.length) damageRolls.push({kind:part.kind, qty:part.qty, sides:part.sides, faces:dice});
        return Math.floor((Number(part.modifier) || 0) + dice.reduce((sum,v) => sum + v, 0));
      });
      const weaponValue = Math.max(0,values[0]), bonusValue = values[1];
      const damage = physicalDamage(weaponValue,bonusValue,armor,ward,ignoreArmor);
      const after = Math.max(0,before - damage.net);
      return {...damage, weaponValue, bonusValue, damageRolls, after, defeated: after <= 0};
    },
  };
}
function movementBudget(maximum, remaining, actionCommitted) {
  const spent = Math.max(0, maximum - remaining);
  const halfLeft = Math.max(0, halfMovement(maximum) - spent);
  return {
    allowance: actionCommitted ? Math.min(remaining, halfLeft) : remaining,
    keepsAction: cost => spent + cost <= halfMovement(maximum),
  };
}
function meleeReach(length) {
  if (length == null || length <= 1) return 1;
  return length <= 3 ? 2 : 3;
}
root.aleaExpertRules = Object.freeze({
  initialRoll: expertSkillInitialResolution, confirmationRoll: expertSkillConfirmationResolution,
  specialMax: expertSkillSpecialMax, secureDie, hitTables: COMBAT_HIT_LOCATION_TABLES,
  damageSpec: combatParseDamageFormula, damageDice, attackPolicy, expertRoll,
  compareInitiative, halfMovement, movementBudget, meleeReach,
});
})(globalThis);
