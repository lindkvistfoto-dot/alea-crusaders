/* v0.35.84 — Reusable magic-property templates and per-artifact abilities.
 * The editor stores typed configuration; the combat engine MUST NOT execute
 * these powers until a dedicated integration is built and tested. */
(function(){
 'use strict';
 let definitions=[],powers=[],loaded=false,pending=null,saving=false;
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const kinds={spell:'Besvärjelse',bonus:'Bonus',protection:'Skydd',status:'Tillstånd',special:'Specialeffekt'};
 const activations={passive:'Passiv',action:'Handling',reaction:'Reaktion',trigger:'Utlöses vid villkor'};
 const psySources={artifact:'Artefaktens kraft',wearer:'Bärarens PSY',none:'Ingen PSY-kostnad'};
 const validKey=/^[a-z][a-z0-9_]{1,79}$/;
 const keyFromName=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
   .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,78);
 function options(map,selected,empty=''){
  return (empty?'<option value="">'+esc(empty)+'</option>':'')+
    Object.entries(map).map(([key,label])=>'<option value="'+esc(key)+'"'+(String(key)===String(selected)?' selected':'')+'>'+esc(label)+'</option>').join('');
 }
 function notify(error){alert(error?.message||String(error))}
 async function load(force=false){
  if(!activeUser()?.admin)return [];
  if(loaded&&!force)return definitions;
  if(pending)return pending;
  pending=(async()=>{
   const results=await Promise.all([
    dbJson('rule_magic_property_definitions?select=*&order=sort_order.asc,name.asc'),
    dbJson('rule_magic_artifact_powers?select=*&order=sort_order.asc,created_at.asc')
   ]);
   definitions=Array.isArray(results[0])?results[0]:[];
   powers=Array.isArray(results[1])?results[1]:[];
   loaded=true;return definitions;
  })();
  try{return await pending}finally{pending=null}
 }
 const getDefinition=id=>definitions.find(row=>String(row.id)===String(id))||null;
 const powersFor=id=>powers.filter(row=>String(row.artifact_id)===String(id));
 const getPower=id=>powers.find(row=>String(row.id)===String(id))||null;
 const spellFor=id=>(typeof ruleSpells!=='undefined'?ruleSpells:[]).find(row=>String(row.id)===String(id))||null;
 function powerName(power){
  const def=getDefinition(power.property_id);
  return def?.kind==='spell'
   ?(def.name+': '+(spellFor(power.spell_id)?.name||'Besvärjelse'))
   :(def?.name||'Okänd egenskap');
 }
 function summary(id){
  const list=powersFor(id).filter(row=>row.active);
  return list.length?list.map(powerName).join(' · '):'';
 }
 function render(){
  const list=$('adminMagicPropertiesTable');if(!list)return;
  const term=String($('adminMagicPropertySearch')?.value||'').toLocaleLowerCase('sv-SE').trim();
  const items=definitions.filter(row=>!term||[row.name,row.property_key,row.kind,row.description].some(v=>String(v||'').toLocaleLowerCase('sv-SE').includes(term)));
  if($('adminMagicPropertiesStatus'))$('adminMagicPropertiesStatus').textContent=definitions.length+' återanvändbara egenskaper · '+powers.length+' kopplingar till artefakter.';
  list.innerHTML='<div class="magic-property-head"><b>Egenskap</b><b>Typ</b><b>Beskrivning</b><b>Används av</b><b>Åtgärder</b></div>'+
   items.map(row=>'<div class="magic-property-row'+(row.active?'':' inactive')+'">'+
    '<div><strong>'+esc(row.name)+'</strong><small>'+esc(row.property_key)+'</small></div>'+
    '<div>'+esc(kinds[row.kind]||row.kind)+'</div>'+
    '<div class="magic-property-description">'+esc(row.description||'—')+'</div>'+
    '<div>'+powers.filter(p=>p.property_id===row.id).length+'</div>'+
    '<div class="magic-property-actions"><button type="button" class="smallbtn" onclick="editMagicProperty(\''+esc(row.id)+'\')">Redigera</button>'+
    '<button type="button" class="deletebtn" title="Ta bort" onclick="deleteMagicProperty(\''+esc(row.id)+'\')">×</button></div></div>').join('')+
   (!items.length?'<div class="magic-property-empty">Inga egenskaper matchar sökningen.</div>':'');
  window.aleaMagicArtifacts?.render?.();
 }
 async function refresh(force=false){
  try{await load(force);render()}
  catch(error){console.error('Magiska egenskaper kunde inte läsas',error);
   if($('adminMagicPropertiesStatus'))$('adminMagicPropertiesStatus').textContent='Kunde inte läsa egenskaper: '+error.message;
  }
 }
 function modal(title,html){
  $('adminEditorTitle').textContent=title;
  $('adminEditorBody').innerHTML=html;
  $('adminEditor').classList.remove('hidden');
 }
 function propertyEditor(id=''){
  if(!activeUser()?.admin)return;
  const row=id?getDefinition(id):null;if(id&&!row)return;
  const usage=row?powers.filter(p=>p.property_id===id).length:0;
  modal(row?'Redigera magisk egenskap':'Ny magisk egenskap',
   '<div class="rule-editor-grid magic-property-editor">'+
    '<label class="wide">Namn<input id="mpdName" maxlength="160" value="'+esc(row?.name||'')+'" placeholder="Ex. Kasta besvärjelse"></label>'+
    '<label>Nyckel<input id="mpdKey" maxlength="80" value="'+esc(row?.property_key||'')+'"'+(row?' readonly':'')+'></label>'+
    '<label>Typ<select id="mpdKind"'+(usage?' disabled title="Används av artefakter"':'')+'>'+options(kinds,row?.kind||'special')+'</select></label>'+
    '<label class="wide">Beskrivning<textarea id="mpdDescription" rows="4">'+esc(row?.description||'')+'</textarea></label>'+
    '<label>Sorteringsordning<input id="mpdSort" type="number" step="1" value="'+esc(row?.sort_order??0)+'"></label>'+
    '<label class="admincheck"><input type="checkbox" id="mpdActive"'+(row?.active===false?'':' checked')+'> Aktiv</label>'+
    (usage?'<p class="wide rule-editor-note">Egenskapstypen är låst eftersom den används av artefakter.</p>':'')+
    '<div class="rule-editor-actions wide"><button type="button" class="btn" onclick="closeAdminEditor()">Avbryt</button>'+
     '<button type="button" class="btn primary" onclick="saveMagicProperty(\''+esc(id)+'\')">Spara</button></div></div>');
  $('mpdName').addEventListener('blur',()=>{if(!id&&!$('mpdKey').value.trim())$('mpdKey').value=keyFromName($('mpdName').value)});
 }
 async function saveProperty(id=''){
  if(!activeUser()?.admin||saving)return;
  const old=id?getDefinition(id):null;if(id&&!old)return;
  const name=$('mpdName')?.value.trim()||'',key=$('mpdKey')?.value.trim()||keyFromName(name);
  if(!name||name.length>160||!validKey.test(key))return alert('Ange namn och en unik nyckel med minst två tecken.');
  if(definitions.some(row=>row.property_key===key&&row.id!==id))return alert('Nyckeln används redan.');
  const kind=old&&$('mpdKind')?.disabled?old.kind:($('mpdKind')?.value||'special');
  const sort=Number($('mpdSort')?.value||0);
  if(!Number.isInteger(sort))return alert('Sorteringsordningen måste vara ett heltal.');
  const payload={property_key:key,name,kind,
   description:$('mpdDescription')?.value.trim()||'',
   active:!!$('mpdActive')?.checked,sort_order:sort,updated_at:new Date().toISOString()};
  if(!id)payload.id=crypto.randomUUID();
  saving=true;
  try{
   await dbJson(id?'rule_magic_property_definitions?id=eq.'+encodeURIComponent(id):'rule_magic_property_definitions',
    {method:id?'PATCH':'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
   closeAdminEditor();await load(true);render();
  }catch(error){notify(error)}
  finally{saving=false}
 }
 async function removeProperty(id){
  if(!activeUser()?.admin||saving)return;
  const row=getDefinition(id);if(!row)return;
  if(powers.some(p=>p.property_id===id)){alert('Egenskapen används av artefakter. Ta först bort kopplingarna.');return}
  if(!await askConfirm('Ta bort egenskap','Ta bort '+row.name+' ur egenskapsregistret?','Ta bort',true))return;
  try{
   await dbJson('rule_magic_property_definitions?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
   await load(true);render();
  }catch(error){notify(error)}
 }
 async function openPowers(artifactId){
  if(!activeUser()?.admin)return;
  await load();const artifact=window.aleaMagicArtifacts?.get(artifactId);
  if(!artifact)return alert('Artefakten måste sparas innan egenskaper kopplas.');
  const items=powersFor(artifactId);
  modal('Magiska egenskaper: '+artifact.name,
   '<div class="magic-power-list">'+
    '<p class="rule-editor-note">Kombinera flera egenskaper i samma artefakt. Varje egenskap har egna inställningar. Besvärjelser länkas direkt till regelregistret.</p>'+
    items.map(power=>{
     const def=getDefinition(power.property_id), spell=spellFor(power.spell_id);
     const extra=def?.kind==='spell'?'EG '+power.effect_grade+' ×'+(power.effect_multiplier||1)+' · '+(spell?.name||'Okänd besvärjelse')+' · FV '+(power.cast_mode==='fixed'?(power.fixed_fv??'—'):power.cast_mode==='automatic'?'Automatisk':'Bärare')+' · '+(power.recharge_rule==='next_day'?'Nästa dag':power.recharge_rule==='manual'?'Manuell återhämtning':'Ingen dagspärr'):
      def?.kind==='bonus'?(power.target_attribute||'Bonus')+' '+(power.bonus_value>=0?'+':'')+power.bonus_value:
      (power.details||def?.description||'');
     return '<div class="magic-power-item'+(power.active?'':' inactive')+'"><div><strong>'+esc(def?.name||'Saknar definition')+'</strong>'+
      '<small>'+esc(extra)+' · '+esc(activations[power.activation]||power.activation)+'</small></div>'+
      '<div class="magic-power-buttons"><button type="button" class="smallbtn" onclick="editArtifactPower(\''+esc(artifactId)+'\',\''+esc(power.id)+'\')">Redigera</button>'+
      '<button type="button" class="deletebtn" onclick="deleteArtifactPower(\''+esc(artifactId)+'\',\''+esc(power.id)+'\')">×</button></div></div>'
    }).join('')+
    (!items.length?'<p class="muted">Inga egenskaper ännu. Lägg till en eller flera.</p>':'')+
    '<div class="rule-editor-actions"><button type="button" class="btn" onclick="closeAdminEditor()">Stäng</button>'+
    '<button type="button" class="btn primary" onclick="editArtifactPower(\''+esc(artifactId)+'\')">+ Lägg till egenskap</button></div></div>');
 }
 function togglePowerFields(){
  const prop=getDefinition($('mapProperty')?.value),kind=prop?.kind||'special';
  $('adminEditorBody')?.querySelectorAll('[data-magic-for]')?.forEach(field=>{
   field.hidden=!field.dataset.magicFor.split(' ').includes(kind);
  });
  const activate=$('mapActivation');
  // Switching to a passive property suggests a passive activation by default;
  // editing an existing power preserves its explicit activation selection.
  const note=$('mapKindHint');
  const fvField=$('mapFixedFvField');
  if(fvField)fvField.hidden=kind!=='spell'||$('mapCastMode')?.value!=='fixed';
  if(note)note.textContent=kind==='spell'?
   'Effektgrad och besvärjelse är registrerade. Detta aktiverar ännu inte stridsmotorns besvärjelsekast.':
   kind==='bonus'?'Bonusfältet är förberett för framtida automatisk FV- eller grundegenskapsberäkning.':
   'Effekten registreras nu och kan senare kopplas till stridens effektregister.';
 }
 async function editPower(artifactId,id=''){
  if(!activeUser()?.admin)return;
  try{
   await load();
   if(typeof loadRuleMagicRegistry==='function')await loadRuleMagicRegistry();
  }catch(error){return notify(error)}
  const art=window.aleaMagicArtifacts?.get(artifactId),power=id?getPower(id):null;
  if(!art||id&&(!power||String(power.artifact_id)!==String(artifactId)))return;
  const allowed=definitions.filter(def=>def.active||def.id===power?.property_id);
  if(!allowed.length)return alert('Skapa först en magisk egenskap i registret.');
  const activeDef=power?.property_id||allowed[0].id;
  const spellRows=typeof ruleSpells!=='undefined'?ruleSpells:[];
  modal((power?'Redigera egenskap':'Ny egenskap')+': '+art.name,
   '<div class="rule-editor-grid magic-power-editor">'+
    '<label class="wide">Egenskap från register<select id="mapProperty" onchange="window.aleaMagicProperties?.togglePowerFields()">'+
      allowed.map(def=>'<option value="'+esc(def.id)+'"'+(def.id===activeDef?' selected':'')+'>'+esc(def.name)+' · '+esc(kinds[def.kind])+'</option>').join('')+'</select></label>'+
    '<label>Aktivering<select id="mapActivation">'+options(activations,power?.activation||'action')+'</select></label>'+
    '<label data-magic-for="spell">Besvärjelse<select id="mapSpell"><option value="">— Välj besvärjelse —</option>'+
      spellRows.map(spell=>'<option value="'+esc(spell.id)+'"'+(String(spell.id)===String(power?.spell_id)?' selected':'')+'>'+esc(spell.name)+'</option>').join('')+'</select></label>'+
    '<label data-magic-for="spell">Effektgrad (EG)<input id="mapEg" type="number" min="1" max="50" step="1" value="'+esc(power?.effect_grade??1)+'"></label>'+
    '<label data-magic-for="spell">Multiplikator på besvärjelsens effekt<input id="mapMultiplier" type="number" min="1" max="1000" step="1" value="'+esc(power?.effect_multiplier??1)+'"></label>'+
    '<label data-magic-for="spell">Använd besvärjelsen med<select id="mapCastMode" onchange="window.aleaMagicProperties?.togglePowerFields()">'+options({fixed:'Föremålets FV',wearer:'Bärarens FV',automatic:'Automatisk aktivering'},power?.cast_mode||'fixed')+'</select></label>'+
    '<label data-magic-for="spell" id="mapFixedFvField">Föremålets FV<input id="mapFixedFv" type="number" min="1" max="100" step="1" value="'+esc(power?.fixed_fv??5)+'"></label>'+
    '<label data-magic-for="spell">Betalning av PSY<select id="mapPsy">'+options(psySources,power?.psy_source||'artifact')+'</select></label>'+
    '<label data-magic-for="spell special protection status">Laddningar per användning<input id="mapChargeCost" type="number" min="0" max="1000" step="1" value="'+esc(power?.charge_cost??0)+'"></label>'+
    '<label>Användningar per dag<input id="mapUses" type="number" min="0" step="1" value="'+esc(power?.uses_per_day??'')+'" placeholder="Obegränsat"></label>'+
    '<label>Kan användas igen<select id="mapRecharge">'+options({none:'Utan tidsgräns',next_day:'Efter ny kampanjdag',manual:'När SL återställer'},power?.recharge_rule||'none')+'</select></label>'+
    '<label data-magic-for="bonus protection status">Påverkad egenskap / effekt<input id="mapTargetAttribute" value="'+esc(power?.target_attribute||'')+'" placeholder="Ex. FV Svärd / ABS / Giftmotstånd"></label>'+
    '<label data-magic-for="bonus protection status">Bonus / styrka<input id="mapBonus" type="number" step="1" value="'+esc(power?.bonus_value??0)+'"></label>'+
    '<label>Mål / område<input id="mapTarget" value="'+esc(power?.target_text||'')+'" placeholder="Ex. Bäraren, en fiende, 3 hex"></label>'+
    '<label>Varaktighet<input id="mapDuration" value="'+esc(power?.duration_text||'')+'" placeholder="Ex. 3 SR, tills soluppgången"></label>'+
    '<label class="wide">Villkor, motstånd och särskilda regler<textarea id="mapDetails" rows="4">'+esc(power?.details||'')+'</textarea></label>'+
    '<label>Ordning<input id="mapSort" type="number" step="1" value="'+esc(power?.sort_order??powersFor(artifactId).length*10)+'"></label>'+
    '<label class="admincheck"><input type="checkbox" id="mapActive"'+(power?.active===false?'':' checked')+'> Aktiv</label>'+
    '<p class="wide rule-editor-note" id="mapKindHint"></p>'+
    '<div class="rule-editor-actions wide"><button type="button" class="btn" onclick="openArtifactPowers(\''+esc(artifactId)+'\')">Tillbaka</button>'+
     '<button type="button" class="btn primary" onclick="saveArtifactPower(\''+esc(artifactId)+'\',\''+esc(id)+'\')">Spara</button></div></div>');
  togglePowerFields();
 }
 const positiveInt=(id,min,max)=>{
  const raw=$(id)?.value;
  if(raw==null||raw==='')throw Error('Fyll i '+id+'.');
  const n=Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw Error('Ogiltigt värde för '+id+'.');
  return n;
 };
 async function savePower(artifactId,id=''){
  if(!activeUser()?.admin||saving)return;
  const art=window.aleaMagicArtifacts?.get(artifactId),existing=id?getPower(id):null;
  if(!art||id&&(!existing||existing.artifact_id!==artifactId))return;
  const def=getDefinition($('mapProperty')?.value);
  if(!def||!def.active&&def.id!==existing?.property_id)return alert('Välj en aktiv magisk egenskap.');
  const spellId=def.kind==='spell'?$('mapSpell')?.value||null:null;
  if(def.kind==='spell'&&!spellId)return alert('Välj en besvärjelse från det centrala besvärjelseregistret.');
  if(spellId&&!spellFor(spellId))return alert('Besvärjelsen finns inte i registret.');
  let grade,cost,uses,bonus,sort,multiplier=1,castMode='none',fixedFv=null,recharge='none';
  try{
   grade=def.kind==='spell'?positiveInt('mapEg',1,50):1;
   if(def.kind==='spell'){
    multiplier=positiveInt('mapMultiplier',1,1000);
    castMode=$('mapCastMode')?.value||'fixed';
    if(!['wearer','fixed','automatic'].includes(castMode))throw Error('Välj giltigt FV-läge.');
    fixedFv=castMode==='fixed'?positiveInt('mapFixedFv',1,100):null;
   }
   recharge=$('mapRecharge')?.value||'none';
   if(!['none','next_day','manual'].includes(recharge))throw Error('Välj giltig återhämtningsregel.');
   cost=['spell','special','protection','status'].includes(def.kind)?positiveInt('mapChargeCost',0,1000):0;
   uses=$('mapUses')?.value===''?null:positiveInt('mapUses',0,100000);
   bonus=['bonus','protection','status'].includes(def.kind)?Number($('mapBonus')?.value||0):0;
   sort=Number($('mapSort')?.value||0);
   if(!Number.isInteger(bonus)||!Number.isInteger(sort))throw Error('Bonus och ordning måste vara heltal.');
  }catch(error){return notify(error)}
  const payload={
   artifact_id:artifactId,property_id:def.id,spell_id:spellId,
   activation:$('mapActivation')?.value||'action',effect_grade:grade,
   effect_multiplier:multiplier,cast_mode:castMode,
   fixed_fv:fixedFv,recharge_rule:recharge,
   psy_source:def.kind==='spell'?$('mapPsy')?.value||'artifact':'none',
   charge_cost:cost,uses_per_day:uses,
   target_attribute:['bonus','protection','status'].includes(def.kind)?$('mapTargetAttribute')?.value.trim()||'':'',
   bonus_value:bonus,target_text:$('mapTarget')?.value.trim()||'',
   duration_text:$('mapDuration')?.value.trim()||'',
   details:$('mapDetails')?.value.trim()||'',
   active:!!$('mapActive')?.checked,sort_order:sort,
   updated_at:new Date().toISOString()
  };
  if(!id)payload.id=crypto.randomUUID();
  saving=true;
  try{
   await dbJson(id?'rule_magic_artifact_powers?id=eq.'+encodeURIComponent(id):'rule_magic_artifact_powers',
    {method:id?'PATCH':'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
   await load(true);render();await openPowers(artifactId);
  }catch(error){notify(error)}
  finally{saving=false}
 }
 async function removePower(artifactId,id){
  if(!activeUser()?.admin||saving)return;
  const row=getPower(id);
  if(!row||String(row.artifact_id)!==String(artifactId))return;
  if(!await askConfirm('Ta bort magisk egenskap','Ta bort '+powerName(row)+' från denna artefakt? Egenskapen finns kvar i huvudregistret.','Ta bort',true))return;
  try{
   await dbJson('rule_magic_artifact_powers?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
   await load(true);render();await openPowers(artifactId);
  }catch(error){notify(error)}
 }
 window.aleaMagicProperties={load,refresh,render,summary,powersFor,definitionFor:getDefinition,
  allDefinitions:()=>[...definitions],togglePowerFields};
 window.editMagicProperty=propertyEditor;
 window.saveMagicProperty=saveProperty;
 window.deleteMagicProperty=removeProperty;
 window.openArtifactPowers=openPowers;
 window.editArtifactPower=editPower;
 window.saveArtifactPower=savePower;
 window.deleteArtifactPower=removePower;
})();
