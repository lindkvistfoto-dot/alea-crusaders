/* Alea Crusaders · Akademin: Drakar och Demoner Expert, Träning och erfarenhet.
 * Pure rule engine (no database writes). Character-specific progress belongs to
 * characters.data, not shared skill masters. */
(function(root){
 'use strict';
 const ATTR={STY:'Styrka',FYS:'Fysik',STO:'Storlek',SMI:'Smidighet',INT:'Intelligens',PSY:'Psykisk kraft',KAR:'Karisma'};
 const integer=(v,def=0)=>v===null||v===undefined||v===''?def:Number.isInteger(Number(v))?Number(v):NaN;
 const category=r=>String(r?.expert_category||'A').toUpperCase()==='B'?'B':'A';
 const skillName=s=>String(s?.name||'').trim().toLocaleLowerCase('sv-SE');
 const findSkill=(character,rule)=>(character?.skills||[]).find(s=>String(s.skillId||'')===String(rule.id)||skillName(s)===skillName(rule));
 const tracked=(character,rule)=>(character?.baseChanceSkills||[]).find(s=>String(s.skillId||'')===String(rule.id));
 const skillState=(character,rule)=>{
  const owned=findSkill(character,rule),bc=tracked(character,rule);
  return {owned,tracked:bc,fv:integer(owned?.fv,0),erf:integer(owned?.erf??bc?.erf,0),bonus:Math.max(0,integer(character?.live?.bonusExp,0))};
 };
 function multiplier(target,cat='A'){
  const fv=integer(target,-1);
  if(fv<1)return null;
  if(cat==='B')return fv<=2?1:fv<=4?2:fv===5?3:null;
  return fv<=10?1:fv<=14?2:fv<=17?3:fv<=20?4:6;
 }
 function quote(character,rule,useBonus=true){
  if(!rule||!rule.id)throw Error('Registrerad färdighet saknas.');
  const data=skillState(character,rule),cost=integer(rule.cost,0),cat=category(rule);
  const next=data.fv+1,factor=multiplier(next,cat);
  const required=cost>0&&factor?cost*factor:null;
  const available=data.erf+(useBonus?data.bonus:0);
  return {...data,category:cat,next,baseCost:cost,multiplier:factor,required,available,
   ready:required!==null&&available>=required,missing:required===null?null:Math.max(0,required-available)};
 }
 function purchase(character,rule,useBonus=true){
  const q=quote(character,rule,useBonus);
  if(!q.ready)throw Error(q.required===null?'Färdigheten kan inte köpas med nuvarande Expertregler.':'Det finns inte tillräckligt med erfarenhetspoäng.');
  const draft=JSON.parse(JSON.stringify(character));
  draft.skills=Array.isArray(draft.skills)?draft.skills:[];
  let row=findSkill(draft,rule);
  if(!row){row={skillId:rule.id,name:rule.name,fv:0,erf:q.erf};draft.skills.push(row)}
  const fromSkill=Math.min(q.erf,q.required),fromBonus=q.required-fromSkill;
  row.skillId=rule.id;row.name=rule.name;row.fv=q.next;row.erf=q.erf-fromSkill;
  draft.baseChanceSkills=(draft.baseChanceSkills||[]).filter(s=>String(s.skillId)!==String(rule.id));
  draft.live=draft.live||{};
  draft.live.bonusExp=Math.max(0,(integer(draft.live.bonusExp,0))-fromBonus);
  draft.academyHistory=(draft.academyHistory||[]).concat([{
   kind:'purchase',skillId:rule.id,skillName:rule.name,fromFv:q.fv,toFv:q.next,
   skillErf:fromSkill,bonusErf:fromBonus,spent:q.required,at:new Date().toISOString()
  }]).slice(-80);
  return {character:draft,receipt:{fv:q.next,cost:q.required,fromSkill,fromBonus}};
 }
 function baseValue(character,rule){
  const key=String(rule?.base_attribute||rule?.grundegenskap||'').trim().toUpperCase();
  const field=ATTR[key]||key;
  const raw=character?.base?.[field];
  return {key,value:integer(raw?.v,NaN),group:integer(raw?.g,NaN)};
 }
 function trainingAllowed(character,rule){
  const fv=skillState(character,rule).fv,attr=baseValue(character,rule);
  const exempt=category(rule)==='B'||String(rule?.type||'').toUpperCase()==='LÄR';
  return {allowed:exempt||Number.isFinite(attr.value)&&fv<attr.value,exempt,attribute:attr.value};
 }
 function teacherQuote(character,rule,opts){
  const categoryValue=category(rule),fv=skillState(character,rule).fv;
  const intelligence=integer(opts.intelligence,NaN);
  const masterFv=integer(opts.fv,NaN);
  const classmates=integer(opts.classmates,NaN);
  const differentRace=integer(opts.differentRace,NaN);
  if(!Number.isInteger(intelligence)||intelligence<13||intelligence>100)throw Error('Läraren måste ha INT 13 eller högre.');
  if(!Number.isInteger(masterFv)||masterFv<0||masterFv>100)throw Error('Ange lärarens verkliga FV.');
  if(masterFv<(categoryValue==='B'?4:15))throw Error('Läraren saknar tillräckligt FV för att undervisa.');
  if(categoryValue==='A'&&masterFv<fv+3)throw Error('Läraren måste ha minst tre FV över eleven.');
  if(categoryValue==='B'&&masterFv<=fv)throw Error('Lärarens FV måste vara högre än elevens.');
  if(classmates<1||classmates>100||differentRace<0||differentRace>classmates)throw Error('Ange giltig klasstorlek och antal elever av annan ras.');
  const effectiveSize=classmates+differentRace;
  if(effectiveSize>intelligence)throw Error('Klassen är större än lärarens INT-kapacitet (andra raser räknas dubbelt).');
  const alone=classmates===1,small=effectiveSize<=intelligence/2;
  const bonus=(categoryValue==='A'?Math.max(0,masterFv-18):masterFv===5?5:0)+(small?5:0)+(alone?10:0);
  const otherRace=opts.ownDifferentRace===true;
  if(otherRace&&differentRace<1)throw Error('Eleven av annan ras måste räknas in i klasstorleken.');
  const weeklySm=(opts.magician===true?300:150)*(otherRace?1.5:1)*(alone?intelligence:small?2:1);
  return {bonus,weeklySm,alone,small,effectiveSize,category:categoryValue};
 }
 function duration(mode,hours=8){
  if(mode==='teacher')return 7;
  if(mode!=='self')throw Error('Välj giltig träningsform.');
  const h=integer(hours,NaN);
  if(![4,6,8].includes(h))throw Error('Ensamträning är 4, 6 eller 8 timmar per dag.');
  return h===8?7:h===6?11:14;
 }
 function plan(character,rule,{mode='self',hours=8,teacher=null,day}={}){
  const today=integer(day,NaN);
  if(!Number.isInteger(today)||today<1)throw Error('Kampanjens dag måste vara känd för att boka träning.');
  if(character?.academyTraining?.status==='active')throw Error('Rollfiguren har redan pågående träning.');
  const eligible=trainingAllowed(character,rule);
  if(!eligible.allowed)throw Error('FV har nått grundegenskapens gräns för träning.');
  const group=baseValue(character,rule).group;
  if(!Number.isInteger(group)||group<0)throw Error('Grundegenskapens grupp saknas: kan inte göra egenskapsslag.');
  const details=mode==='teacher'?teacherQuote(character,rule,teacher||{}):null;
  const session={status:'active',skillId:rule.id,skillName:rule.name,mode,
    startDay:today,readyDay:today+duration(mode,hours),
    hoursPerDay:mode==='teacher'?8:integer(hours),
    rolls:mode==='teacher'?2:1,cl:group+(details?.bonus||0),
    costSm:details?.weeklySm||0,teacher:details?{...teacher,details}:null};
  return session;
 }
 function finish(character,rule,day,random=Math.random){
  const training=character?.academyTraining,today=integer(day,NaN);
  if(!training||training.status!=='active')throw Error('Det finns ingen aktiv träning.');
  if(String(training.skillId)!==String(rule.id))throw Error('Färdigheten för träningspasset saknas.');
  if(!Number.isInteger(today)||today<training.readyDay)throw Error('Träningsperioden är inte färdig ännu.');
  const rolls=[];
  for(let i=0;i<training.rolls;i++){
   const r=random();
   if(!Number.isFinite(r)||r<0||r>=1)throw Error('Tärningsslaget är ogiltigt.');
   const die=Math.floor(r*20)+1;
   rolls.push({die,success:die<=Math.max(0,Math.min(20,training.cl))});
  }
  const earned=rolls.filter(x=>x.success).length;
  const draft=JSON.parse(JSON.stringify(character));
  let skill=findSkill(draft,rule);
  if(!skill){
   draft.baseChanceSkills=draft.baseChanceSkills||[];
   skill=tracked(draft,rule);
   if(!skill){skill={skillId:rule.id,name:rule.name,erf:0};draft.baseChanceSkills.push(skill)}
  }
  skill.erf=Math.max(0,integer(skill.erf,0))+earned;
  draft.academyTraining=null;
  draft.academyHistory=(draft.academyHistory||[]).concat([{
   kind:'training',skillId:rule.id,skillName:rule.name,mode:training.mode,
   startDay:training.startDay,completedDay:today,rolls,earned,costSm:training.costSm
  }]).slice(-80);
  return {character:draft,rolls,earned};
 }
 root.aleaAcademyRules={category,findSkill,tracked,skillState,multiplier,quote,purchase,baseValue,
  trainingAllowed,teacherQuote,duration,plan,finish};
})(window);
