/* A specialization is data on the existing tva_vapen skill row. */
(function(){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let target=null;
 const editable=()=>typeof current!=='undefined'&&current&&typeof canEditCharacter==='function'&&canEditCharacter(current);
 function render(index){
  const skill=current?.skills?.[index];
  if(skill?.skillId!=='tva_vapen')return;
  const body=document.getElementById('skillModalBody');if(!body)return;
  body.querySelector('[data-two-weapon-specializations]')?.remove();
  target={character:current,index};
  const ambi=globalThis.aleaHandRules.swordHand(current.derived?.Svärdshand)==='both';
  const name=id=>(ruleWeapons||[]).find(w=>w.id===id)?.name||id;
  const list=(skill.specializations||[]).map((s,n)=>'<li>'+esc(name(s.swordWeaponId))+' + '+esc(name(s.shieldWeaponId))+
   ' · FV '+esc(s.fv??skill.fv)+(editable()?'<button type="button" class="btn" onclick="window.aleaTwoWeaponSkills.remove('+n+')" aria-label="Ta bort specialisering">×</button>':'')+'</li>').join('');
  const options=(ruleWeapons||[]).filter(w=>w.category==='melee').map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join('');
  body.insertAdjacentHTML('beforeend','<section class="combat-two-specializations" data-two-weapon-specializations><h3>Vapenkombinationer</h3><p>'+
   (ambi?'Båda svärdshänderna: kombinationens ordning är fri.':'Ange vapnen i svärdshand respektive sköldhand.')+
   ' Otränad kombination ger −15 FV. Vapnets FV begränsas av kombinationens FV.</p>'+(list?'<ul>'+list+'</ul>':'<p>Ingen tränad kombination registrerad.</p>')+
   (editable()?'<div class="rule-editor-grid"><label>'+(ambi?'Vapen 1':'Svärdshand')+'<select id="twoWeaponSword">'+options+'</select></label><label>'+(ambi?'Vapen 2':'Sköldhand')+'<select id="twoWeaponShield">'+options+'</select></label><label>FV<input id="twoWeaponFv" type="number" min="1" max="999" value="'+esc(skill.fv||1)+'"></label></div><button type="button" class="btn" onclick="window.aleaTwoWeaponSkills.add()">Spara vapenkombination</button>':'')+'</section>');
 }
 function skill(){return target&&editable()&&target.character===current?current.skills?.[target.index]:null}
 window.aleaTwoWeaponSkills={
  render,
  add(){
   const row=skill();if(row?.skillId!=='tva_vapen')return;
   const sword=document.getElementById('twoWeaponSword')?.value,shield=document.getElementById('twoWeaponShield')?.value;
   const fv=Number(document.getElementById('twoWeaponFv')?.value);
   if(!sword||!shield||!Number.isFinite(fv)||fv<=0||fv>999)return;
   const spec={swordWeaponId:sword,shieldWeaponId:shield,fv};
   row.specializations=Array.isArray(row.specializations)?row.specializations:[];
   const existing=row.specializations.findIndex(s=>s.swordWeaponId===sword&&s.shieldWeaponId===shield);
   if(existing<0)row.specializations.push(spec);else row.specializations[existing]=spec;
   save();render(target.index);
  },
  remove(index){const row=skill();if(row?.skillId!=='tva_vapen')return;row.specializations.splice(index,1);save();render(target.index)}
 };
 const original=window.showSkillInfo;
 if(typeof original==='function')window.showSkillInfo=async function(index){const result=await original.apply(this,arguments);render(index);return result};
})();
