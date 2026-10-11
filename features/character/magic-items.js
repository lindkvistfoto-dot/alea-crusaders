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
   {property_key:'magic_battery',name:'Magiskt batteri',kind:'spell'},
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
 function isBattery(p){return p?.property_key==='magic_battery'}
 function powerTitle(p){
  if(isBattery(p))return 'Magiskt batteri'+(p.battery_loaded?' · '+p.battery_loaded.spell_name+' (EG '+p.battery_loaded.effect_grade+')':' · oladdat');
  return p?.kind==='spell'?spellName(p)+' (EG '+(p.effect_grade||1)+' ×'+(p.effect_multiplier??p.summon_count??1)+')':(p?.property_name||'Magisk egenskap')
 }
 function powerDescription(power){
  if(isBattery(power))return power.battery_loaded?
   'Laddad av '+(power.battery_loaded.caster_name||'besvärjare')+' · FV '+power.battery_loaded.fv+' · EG '+power.battery_loaded.effect_grade+
    (power.battery_loaded.grade_roll?' ('+power.battery_loaded.grade_roll+': '+power.battery_loaded.grade_rolls.join('+')+')':'')+' · kvick · 1 laddning':
   'Oladdat · '+(power.battery_grade_mode==='dice'?'Slumpad EG '+(power.battery_grade_dice||'1T3'):'Valfri EG vid laddning')+' · kan kastas som kvick';
  return power.kind==='spell'?
   'EG '+(power.effect_grade||1)+' ×'+(power.effect_multiplier??power.summon_count??1)+' · '+
   (power.cast_mode==='automatic'?'Automatisk':power.cast_mode==='fixed'?'FV '+(power.fixed_fv??5):'Bärarens FV')+' · '+
   (power.recharge_rule==='next_day'?'Efter ny dag':power.recharge_rule==='manual'?'Återställs av SL':'Ingen dagspärr')+
   (power.max_charges!=null?' · Laddningar '+(power.charges_remaining??power.max_charges)+'/'+power.max_charges:''):
   power.details||power.property_name||''
 }
 function summary(x){
  if(!magical(x))return '';
  return powers(x).length?powers(x).map(powerTitle).join(' · '):'Magiskt föremål';
 }
 function badge(kind,index){
  const x=get(kind,index);if(!magical(x))return '';
  return '<span class="character-item-magic-badge" role="img" aria-label="Magiskt föremål: '+safe(summary(x))+'" title="'+safe(summary(x))+'">'+
   '<img src="./features/character/assets/alea-magic-item-sigil.png" alt="" loading="lazy"></span>';
 }
 function control(kind,index){
  const x=get(kind,index);if(!x)return '';
  return '<div class="character-item-magic-control">'+(magical(x)?badge(kind,index):'')+
   '<label><input type="checkbox" '+(magical(x)?'checked ':'')+
    'onchange="setCharacterItemMagical(\''+kind+'\','+index+',this.checked)"> ✦ Magisk</label>'+
   (magical(x)?'<button type="button" class="smallbtn" onclick="openCharacterItemPowers(\''+kind+'\','+index+')">Egenskaper'+(powers(x).length?' ('+powers(x).length+')':'')+'</button>':'')+
   ((kind==='weapon'||kind==='shield')?
    '<span class="character-item-image-preview" title="'+safe(x.imageOverridePath?'Unik bild på föremålet':'Standardbild')+'">'+(imageTag(kind,x)||'◇')+'</span>'+
    '<button type="button" class="smallbtn" onclick="openCharacterItemImage(&quot;'+kind+'&quot;,'+index+')">🖼 '+(x.imageOverridePath?'Byt bild':'Bild')+'</button>':'')+
   '</div>'
 }

 function masterImagePath(kind,item){
  if(kind==='weapon')return typeof ruleWeaponForItem==='function'?ruleWeaponForItem(item)?.image_path:null;
  if(kind==='shield')return typeof characterShieldRule==='function'?characterShieldRule(item)?.image_path:null;
  return null;
 }
 function imagePath(kind,item){return item?.imageOverridePath||masterImagePath(kind,item)||null}
 function imageTag(kind,item){
  const url=window.aleaEquipmentArt?.src(imagePath(kind,item));
  return url?'<img class="character-gear-image" src="'+safe(url)+'" loading="lazy" alt="">':'';
 }
 function imageThumbnail(kind,index){return imageTag(kind,get(kind,index))}
 let imageSaving=false;
 function openImage(kind,index){
  if(!editable()||!['weapon','shield'].includes(kind))return;
  const item=get(kind,index),art=window.aleaEquipmentArt;
  if(!item||!art?.startInstance)return;
  const standardUrl=art.src(masterImagePath(kind,item));
  const standard=standardUrl?'<img class="character-gear-image" src="'+safe(standardUrl)+'" alt="Registerbild">':
   '<span class="muted">Ingen standardbild uppladdad</span>';
  modal('Föremålsbild · '+(item.name||labels[kind]),
   '<div class="character-item-image-editor">'+
   '<p>Den unika bilden tillhör bara <strong>'+safe(item.name||labels[kind])+
   '</strong>, även om föremålet inte är magiskt. Masterbilden påverkas inte.</p>'+
   '<div class="character-item-image-master"><strong>Standardbild från registret</strong>'+standard+'</div>'+
   art.startInstance(item)+
   '<div class="rule-editor-actions">'+
   '<button type="button" class="btn" onclick="closeSkillInfo()">Avbryt</button>'+
   '<button type="button" class="btn primary" id="characterItemImageSave" onclick="saveCharacterItemImage(&quot;'+kind+'&quot;,'+index+')">Spara bild</button>'+
   '</div></div>');
 }
 async function saveImage(kind,index){
  if(imageSaving||!editable()||!['weapon','shield'].includes(kind))return;
  const item=get(kind,index),art=window.aleaEquipmentArt,userId=supabaseSession?.user?.id;
  if(!item||!art?.prepareInstance||!userId)return;
  const charId=current?.id,itemId=item.equipId,assetId=item.imageAssetId||crypto.randomUUID();
  const ctx={key:SUPABASE_KEY,token:supabaseSession?.access_token,getToken:freshSupabaseAccessToken};
  const saveButton=$('characterItemImageSave');
  imageSaving=true;if(saveButton)saveButton.disabled=true;
  let change=null;
  try{
   change=await art.prepareInstance(userId,assetId,ctx);
   if(current?.id!==charId||get(kind,index)?.equipId!==itemId)
    throw new Error('Föremålet ändrades under uppladdningen. Öppna bildeditorn igen.');
   item.imageOverridePath=change.path;
   if(change.uploaded)item.imageAssetId=assetId;
   save();refresh(kind);
   // Never delete an old image before the central character save has completed.
   art.reset();closeSkillInfo();
  }catch(error){
   if(change?.uploaded)await art.removeStored(change.uploaded,ctx).catch(()=>{});
   alert('Kunde inte spara den unika bilden: '+error.message);
  }finally{
   imageSaving=false;if(saveButton)saveButton.disabled=false;
  }
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
 function campaignDay(){return typeof campaignDayState!=='undefined'?campaignDayState?.day_number:null}
 function availability(power){
  return window.aleaMagicConfigurator?.state(power,campaignDay())||{ready:true,reason:'',day:null}
 }
 function itemPowers(kind,index){
  const x=get(kind,index);if(!x||!magical(x))return;
  modal('Magiska egenskaper · '+(x.name||labels[kind]),
   '<div class="character-magic-list">'+
    '<p class="muted">Egenskaperna tillhör bara detta exemplar. Besvärjelser kopplas till Experts register. Handlingsaktiverad föremålsmagi kastas i strid via Magi, enligt samma regler för FV, EG, målval och SR som vanlig magi.</p>'+
    (powers(x).length?powers(x).map((power,i)=>'<div class="character-magic-power">'+
      '<div><b>'+safe(powerTitle(power))+'</b><small>'+
       safe(powerDescription(power))+'</small></div>'+
      '<button type="button" class="smallbtn" onclick="editCharacterItemPower(\''+kind+'\','+index+','+i+')">Ändra</button>'+
      (isBattery(power)&&editable()&&!power.battery_loaded?
       '<button type="button" class="smallbtn" onclick="openCharacterBatteryCharger(\''+kind+'\','+index+','+i+')">⚡ Ladda</button>':'')+
      (window.aleaMagicConfigurator?
       '<div class="character-magic-power-status"><span class="'+(availability(power).ready?'ready':'not-ready')+'">'+
        safe(availability(power).ready?'Redo':availability(power).reason)+'</span>'+
        (editable()&&!isBattery(power)&&availability(power).ready?
         '<button type="button" class="smallbtn" title="Notera användning – kastar inte besvärjelsen automatiskt" onclick="registerCharacterItemPowerUse(\''+kind+'\','+index+','+i+')">Registrera användning</button>':'')+
        (editable()&&power.recharge_rule==='manual'&&!availability(power).ready?
         '<button type="button" class="smallbtn" onclick="resetCharacterItemPower(\''+kind+'\','+index+','+i+')">Återställ</button>':'')+'</div>':'')+
      '<button type="button" class="deletebtn" onclick="deleteCharacterItemPower(\''+kind+'\','+index+','+i+')">×</button>'+
     '</div>').join(''):'<p class="muted">Inga egenskaper kopplade ännu.</p>')+
    '<div class="rule-editor-actions"><button type="button" class="btn" onclick="closeSkillInfo()">Stäng</button>'+
     '<button type="button" class="btn primary" onclick="editCharacterItemPower(\''+kind+'\','+index+',-1)">+ Lägg till egenskap</button></div></div>'
  );
 }
 function showFields(){
  const selected=$('cmpProperty')?.value||'cast_spell';
  const def=registry().find(p=>p.property_key===selected);
  const kind=def?.kind||'special',battery=selected==='magic_battery';
  $('skillModalBody')?.querySelectorAll('[data-character-magic-type]').forEach(node=>{
   node.hidden=!node.dataset.characterMagicType.split(' ').includes(kind);
  });
  $('skillModalBody')?.querySelectorAll('[data-battery-hide]').forEach(node=>{if(battery)node.hidden=true});
  $('skillModalBody')?.querySelectorAll('[data-battery-only]').forEach(node=>{node.hidden=!battery});
  const diceField=$('cmpBatteryDice');
  if(diceField)diceField.hidden=!battery||$('cmpBatteryMode')?.value!=='dice';
  const cast=$('cmpCastMode'),fv=$('cmpFixedFv');
  if(fv)fv.closest('label').hidden=kind!=='spell'||cast?.value!=='fixed';
  const hint=$('cmpHint');
  if(hint)hint.textContent=battery?'Laddaren betalar PSY vid laddning och väljer då besvärjelse. Föremålet kastar sedan besvärjelsen kvickt med laddarens FV, utan ytterligare PSY. Även misslyckade kast förbrukar laddningen.':kind==='spell'?'Effektgrad och multiplikator är oberoende. EG 1 ×4 betyder fyra upprepningar av grundeffekten – INTE EG 4. Ett kast tar en handling. Icke-kvick magi förbereds en SR, medan kvick magi kan kastas samma SR. Skada och elementarframmanning kan upprepas (max 20); särskilda effekter avgörs av SL.':
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
    '<label data-character-magic-type="spell" data-battery-hide class="wide">Besvärjelse ur Expertregistret<select id="cmpSpell">'+
     options(Object.fromEntries(spells.map(row=>[row.id,row.name])),before?.spell_id||'','— Välj besvärjelse —')+'</select></label>'+
    '<label data-character-magic-type="spell" data-battery-hide>Effektgrad (EG)<input id="cmpEg" type="number" min="1" max="50" value="'+safe(before?.effect_grade??1)+'"></label>'+
    '<label data-character-magic-type="spell" data-battery-hide>Effektmultiplikator<input id="cmpMultiplier" type="number" min="1" max="1000" step="1" value="'+safe(before?.effect_multiplier??before?.summon_count??1)+'"></label>'+
    '<label data-character-magic-type="spell" data-battery-hide>Sätt att kasta<select id="cmpCastMode" onchange="window.aleaCharacterItemMagic?.showFields()">'+options(rolls,before?.cast_mode||'fixed')+'</select></label>'+
    '<label data-character-magic-type="spell" data-battery-hide>Föremålets FV<input id="cmpFixedFv" type="number" min="1" max="100" value="'+safe(before?.fixed_fv??5)+'"></label>'+
    '<label data-character-magic-type="spell" data-battery-hide>Betalning av PSY<select id="cmpPsy">'+options(cost,before?.psy_source||'artifact')+'</select></label>'+
    '<label data-character-magic-type="spell" data-battery-hide>Resultatenhet (valfritt)<input id="cmpResultLabel" maxlength="120" placeholder="Ex. Eldsalamander" value="'+safe(before?.result_label||before?.summon_creature||'')+'"></label>'+
    '<label data-character-magic-type="spell" data-battery-hide>Besvärjelsens resultat<input id="cmpResultText" maxlength="200" placeholder="Ex. frammanar en eldsalamander" value="'+safe(before?.result_text||'')+'"></label>'+
    '<label data-character-magic-type="bonus protection status">Påverkad egenskap<input id="cmpTargetAttr" value="'+safe(before?.target_attribute||'')+'" placeholder="FV, ABS, motstånd"></label>'+
    '<label data-character-magic-type="bonus protection status">Bonus / styrka<input id="cmpBonus" type="number" step="1" value="'+safe(before?.bonus_value??0)+'"></label>'+
    '<label data-character-magic-type="spell protection status special" data-battery-hide>Max laddningar<input id="cmpMaxCharges" type="number" min="0" max="9999" placeholder="Obegränsat om tomt" value="'+safe(before?.max_charges??'')+'"></label>'+
    '<label data-character-magic-type="spell protection status special" data-battery-hide>Laddningskostnad/användning<input id="cmpChargeCost" type="number" min="0" max="9999" value="'+safe(before?.charge_cost??0)+'"></label>'+
    '<label data-battery-hide>Användningar per dag<input id="cmpUses" type="number" min="0" max="9999" placeholder="Obegränsat om tomt" value="'+safe(before?.uses_per_day??'')+'"></label>'+
    '<label data-battery-hide>Kan användas igen<select id="cmpRecharge">'+options(window.aleaMagicConfigurator?.recovery||{none:'Utan tidsgräns',next_day:'Efter ny kampanjdag',manual:'När SL återställer'},before?.recharge_rule||'none')+'</select></label>'+
    '<label data-battery-only>Effektgrad vid laddning<select id="cmpBatteryMode" onchange="window.aleaCharacterItemMagic?.showFields()">'+options({chosen:'Besvärjaren väljer EG',dice:'Slumpad EG med tärning'},before?.battery_grade_mode||'chosen')+'</select></label>'+
    '<label data-battery-only id="cmpBatteryDice">EG-tärning<input id="cmpBatteryNotation" placeholder="1T3" value="'+safe(before?.battery_grade_dice||'1T3')+'"></label>'+
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
  const battery=definition.property_key==='magic_battery';
  if(definition.kind==='spell'&&!battery&&!spell)return alert('Välj en besvärjelse i Expertregistret.');
  const old=powers(x)[powerIndex];
  let grade=1,maxCharges=null,chargeCost=0,uses=null,multiplier=1,bonus=0,fv=null;
  try{
   if(definition.kind==='spell'&&!battery){
    grade=number('Eg',1,50);multiplier=number('Multiplier',1,1000);
    if($('cmpCastMode')?.value==='fixed')fv=number('FixedFv',1,100);
   }
   if(['spell','protection','status','special'].includes(definition.kind)&&!battery){
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
   spell_id:definition.kind==='spell'&&!battery?spell.id:null,
   spell_key:definition.kind==='spell'&&!battery?spell.spell_key:null,
   spell_name:definition.kind==='spell'&&!battery?spell.name:null,
   effect_grade:grade,
   effect_multiplier:multiplier,
   recharge_rule:$('cmpRecharge')?.value||'none',
   cast_mode:battery?'fixed':definition.kind==='spell'?$('cmpCastMode')?.value||'fixed':'none',
   fixed_fv:fv,
   psy_source:definition.kind==='spell'&&!battery?$('cmpPsy')?.value||'artifact':'none',
   result_label:definition.kind==='spell'&&!battery?$('cmpResultLabel')?.value.trim()||'':'',
   result_text:definition.kind==='spell'&&!battery?$('cmpResultText')?.value.trim()||'':'',
   battery_grade_mode:battery?$('cmpBatteryMode')?.value||'chosen':null,
   battery_grade_dice:battery?$('cmpBatteryNotation')?.value.trim().toUpperCase()||'1T3':null,
   battery_loaded:battery&&isBattery(old)?old.battery_loaded||null:null,
   last_used_day:old?.last_used_day??null,
   uses_today:old?.uses_today??0,
   max_charges:maxCharges,
   charges_remaining:maxCharges==null?null:Math.min(maxCharges,Math.max(0,Number(old?.charges_remaining??maxCharges))),
   charge_cost:chargeCost,
   uses_per_day:uses,
   target_attribute:['bonus','protection','status'].includes(definition.kind)?$('cmpTargetAttr')?.value.trim()||'':'',
   bonus_value:bonus,
   activation:battery?'action':$('cmpActivation')?.value||'action',
   target_text:$('cmpTarget')?.value.trim()||'',
   duration_text:$('cmpDuration')?.value.trim()||'',
   details:$('cmpDetails')?.value.trim()||''
  };
  try{
   if(battery&&created.battery_grade_mode==='dice')window.aleaMagicConfigurator?.rollBatteryGrade(created,null,()=>0);
   if(window.aleaMagicConfigurator)window.aleaMagicConfigurator.normalize(created)
  }catch(error){return alert('Kontrollera magisk egenskap: '+error.message)}
  if(!keyId.test(created.property_key))return alert('Egenskapsnyckeln är ogiltig.');
  if(!Array.isArray(x.magicPowers))x.magicPowers=[];
  if(Number(powerIndex)>=0&&old)x.magicPowers[powerIndex]=created;
  else x.magicPowers.push(created);
  save();refresh(kind);itemPowers(kind,index);
 }
 function registerUse(kind,index,powerIndex){
  if(!editable()||!window.aleaMagicConfigurator)return;
  const x=get(kind,index),p=powers(x)[powerIndex];if(!magical(x)||!p)return;
  try{
   const status=availability(p);
   if(!status.ready)throw new Error(status.reason);
   x.magicPowers[powerIndex]=window.aleaMagicConfigurator.markUsed(p,campaignDay());
   save();refresh(kind);itemPowers(kind,index);
  }catch(error){alert(error.message)}
 }
 function resetPower(kind,index,powerIndex){
  if(!editable()||!window.aleaMagicConfigurator)return;
  const x=get(kind,index),p=powers(x)[powerIndex];if(!magical(x)||!p)return;
  if(p.recharge_rule!=='manual')return;
  x.magicPowers[powerIndex]=window.aleaMagicConfigurator.reset(p);
  save();refresh(kind);itemPowers(kind,index);
 }
 async function deletePower(kind,index,powerIndex){
  if(!editable())return;
  const x=get(kind,index),power=powers(x)[powerIndex];if(!power)return;
  if(!await askConfirm('Ta bort magisk egenskap','Ta bort '+powerTitle(power)+' från just detta föremål?','Ta bort',true))return;
  x.magicPowers.splice(powerIndex,1);save();refresh(kind);itemPowers(kind,index)
 }
 window.aleaCharacterItemMagic={magical,badge,control,summary,imagePath,imageThumbnail,openImage,saveImage,toggle,open:itemPowers,
  edit:editPower,savePower,deletePower,showFields,powers,availability,registerUse,resetPower};
 window.setCharacterItemMagical=toggle;
 window.openCharacterItemPowers=itemPowers;
 window.editCharacterItemPower=editPower;
 window.saveCharacterItemPower=savePower;
 window.deleteCharacterItemPower=deletePower;
 window.registerCharacterItemPowerUse=registerUse;
 window.resetCharacterItemPower=resetPower;
 window.openCharacterItemImage=openImage;
 window.saveCharacterItemImage=saveImage;
})();
