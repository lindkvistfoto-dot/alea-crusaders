/* Alea Crusaders · effect definitions live in Admin, not the combat page. */
async function loadRuleEffects(force=false){
 if(ruleEffectsLoaded&&!force)return ruleEffects;
 try{
  return await withRuleRegistryLoad('effects',async()=>{
   const rows=await dbJson('rule_effects?select=*&order=name.asc');
   if(!Array.isArray(rows))throw new Error('Effektregistret saknar tabellresultat.');
   ruleEffects=rows;ruleEffectsLoaded=true;return rows
  })
 }catch(error){ruleEffects=[];ruleEffectsLoaded=false;return []}
}
const RULE_EFFECT_POLARITY={positive:'Positiv',negative:'Negativ',neutral:'Neutral'};
const RULE_EFFECT_CATEGORY={magic:'Magi',condition:'Tillstånd',poison:'Gift',environment:'Miljö',combat:'Strid',other:'Övrigt'};
const RULE_EFFECT_TARGET={combatant:'Kombatant',self:'Egen kombatant',area:'Område',hex:'Hexagon',item:'Föremål'};
const RULE_EFFECT_UNIT={round:'SR',minute:'Minut',hour:'Timme',instant:'Omedelbar',permanent:'Permanent'};
const RULE_EFFECT_END={duration:'Tid',manual:'Manuellt',woken:'Väckning',cured:'Botad',dispelled:'Skingrad',concentration:'Koncentration',special:'Särskilt'};
function ruleEffectLabel(map,key){return map[String(key||'')]||String(key||'—')}
function ruleEffectDuration(row){
 if(row.duration_unit==='permanent')return 'Permanent';
 if(row.duration_unit==='instant')return 'Omedelbar';
 return row.default_duration_rounds==null?'SL avgör':row.default_duration_rounds+' '+ruleEffectLabel(RULE_EFFECT_UNIT,row.duration_unit)
}
function ruleEffectsAreArea(row){return ['area','hex'].includes(row?.target_type)}
function ruleEffectRegistryMarkup(rows){
 const headings=['Namn','Kod','Kategori','Typ','Mål','Varaktighet','Avslut','Aktiv','Åtgärd'];
 return headings.map(h=>'<div class="ahead">'+h+'</div>').join('')+
  rows.map(row=>{
   const id=encodeURIComponent(row.id),code=String(row.code||''),type=row.modifiers?.type||'custom';
   return '<div><span class="rule-name" title="'+escAttr(row.description||'')+'" onclick="editRuleEffect(\''+id+'\')">'+escAttr(row.name||'—')+'</span>'+
    (row.description?'<small class="admin-master-key">'+escAttr(row.description)+'</small>':'')+'</div>'+
    '<div class="admin-effect-code">'+escAttr(code)+'</div>'+
    '<div>'+escAttr(ruleEffectLabel(RULE_EFFECT_CATEGORY,row.category))+'</div>'+
    '<div>'+escAttr(type)+'</div>'+
    '<div>'+escAttr(ruleEffectLabel(RULE_EFFECT_TARGET,row.target_type))+'</div>'+
    '<div>'+escAttr(ruleEffectDuration(row))+'</div>'+
    '<div>'+escAttr(ruleEffectLabel(RULE_EFFECT_END,row.expiration_condition))+'</div>'+
    '<div><input type="checkbox" aria-label="Aktivera '+escAttr(row.name||'effekt')+'" '+(row.active?'checked':'')+
     ' onchange="toggleRuleEffect(\''+id+'\',this.checked,this)"></div>'+
    '<div class="adminactions"><button class="smallbtn" title="Redigera" type="button" onclick="editRuleEffect(\''+id+'\')">✎</button>'+
     (code.startsWith('custom_')?'<button class="deletebtn" title="Ta bort egen effekt" type="button" onclick="deleteRuleEffect(\''+id+'\')">×</button>':'')+'</div>'
  }).join('')
}
function renderAdminEffects(){
 const table=$('adminEffectTable'),areaTable=$('adminAreaEffectTable'),status=$('adminEffectStatus'),areaStatus=$('adminAreaEffectStatus');if(!table)return;
 if(!ruleEffectsLoaded){table.innerHTML='';if(areaTable)areaTable.innerHTML='';if(status)status.textContent='Effektregistret kunde inte läsas.';return}
 const personal=ruleEffects.filter(row=>!ruleEffectsAreArea(row)),area=ruleEffects.filter(ruleEffectsAreArea);
 if(status)status.textContent=ruleEffects.length+' effekter i registret · '+ruleEffects.filter(row=>row.active).length+' aktiva.';
 table.innerHTML=ruleEffectRegistryMarkup(personal);
 if(areaTable)areaTable.innerHTML=ruleEffectRegistryMarkup(area);
 if(areaStatus)areaStatus.textContent=area.length+' områdeseffekter · '+area.filter(row=>row.active).length+' aktiva. SL placerar dem via stridskontrollen.';
}
function ruleEffectOptions(map,chosen){
 const entries=Object.entries(map);
 if(chosen!=null&&!entries.some(([value])=>value===String(chosen)))entries.push([String(chosen),String(chosen)]);
 return entries.map(([v,label])=>'<option value="'+escAttr(v)+'" '+(v===String(chosen)?'selected':'')+'>'+escAttr(label)+'</option>').join('')
}
function editRuleAreaEffect(id=''){return editRuleEffect(id,'area')}
function editRuleEffect(id='',mode='combatant'){
 if(!activeUser()?.admin)return;
 const row=ruleEffects.find(r=>String(r.id)===String(id))||null,kind=String(row?.modifiers?.type||(mode==='area'?'area_terrain':'custom'));
 const types=['custom','attribute_delta','skip_turns','flight','vision','control','damage_over_time','protection','area_damage','area_terrain','terrain','incapacitated','fear','panic','confusion'];
 const typeOptions=Object.fromEntries([...new Set([...types,kind])].map(t=>[t,t]));
 $('adminEditorTitle').textContent=row?'Redigera effekt: '+row.name:'Lägg till effekt';
 $('adminEditorBody').innerHTML='<div class="rule-editor-grid effect-rule-editor">'+
  '<label class="wide">Namn<input id="refName" maxlength="100" value="'+escAttr(row?.name||'')+'"></label>'+
  (row?'<label class="wide">Regelkod<input readonly value="'+escAttr(row.code||'')+'"></label>':'<p class="rule-editor-note wide">En unik regelkod skapas automatiskt.</p>')+
  '<label>Kategori<select id="refCategory">'+ruleEffectOptions(RULE_EFFECT_CATEGORY,row?.category||(mode==='area'?'environment':'condition'))+'</select></label>'+
  '<label>Typ<select id="refType">'+ruleEffectOptions(typeOptions,kind)+'</select></label>'+
  '<label>Mål<select id="refTarget">'+ruleEffectOptions(RULE_EFFECT_TARGET,row?.target_type||(mode==='area'?'area':'combatant'))+'</select></label>'+
  '<label>Polaritet<select id="refPolarity">'+ruleEffectOptions(RULE_EFFECT_POLARITY,row?.polarity||'neutral')+'</select></label>'+
  '<label>Tidsenhet<select id="refUnit">'+ruleEffectOptions(RULE_EFFECT_UNIT,row?.duration_unit||'round')+'</select></label>'+
  '<label>Standardvaraktighet<input id="refDuration" type="number" min="0" max="9999" step="1" placeholder="SL avgör" value="'+escAttr(row?.default_duration_rounds??'')+'"></label>'+
  '<label>Avslut<select id="refEnding">'+ruleEffectOptions(RULE_EFFECT_END,row?.expiration_condition||'duration')+'</select></label>'+
  '<label>Stapling<select id="refStacking">'+ruleEffectOptions({refresh:'Förnya',stack:'Stapla',ignore:'Ignorera'},row?.stacking||'refresh')+'</select></label>'+
  '<label class="wide">Beskrivning<textarea id="refDescription">'+escAttr(row?.description||'')+'</textarea></label>'+
  '<label class="wide">Modifierare (JSON)<textarea id="refModifiers" spellcheck="false">'+escAttr(JSON.stringify(row?.modifiers||(mode==='area'?{type:'area_terrain',movement_mode:'free',sight_mode:'obscuring'}:{type:'custom'}),null,2))+'</textarea></label>'+
  '<label class="wide">Parameterschema (JSON)<textarea id="refParameters" spellcheck="false">'+escAttr(JSON.stringify(row?.parameter_schema||{},null,2))+'</textarea></label>'+
  '<label class="wide admincheck"><input id="refActive" type="checkbox" '+(row?.active!==false?'checked':'')+'> Aktiv</label>'+
 '</div><p class="rule-editor-note">Modifierare styr effektens beteende i strid. Behåll befintlig kod och parametrar för effekter som redan används av besvärjelser.</p>'+
 '<div class="rule-editor-actions"><button class="btn" onclick="closeAdminEditor()">Avbryt</button><button class="btn primary" onclick="saveRuleEffect(\''+escAttr(id)+'\')">Spara effekt</button></div>';
 $('adminEditor').classList.remove('hidden')
}
function ruleEffectJson(id){
 const data=JSON.parse(String($(id)?.value??'').trim()||'{}');
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error(id+' måste innehålla ett JSON-objekt.');
 return data
}
function ruleEffectFormData(){
 const name=String($('refName')?.value||'').trim(),raw=String($('refDuration')?.value??'').trim();
 if(!name)throw new Error('Effekten måste ha ett namn.');
 if(raw&&!/^\d+$/.test(raw))throw new Error('Varaktigheten måste vara ett heltal.');
 const duration=raw===''?null:Number(raw);
 if(duration!=null&&(!Number.isSafeInteger(duration)||duration>9999))throw new Error('Varaktigheten måste ligga mellan 0 och 9999.');
 const modifiers=ruleEffectJson('refModifiers');
 return {name,description:String($('refDescription')?.value||'').trim(),polarity:$('refPolarity').value,
  category:$('refCategory').value,target_type:$('refTarget').value,duration_unit:$('refUnit').value,
  default_duration_rounds:duration,expiration_condition:$('refEnding').value,stacking:$('refStacking').value,
  modifiers:{...modifiers,type:$('refType').value},parameter_schema:ruleEffectJson('refParameters'),
  active:!!$('refActive')?.checked,updated_at:new Date().toISOString()}
}
async function saveRuleEffect(id=''){
 if(!activeUser()?.admin)return;
 try{
  const data=ruleEffectFormData(),row=ruleEffects.find(r=>String(r.id)===String(id));
  if(id&&!row)throw new Error('Effekten finns inte längre i registret.');
  if(row){
   const result=await dbJson('rule_effects?id=eq.'+encodeURIComponent(id)+'&select=id',{method:'PATCH',body:JSON.stringify(data)});
   if(!Array.isArray(result)||result.length!==1)throw new Error('Effekten kunde inte uppdateras.')
  }else await dbJson('rule_effects',{method:'POST',body:JSON.stringify({...data,code:'custom_'+crypto.randomUUID().replaceAll('-','')})});
  closeAdminEditor();await refreshAdminRuleRegistry('effects',true)
 }catch(error){alert('Kunde inte spara effekt: '+error.message)}
}
async function toggleRuleEffect(id,enabled,checkbox){
 if(!activeUser()?.admin){if(checkbox)checkbox.checked=!enabled;return}
 try{
  const result=await dbJson('rule_effects?id=eq.'+encodeURIComponent(id)+'&select=id',{
   method:'PATCH',body:JSON.stringify({active:!!enabled,updated_at:new Date().toISOString()})
  });
  if(!Array.isArray(result)||result.length!==1)throw new Error('Effekten kunde inte uppdateras.');
  await refreshAdminRuleRegistry('effects',true)
 }catch(error){if(checkbox)checkbox.checked=!enabled;alert('Kunde inte ändra effektstatus: '+error.message)}
}
async function deleteRuleEffect(id){
 if(!activeUser()?.admin)return;
 const row=ruleEffects.find(r=>String(r.id)===String(id));
 if(!row||!String(row.code||'').startsWith('custom_'))return alert('Fördefinierade effekter kan inaktiveras, inte raderas.');
 if(!await askConfirm('Ta bort effekt','Vill du ta bort '+row.name+' permanent?','Ta bort',true))return;
 try{
  const [person,area]=await Promise.all([
   dbJson('combatant_effects?effect_id=eq.'+encodeURIComponent(id)+'&select=id&limit=1'),
   dbJson('combat_area_effects?effect_id=eq.'+encodeURIComponent(id)+'&select=id&limit=1')
  ]);
  if(person?.length||area?.length)throw new Error('Effekten används av strider. Inaktivera den i stället.');
  await dbJson('rule_effects?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
  await refreshAdminRuleRegistry('effects',true)
 }catch(error){alert('Kunde inte ta bort effekten: '+error.message)}
}
