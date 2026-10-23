/* ATHENA: pure, reusable skill target resolution. No dice rolls or action costs. */
(function(root){
 'use strict';
 const attributes={STY:'Styrka',FYS:'Fysik',STO:'Storlek',SMI:'Smidighet',INT:'Intelligens',PSY:'Psykisk kraft',KAR:'Karisma'};
 const valid=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>0;
 function resolve(character,skillId,rules=[]){
  const id=String(skillId||'').trim();
  const rule=(Array.isArray(rules)?rules:[]).find(row=>String(row?.id||'')===id);
  const skill=(Array.isArray(character?.skills)?character.skills:[]).find(row=>String(row?.skillId||row?.skill_id||'')===id);
  const name=rule?.name||skill?.name||id;
  if(!id)return Object.freeze({fv:null,source:'missing-skill',skillId:id,skillName:name,skill});
  if(valid(skill?.fv))return Object.freeze({fv:Number(skill.fv),source:'FV',skillId:id,skillName:name,skill});
  const bc=String(rule?.bc||'').trim().toUpperCase();
  if(bc&&bc!=='NONE'&&bc!=='0'&&bc!=='—'){
   const key=attributes[bc]||Object.keys(character?.base||{}).find(key=>key.toLocaleUpperCase('sv-SE')===bc);
   const chance=key?character?.base?.[key]?.g:null;
   if(valid(chance))return Object.freeze({fv:Number(chance),source:'BC '+bc,skillId:id,skillName:name,skill});
  }
  return Object.freeze({fv:null,source:'unavailable',skillId:id,skillName:name,skill});
 }
 root.aleaSkillResolver=Object.freeze({resolve});
})(globalThis);
