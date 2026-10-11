/* v0.35.85 — Magical powers attached to an individual character's gear.
   Instances remain in characters.data; ordinary masters and sibling inventory
   stacks are NEVER made magical by toggling one unique item.
   Casting/summoning is configured here, not yet automatically executed. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const groups={weapon:'weapons',armor:'armor',shield:'shields',equipment:'equipment'};
 const labels={weapon:'Vapen',armor:'Rustning',shield:'Sköld',equipment:'Utrustning'};
 const standard=[
  {property_key:'cast_spell',name:'Kasta besvärjelse',kind:'spell'},
  {property_key:'attribute_bonus',name:'Magisk bonus',kind:'bonus'},
  {property_key:'magic_protection',name:'Magiskt skydd',kind:'protection'},
  {property_key:'status_effect',name:'Magiskt tillstånd',kind:'status'},
  {property_key:'special_power',name:'Särskild egenskap',kind:'special'}
 ];
 const act={action:'Handling',passive:'Passiv',reaction:'Reaktion',trigger:'Villkor'};
 const cost={artifact:'Artefaktens kraft',wearer:'Bärarens PSY',none:'Ingen PSY'};
 const rolls={wearer:'Bärarens FV',fixed:'Föremålets eget FV',automatic:'Automatisk aktivering'};
 const keyId=/^[a-z][a-z0-9_]{1,79}$/;
 function editable(){return !!current&&typeof canEditCharacter==='function'&&canEditCharacter(current)}
 function get(kind,index){const arr=current?.[groups[kind]];return arr?.[Number(index)]||null}
 function magical(x){return x?.isMagical===true||x?.magic?.enabled===true}
 function powers(x){return Array.isArray(x?.magicPowers)?x.magicPowers:[]}
 function spellName(x){return x?.spell_name||'Besvärjelse saknas'}
 function powerTitle(p){return p?.kind==='spell'?spellName(p)+' (EG '+(p.effect_grade||1)+' ×'+(p.effect_multiplier??p.summon_count??1)+')':(p?.property_name||'Magisk egenskap')}
 function summary(x){
  if(!magical(x))return '';
  return powers(x).length?powers(x).map(powerTitle).join(' · '):'Magiskt föremål';
 }
 function badge(kind,index){
  const x=get(kind,index);if(!magical(x))return '';
  return '<span class="character-item-magic-badge" title="'+safe(summary(x))+'">✦ '+safe(powers(x).length?summary(x):'Magisk')+'</span>'
 }
 function control(kind,index){
  const x=get(kind,index);if(!x)return '';
  return '<div class="character-item-magic-control">'+
   '<label><input type="checkbox" '+(magical(x)?'checked ':'')+
    'onchange="setCharacterItemMagical(\''+kind+'\','+index+',this.checked)"> ✦ Magisk</label>'+
   (magical(x)?'<button type="button" class="smallbtn" onclick="openCharacterItemPowers(\''+kind+'\','+index+')">Egenskaper'+(powers(x).length?' ('+powers(x).length+')':'')+'</button>':'')+
   '</div>'
 }
 function refresh(kind){
  if(kind==='equipment')renderEquipment();
  else renderWeapons();
  if(typeof renderCurrentEquipment==='function'&&!$('currentEquipmentModal')?.classList.contains('hidden'))renderCurrentEquipment();
 }
 function toggle(kind,index,enabled){
  if(!editable())return;
  const x=get(kind,index);if(!x)return;
  if(kind==='equipment'&&enabled&&!magical(x)){
   // Stacked stock must not become entirely magical. Isolate ONE item.
   const n=equipmentItemCount(x);
   if(n>1){
    const copy={...x,equipId:newEquipItemId('equipment'),count:n-1};
    delete copy.quantity;delete copy.isMagical;delete copy.magicPowers;
    if(x.quantity!=null&&x.count==null)x.quantity=1;
    else x.count=1;
    current.equipment.splice(Number(index)+1,0,copy);
   }
  }
  x.isMagical=!!enabled;
  // Keep configured powers when temporarily unticking the box, but no longer
  // show/offer them while the instance isn't magical.
  if(!Array.isArray(x.magicPowers))x.magicPowers=[];
  save();refresh(kind)
 }
 function modal(title,markup){
  $('skillModalTitle').textContent=title;
  $('skillModalBody').innerHTML=markup;
  $('skillModal').classList.remove('hidden');
 }
 function registry(){
  const fromAdmin=window.aleaMagicProperties?.allDefinitions?.()||[];
  const results=[...standard];
  fromAdmin.filter(row=>row.active!==false).forEach(row=>{
   if(!results.some(base=>base.property_key===row.property_key))results.push(row);
  });
  return results
 }
 function options(object,selected,empty=''){
  return (empty?'<option value="">'+safe(empty)+'</option>':'')+
   Object.entries(object).map(([key,label])=>
    '<option value="'+safe(key)+'"'+(String(key)===String(selected)?' selected':'')+'>'+safe(label)+'</option>').join('')
 }
 function itemPowers(kind,index){
  const x=get(kind,index);if(!x||!magical(x))return;
  modal('Magiska egenskaper · '+(x.name||labels[kind]),
   '<div class="character-magic-list">'+
    '<p class="muted">Egenskaperna tillhör bara detta exemplar. Besvärjelser kopplas till Experts register. Användning i strid aktiveras i nästa steg.</p>'+
    (powers(x).length?powers(x).map((power,i)=>'<div class="character-magic-power">'+
      '<div><b>'+safe(powerTitle(power))+'</b><small>'+
       safe(power.kind==='spell'?
       'EG '+(power.effect_grade||1)+' ×'+(power.effect_multiplier??power.summon_count??1)+' · '+
       (power.cast_mode==='automatic'?'Automatisk':power.cast_mode==='fixed'?'FV '+(power.fixed_fv??5):'Bärarens FV')+' · '+(power.recharge_rule==='next_day'?'Efter ny dag':power.recharge_rule==='manual'?'Återställs av SL':'Ingen dagspärr')+
       (power.max_charges!=null?' · Laddningar '+(power.charges_remaining??power.max_charges)+'/'+power.max_charges:''):
       (power.details||power.property_name||''))+'</small></div>'+
      '<button type="button" class="smallbtn" onclick="editCharacterItemPower(\''+kind+'\','+index+','+i+')">Ändra</button>'+
      '<button type="button" class="deletebtn" onclick="deleteCharacterItemPower(\''+kind+'\','+index+','+i+')">×</button>'+
     '</div>').join(''):'<p class="muted">Inga egenskaper kopplade ännu.</p>')+
    '<div class="rule-editor-actions"><button type="button" class="btn" onclick="closeSkillInfo()">Stäng</button>'+
     '<button type="button" class="btn primary" onclick="editCharacterItemPower(\''+kind+'\','+index+',-1)">+ Lägg till egenskap</button></div></div>'
  );
 }
 function showFields(){
  const selected=$('cmpProperty')?.value||'cast_spell';
  const def=registry().find(p=>p.property_key===selected);
  const kind=def?.kind||'special';
  $('skillModalBody')?.querySelectorAll('[data-character-magic-type]').forEach(node=>{
   node.hidden=!node.dataset.characterMagicType.split(' ').includes(kind);
  });
  const cast=$('cmpCastMode'),fv=$('cmpFixedFv');
  if(fv)fv.closest('label').hidden=kind!=='spell'||cast?.value!=='fixed';
  const hint=$('cmpHint');
  if(hint)hint.textContent=kind==='spell'?'Effektgrad och multiplikator är oberoende. EG 1 ×4 betyder fyra upprepningar av grundeffekten – INTE EG 4. Stridsmotorn aktiverar inte förmågan automatiskt ännu.':
   'Bonusar, skydd och specialeffekter är beskrivande tills de kopplas till stridssystemets effekter.';
 }
 async function editPower(kind,index,powerIndex=-1){
  if(!editable())return;
  const x=get(kind,index);if(!x||!magical(x))return;
  if(typeof loadRuleMagicRegistry==='function')await loadRuleMagicRegistry();
  const before=powers(x)[powerIndex]||null;
  const properties=registry();
  if(before?.property_key&&!properties.some(row=>row.property_key===before.property_key)){
   properties.push({property_key:before.property_key,name:before.property_name||before.property_key,kind:before.kind||'special'})
  }
  const choice=before?.property_key||'cast_spell';
  const spells=typeof ruleSpells!=='undefined'?ruleSpells:[];
  modal((before?'Redigera':'Lägg till')+' egenskap · '+(x.name||labels[kind]),
   '<div class="rule-editor-grid character-magic-editor">'+
    '<label class="wide">Magisk egenskap<select id="cmpProperty" onchange="window.aleaCharacterItemMagic?.showFields()">'+
     properties.map(row=>'<option value="'+safe(row.property_key)+'"'+(row.property_key===choice?' selected':'')+'>'+safe(row.name)+'</option>').join('')+'</select></label>'+
    '<label>Aktivering<select id="cmpActivation">'+options(act,before?.activation||'action')+'</select></label>'+
    '<label data-character-magic-type="spell" class="wide">Besvärjelse ur Expertregistret<select id="cmpSpell">'+
     options(Object.fromEntries(spells.map(row=>[row.id,row.name])),before?.spell_id||'','— Välj besvärjelse —')+'</select></label>'+
    '<label data-character-magic-type="spell">Effektgrad (EG)<input id="cmpEg" type="number" min="1" max="50" value="'+safe(before?.effect_grade??1)+'"></label>'+
    '<label data-character-magic-type="spell">Effektmultiplikator<input id="cmpMultiplier" type="number" min="1" max="1000" step="1" value="'+safe(before?.effect_multiplier??before?.summon_count??1)+'"></label>'+
    '<label data-character-magic-type="spell">Sätt att kasta<select id="cmpCastMode" onchange="window.aleaCharacterItemMagic?.showFields()">'+options(rolls,before?.cast_mode||'fixed')+'</select></label>'+
    '<label data-character-magic-type="spell">Föremålets FV<input id="cmpFixedFv" type="number" min="1" max="100" value="'+safe(before?.fixed_fv??5)+'"></label>'+
    '<label data-character-magic-type="spell">Betalning av PSY<select id="cmpPsy">'+options(cost,before?.psy_source||'artifact')+'</select></label>'+
    '<label data-character-magic-type="spell">Resultatenhet (valfritt)<input id="cmpResultLabel" maxlength="120" placeholder="Ex. Eldsalamander" value="'+safe(before?.result_label||before?.summon_creature||'')+'"></label>'+
    '<label data-character-magic-type="spell">Besvärjelsens resultat<input id="cmpResultText" maxlength="200" placeholder="Ex. frammanar en eldsalamander" value="'+safe(before?.result_text||'')+'"></label>'+
    '<label data-character-magic-type="bonus protection status">Påverkad egenskap<input id="cmpTargetAttr" value="'+safe(before?.target_attribute||'')+'" placeholder="FV, ABS, motstånd"></label>'+
    '<label data-character-magic-type="bonus protection status">Bonus / styrka<input id="cmpBonus" type="number" step="1" value="'+safe(before?.bonus_value??0)+'"></label>'+
    '<label data-character-magic-type="spell protection status special">Max laddningar<input id="cmpMaxCharges" type="number" min="0" max="9999" placeholder="Obegränsat om tomt" value="'+safe(before?.max_charges??'')+'"></label>'+
    '<label data-character-magic-type="spell protection status special">Laddningskostnad/användning<input id="cmpChargeCost" type="number" min="0" max="9999" value="'+safe(before?.charge_cost??0)+'"></label>'+
    '<label>Användningar per dag<input id="cmpUses" type="number" min="0" max="9999" placeholder="Obegränsat om tomt" value="'+safe(before?.uses_per_day??'')+'"></label>'+
    '<label>Kan användas igen<select id="cmpRecharge">'+options(window.aleaMagicConfigurator?.recovery||{none:'Utan tidsgräns',next_day:'Efter ny kampanjdag',manual:'När SL återställer'},before?.recharge_rule||'none')+'</select></label>'+
    '<label>Mål / område<input id="cmpTarget" value="'+safe(before?.target_text||'')+'"></label>'+
    '<label>Varaktighet<input id="cmpDuration" value="'+safe(before?.duration_text||'')+'"></label>'+
    '<label class="wide">Beskrivning / särskilda regler<textarea id="cmpDetails" rows="3">'+safe(before?.details||'')+'</textarea></label>'+
    '<p id="cmpHint" class="wide muted"></p>'+
    '<div class="rule-editor-actions wide"><button type="button" class="btn" onclick="openCharacterItemPowers(\''+kind+'\','+index+')">Tillbaka</button>'+
      '<button type="button" class="btn primary" onclick="saveCharacterItemPower(\''+kind+'\','+index+','+powerIndex+')">Spara egenskap</button></div></div>'
  );
  showFields()
 }
 function number(id,min,max,nullable=false){
  const raw=$('cmp'+id)?.value??'';
  if(nullable&&raw==='')return null;
  const val=Number(raw);
  if(!Number.isInteger(val)||val<min||val>max)throw Error('Ange ett giltigt heltal för '+id+'.');
  return val;
 }
 function savePower(kind,index,powerIndex){
  if(!editable())return;
  const x=get(kind,index);if(!x||!magical(x))return;
  const definition=registry().find(p=>p.property_key===$('cmpProperty')?.value);
  if(!definition)return alert('Välj en giltig magisk egenskap.');
  const spell=typeof ruleSpells!=='undefined'?ruleSpells.find(sp=>String(sp.id)===String($('cmpSpell')?.value)):null;
  if(definition.kind==='spell'&&!spell)return alert('Välj en besvärjelse i Expertregistret.');
  const old=powers(x)[powerIndex];
  let grade=1,maxCharges=null,chargeCost=0,uses=null,multiplier=1,bonus=0,fv=null;
  try{
   if(definition.kind==='spell'){
    grade=number('Eg',1,50);multiplier=number('Multiplier',1,1000);
    if($('cmpCastMode')?.value==='fixed')fv=number('FixedFv',1,100);
   }
   if(['spell','protection','status','special'].includes(definition.kind)){
    maxCharges=number('MaxCharges',0,9999,true);chargeCost=number('ChargeCost',0,9999);
   }
   uses=number('Uses',0,9999,true);
   if(!['none','next_day','manual'].includes($('cmpRecharge')?.value||'none'))throw Error('Ogiltig återhämtningsregel.');
   if(['bonus','protection','status'].includes(definition.kind)){
    bonus=Number($('cmpBonus')?.value||0);
    if(!Number.isInteger(bonus)||Math.abs(bonus)>9999)throw Error('Ogiltigt bonusvärde.');
   }
  }catch(error){return alert(error.message)}
  const created={
   id:old?.id||newEquipItemId('power'),
   property_key:definition.property_key,
   property_name:definition.name,
   kind:definition.kind,
   spell_id:definition.kind==='spell'?spell.id:null,
   spell_key:definition.kind==='spell'?spell.spell_key:null,
   spell_name:definition.kind==='spell'?spell.name:null,
   effect_grade:grade,
   effect_multiplier:multiplier,
   recharge_rule:$('cmpRecharge')?.value||'none',
   cast_mode:definition.kind==='spell'?$('cmpCastMode')?.value||'fixed':'none',
   fixed_fv:fv,
   psy_source:definition.kind==='spell'?$('cmpPsy')?.value||'artifact':'none',
   result_label:definition.kind==='spell'?$('cmpResultLabel')?.value.trim()||'':'',
   result_text:definition.kind==='spell'?$('cmpResultText')?.value.trim()||'':'',
   last_used_day:old?.last_used_day??null,
   uses_today:old?.uses_today??0,
   max_charges:maxCharges,
   charges_remaining:maxCharges==null?null:Math.min(maxCharges,Math.max(0,Number(old?.charges_remaining??maxCharges))),
   charge_cost:chargeCost,
   uses_per_day:uses,
   target_attribute:['bonus','protection','status'].includes(definition.kind)?$('cmpTargetAttr')?.value.trim()||'':'',
   bonus_value:bonus,
   activation:$('cmpActivation')?.value||'action',
   target_text:$('cmpTarget')?.value.trim()||'',
   duration_text:$('cmpDuration')?.value.trim()||'',
   details:$('cmpDetails')?.value.trim()||''
  };
  try{
   if(window.aleaMagicConfigurator)window.aleaMagicConfigurator.normalize(created)
  }catch(error){return alert('Kontrollera magisk egenskap: '+error.message)}
  if(!keyId.test(created.property_key))return alert('Egenskapsnyckeln är ogiltig.');
  if(!Array.isArray(x.magicPowers))x.magicPowers=[];
  if(Number(powerIndex)>=0&&old)x.magicPowers[powerIndex]=created;
  else x.magicPowers.push(created);
  save();refresh(kind);itemPowers(kind,index);
 }
 async function deletePower(kind,index,powerIndex){
  if(!editable())return;
  const x=get(kind,index),power=powers(x)[powerIndex];if(!power)return;
  if(!await askConfirm('Ta bort magisk egenskap','Ta bort '+powerTitle(power)+' från just detta föremål?','Ta bort',true))return;
  x.magicPowers.splice(powerIndex,1);save();refresh(kind);itemPowers(kind,index)
 }
 window.aleaCharacterItemMagic={magical,badge,control,summary,toggle,open:itemPowers,
  edit:editPower,savePower,deletePower,showFields,powers};
 window.setCharacterItemMagical=toggle;
 window.openCharacterItemPowers=itemPowers;
 window.editCharacterItemPower=editPower;
 window.saveCharacterItemPower=savePower;
 window.deleteCharacterItemPower=deletePower;
})();
