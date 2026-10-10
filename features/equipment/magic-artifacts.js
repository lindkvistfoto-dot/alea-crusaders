/* v0.35.83 — SL-managed templates for magical artifacts.
   Ordinary weapon/armor/equipment base masters never become magical merely
   because an artifact uses one as its base. Mechanical effects are descriptive
   until explicitly supported by the battle rules. */
(function(){
 'use strict';
 let rows=[],loaded=false,pending=null,saving=false;
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[ch]));
 const types={amulet:'Amulett',ring:'Ring',weapon:'Vapen',armor:'Rustning',shield:'Sköld',staff:'Stav',wand:'Trollstav',equipment:'Utrustning',other:'Övrigt'};
 const bases={weapon:'Vapen',armor:'Rustning',shield:'Sköld',equipment:'Utrustning'};
 const rarities={common:'Vanlig',uncommon:'Ovanlig',rare:'Sällsynt',legendary:'Legendarisk',unique:'Unik'};
 const keyFromName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,78);
 function options(map,selected,empty=''){
  return (empty?'<option value="">'+esc(empty)+'</option>':'')+
   Object.entries(map).map(([k,v])=>'<option value="'+esc(k)+'"'+(k===selected?' selected':'')+'>'+esc(v)+'</option>').join('');
 }
 async function load(force=false){
  if(!activeUser()?.admin)return [];
  if(loaded&&!force)return rows;
  if(pending)return pending;
  pending=(async()=>{
   const result=await dbJson('rule_magic_artifacts?select=*&order=sort_order.asc,name.asc');
   rows=Array.isArray(result)?result:[];loaded=true;return rows;
  })();
  try{return await pending}finally{pending=null}
 }
 const get=id=>rows.find(row=>String(row.id)===String(id))||null;
 const count=()=>rows.length;
 function masterRows(kind){
  if(kind==='weapon')return typeof ruleWeapons!=='undefined'?ruleWeapons:[];
  if(kind==='armor')return typeof ruleArmorTypes!=='undefined'?ruleArmorTypes:[];
  if(kind==='shield')return typeof ruleShields!=='undefined'?ruleShields:[];
  if(kind==='equipment')return window.aleaEquipmentCatalog?.all?.()||[];
  return [];
 }
 function baseLabel(row){
  if(!row.base_kind||!row.base_item_id)return 'Fristående';
  const source=masterRows(row.base_kind).find(r=>String(r.id)===String(row.base_item_id));
  return source?(bases[row.base_kind]+' · '+source.name):bases[row.base_kind]+' · grundföremål saknas';
 }
 function render(){
  const el=$('adminMagicArtifactTable'),status=$('adminMagicArtifactStatus');
  if(!el)return;
  const search=String($('adminMagicArtifactSearch')?.value||'').toLocaleLowerCase('sv-SE').trim();
  const kind=$('adminMagicArtifactFilter')?.value||'all';
  const subset=rows.filter(row=>(kind==='all'||row.item_type===kind)&&(!search||
   [row.name,row.artifact_key,row.appearance,row.magic_properties,row.activation,row.gm_notes].some(value=>String(value||'').toLocaleLowerCase('sv-SE').includes(search))));
  if(status)status.textContent=rows.length+' magiska artefakter i registret · '+rows.filter(row=>row.active).length+' aktiva. Bara administratörer kan läsa och ändra dem.';
  el.innerHTML='<div class="magic-artifact-head"><b>Artefakt</b><b>Typ / grundföremål</b><b>Magiska egenskaper</b><b>Laddningar</b><b>Åtgärder</b></div>'+
   subset.map(row=>
    '<div class="magic-artifact-row'+(row.active?'':' inactive')+'">'+
     '<div class="magic-artifact-name"><strong>'+esc(row.name)+'</strong><small>'+esc(row.artifact_key)+' · '+esc(rarities[row.rarity]||row.rarity)+'</small></div>'+
     '<div class="magic-artifact-base"><b>'+esc(types[row.item_type]||row.item_type)+'</b><small>'+esc(baseLabel(row))+'</small></div>'+
     '<div class="magic-artifact-property" title="'+esc(row.magic_properties||'')+'">'+esc(row.magic_properties||'Ej angiven')+'</div>'+
     '<div class="magic-artifact-charges">'+(row.max_charges==null?'—':esc(row.max_charges))+'</div>'+
     '<div class="magic-artifact-actions"><button type="button" class="smallbtn" onclick="editMagicArtifact(\''+esc(row.id)+'\')">Redigera</button>'+
      '<button type="button" class="deletebtn" onclick="deleteMagicArtifact(\''+esc(row.id)+'\')" title="Ta bort">×</button></div>'+
    '</div>').join('')+
   (!subset.length?'<div class="magic-artifact-empty">Inga artefakter matchar urvalet.</div>':'');
 }
 async function refresh(force=false){
  try{await load(force);render()}
  catch(error){console.error('Kunde inte läsa magiska artefakter',error);
   if($('adminMagicArtifactStatus'))$('adminMagicArtifactStatus').textContent='Kunde inte läsa artefakter: '+error.message;
  }
 }
 async function loadMasters(){
  // A selected base model is validated against its own registry, not typed freehand.
  await Promise.allSettled([
   typeof loadRuleWeapons==='function'?loadRuleWeapons():Promise.resolve(),
   typeof loadRuleArmorRegistry==='function'?loadRuleArmorRegistry():Promise.resolve(),
   typeof loadRuleShields==='function'?loadRuleShields():Promise.resolve(),
   window.aleaEquipmentCatalog?.load?.()||Promise.resolve()
  ]);
 }
 function updateBaseSelect(selected=''){
  const kind=$('rmaBaseKind')?.value||'',select=$('rmaBaseId');if(!select)return;
  const data=masterRows(kind);
  const label=kind?('— Välj '+(bases[kind]||'grundföremål').toLowerCase()+' —'):'— Fristående artefakt —';
  select.innerHTML='<option value="">'+esc(label)+'</option>'+
   data.map(row=>'<option value="'+esc(row.id)+'"'+(String(row.id)===String(selected)?' selected':'')+'>'+esc(row.name)+'</option>').join('');
  select.disabled=!kind;
 }
 async function editor(id=''){
  if(!activeUser()?.admin)return;
  try{await Promise.all([load(),loadMasters()])}
  catch(error){return alert('Kunde inte läsa artefaktregistret: '+error.message)}
  const row=id?get(id):null;if(id&&!row)return;
  const baseKind=row?.base_kind||'';
  $('adminEditorTitle').textContent=row?'Redigera magisk artefakt':'Lägg till magisk artefakt';
  $('adminEditorBody').innerHTML='<div class="rule-editor-grid magic-artifact-editor">'+
   '<label class="wide">Namn<input id="rmaName" maxlength="160" value="'+esc(row?.name||'')+'" placeholder="Ex. Nattens amulett"></label>'+
   '<label>Kod / nyckel<input id="rmaKey" maxlength="80" value="'+esc(row?.artifact_key||'')+'"'+(row?' readonly':'')+' placeholder="nattens_amulett"></label>'+
   '<label>Artefakttyp<select id="rmaType">'+options(types,row?.item_type||'amulet')+'</select></label>'+
   '<label>Grundföremål från register<select id="rmaBaseKind">'+options(bases,baseKind,'Inget – fristående artefakt')+'</select></label>'+
   '<label class="wide">Välj grundföremål<select id="rmaBaseId"></select></label>'+
   '<label>Sällsynthet<select id="rmaRarity">'+options(rarities,row?.rarity||'uncommon')+'</select></label>'+
   '<label>Magisk bonus (manuell)<input id="rmaBonus" type="number" step="1" value="'+esc(row?.magic_bonus??0)+'"></label>'+
   '<label>Max antal laddningar<input id="rmaCharges" type="number" min="0" step="1" value="'+esc(row?.max_charges??'')+'" placeholder="Tomt = inga laddningar"></label>'+
   '<label>Användningar per dag<input id="rmaUses" type="number" min="0" step="1" value="'+esc(row?.uses_per_day??'')+'"></label>'+
   '<label>Värde (silvermynt)<input id="rmaValue" type="number" min="0" step="0.01" value="'+esc(row?.value_sm??'')+'"></label>'+
   '<label>Sorteringsordning<input id="rmaSort" type="number" step="1" value="'+esc(row?.sort_order??0)+'"></label>'+
   '<label class="wide">Utseende / beskrivning<textarea id="rmaAppearance" rows="3">'+esc(row?.appearance||'')+'</textarea></label>'+
   '<label class="wide">Magiska egenskaper och verkan<textarea id="rmaProperties" rows="4" placeholder="Vad gör föremålet? Ange gärna bonus, villkor, räckvidd och varaktighet.">'+esc(row?.magic_properties||'')+'</textarea></label>'+
   '<label class="wide">Aktivering / begränsningar<textarea id="rmaActivation" rows="3">'+esc(row?.activation||'')+'</textarea></label>'+
   '<label class="wide">SL-anteckningar (hemligt)<textarea id="rmaNotes" rows="3">'+esc(row?.gm_notes||'')+'</textarea></label>'+
   '<label class="wide admincheck"><input type="checkbox" id="rmaActive"'+(row?.active===false?'':' checked')+'> Aktiv artefakt</label>'+
   '<p class="wide rule-editor-note">Grundföremålet används bara som mall. Det gör inte alla vanliga exemplar magiska. Bonus och laddningar registreras nu, men förändrar inte stridsberäkningar automatiskt.</p>'+
   '<div class="rule-editor-actions wide"><button type="button" class="btn" onclick="closeAdminEditor()">Avbryt</button>'+
    '<button type="button" class="btn primary" onclick="saveMagicArtifact(\''+esc(id)+'\')">Spara</button></div>'+
   '</div>';
  $('rmaBaseKind').addEventListener('change',()=>updateBaseSelect());
  $('rmaName').addEventListener('blur',()=>{if(!id&&!$('rmaKey').value.trim())$('rmaKey').value=keyFromName($('rmaName').value)});
  updateBaseSelect(row?.base_item_id||'');
  $('adminEditor').classList.remove('hidden');
 }
 function optionalNonnegative(id){
  const raw=$(id)?.value.trim()||'';if(!raw)return null;
  const num=Number(raw);if(!Number.isInteger(num)||num<0)throw Error('Kontrollera '+id+': ange ett heltal ≥ 0.');
  return num
 }
 async function save(id=''){
  if(!activeUser()?.admin||saving)return;
  const old=id?get(id):null;if(id&&!old)return;
  const name=$('rmaName')?.value.trim()||'',key=($('rmaKey')?.value.trim()||keyFromName(name));
  if(!name||name.length>160||!/^[a-z][a-z0-9_]{1,79}$/.test(key))return alert('Ange namn och en unik nyckel med minst två tecken (a–z, 0–9 eller _).');
  if(rows.some(r=>r.artifact_key===key&&r.id!==id))return alert('Nyckeln används redan.');
  const kind=$('rmaBaseKind')?.value||null,baseId=$('rmaBaseId')?.value||null;
  if(kind&&!baseId)return alert('Välj ett grundföremål eller välj Fristående artefakt.');
  if(kind&&!masterRows(kind).some(r=>String(r.id)===String(baseId)))return alert('Det valda grundföremålet finns inte i registret.');
  const bonus=Number($('rmaBonus')?.value||0),sort=Number($('rmaSort')?.value||0);
  if(!Number.isInteger(bonus)||!Number.isInteger(sort))return alert('Bonus och sorteringsordning måste vara heltal.');
  let charges,uses;
  try{charges=optionalNonnegative('rmaCharges');uses=optionalNonnegative('rmaUses')}
  catch(e){return alert(e.message)}
  const valueText=$('rmaValue')?.value.trim()||'',value=valueText===''?null:Number(valueText);
  if(value!==null&&(!Number.isFinite(value)||value<0))return alert('Ange ett giltigt värde.');
  const payload={
   artifact_key:key,name,item_type:$('rmaType')?.value||'other',
   base_kind:kind,base_item_id:kind?baseId:null,
   appearance:$('rmaAppearance')?.value.trim()||'',
   magic_properties:$('rmaProperties')?.value.trim()||'',
   activation:$('rmaActivation')?.value.trim()||'',
   magic_bonus:bonus,max_charges:charges,uses_per_day:uses,
   rarity:$('rmaRarity')?.value||'uncommon',
   value_sm:value,gm_notes:$('rmaNotes')?.value.trim()||'',
   active:!!$('rmaActive')?.checked,sort_order:sort,
   updated_at:new Date().toISOString()
  };
  if(!id)payload.id=crypto.randomUUID();
  saving=true;const btn=$('adminEditorBody')?.querySelector('.rule-editor-actions .primary');if(btn)btn.disabled=true;
  try{
   await dbJson(id?'rule_magic_artifacts?id=eq.'+encodeURIComponent(id):'rule_magic_artifacts',{
    method:id?'PATCH':'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)
   });
   closeAdminEditor();await load(true);render();renderAdminOverviewCounts();
  }catch(error){alert('Kunde inte spara artefakten: '+error.message)}
  finally{saving=false;if(btn)btn.disabled=false}
 }
 async function remove(id){
  if(!activeUser()?.admin||saving)return;
  const row=get(id);if(!row)return;
  if(!await askConfirm('Ta bort artefakt','Ta bort '+row.name+' från registret? Befintliga rollpersonsanteckningar påverkas inte.','Ta bort',true))return;
  try{
   await dbJson('rule_magic_artifacts?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
   await load(true);render();renderAdminOverviewCounts();
  }catch(error){alert('Kunde inte ta bort artefakten: '+error.message)}
 }
 window.aleaMagicArtifacts={load,refresh,render,count,get,all:()=>[...rows]};
 window.editMagicArtifact=editor;
 window.saveMagicArtifact=save;
 window.deleteMagicArtifact=remove;
})();
