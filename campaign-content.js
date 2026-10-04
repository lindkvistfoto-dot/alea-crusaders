/* Alea Crusaders v0.22.1 — campaign content admin */
async function loadCampaignContentData(){
  campaignContentReady=false;
  campaignEvents=[];campaignNpcs=[];campaignMonsters=[];
  if(!centralCampaignId)return;
  try{
    var r=await Promise.all([
      dbJson('campaign_events?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=*&order=sort_order.asc,name.asc'),
      dbJson('campaign_npcs?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=*&order=sort_order.asc,name.asc'),
      dbJson('campaign_monsters?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=*&order=sort_order.asc,name.asc')
    ]);
    campaignEvents=Array.isArray(r[0])?r[0]:[];
    campaignNpcs=Array.isArray(r[1])?r[1]:[];
    campaignMonsters=Array.isArray(r[2])?r[2]:[];
    campaignContentReady=true;
  }catch(e){
    console.warn('Kampanjinnehåll är inte installerat ännu',e);
    campaignContentReady=false;
  }
}

function contentVisibilityBadge(v){
  return v?'<span class="content-badge visible">SPELARE</span>':'<span class="content-badge">SL</span>';
}
function contentActionButtons(kind,id){
  var edit=kind==='event'?'editCampaignEvent':kind==='npc'?'editCampaignNpc':'editCampaignMonster';
  var del=kind==='event'?'deleteCampaignEvent':kind==='npc'?'deleteCampaignNpc':'deleteCampaignMonster';
  return '<div class="admin-map-actions"><button class="smallbtn" onclick="'+edit+'(\''+id+'\')" title="Redigera">✎</button><button class="deletebtn" onclick="'+del+'(\''+id+'\')" title="Ta bort">×</button></div>';
}
function renderAdminCampaignContent(){
  var st=$('adminContentStatus'),et=$('adminEventTable'),nt=$('adminNpcTable'),mt=$('adminMonsterTable');
  if(!st||!et||!nt||!mt)return;
  if(!campaignContentReady){
    st.innerHTML='<div class="content-schema-note">Kampanjinnehållets databastabeller är inte installerade ännu. Övrig administration fungerar som vanligt.</div>';
    et.innerHTML=nt.innerHTML=mt.innerHTML='<div class="content-empty">Kör kampanjinnehållsmigrationen för att aktivera funktionen.</div>';
    return;
  }
  st.textContent=campaignEvents.length+' händelser · '+campaignNpcs.length+' SLP · '+campaignMonsters.length+' monster.';
  et.innerHTML='<div class="ahead">Namn</div><div class="ahead">Status</div><div class="ahead">Synlighet</div><div class="ahead">Åtgärd</div>'+
    campaignEvents.map(function(x){return '<div><b>'+escAttr(x.name||'Namnlös')+'</b></div><div>'+escAttr(x.status||'planned')+'</div><div>'+contentVisibilityBadge(x.player_visible)+'</div><div>'+contentActionButtons('event',x.id)+'</div>';}).join('');
  nt.innerHTML='<div class="ahead">Namn</div><div class="ahead">Roll / titel</div><div class="ahead">Synlighet</div><div class="ahead">Åtgärd</div>'+
    campaignNpcs.map(function(x){return '<div><b>'+escAttr(x.name||'Namnlös')+'</b></div><div>'+escAttr(x.title||'—')+'</div><div>'+contentVisibilityBadge(x.player_visible)+'</div><div>'+contentActionButtons('npc',x.id)+'</div>';}).join('');
  mt.innerHTML='<div class="ahead">Namn</div><div class="ahead">Typ / antal</div><div class="ahead">Synlighet</div><div class="ahead">Åtgärd</div>'+
    campaignMonsters.map(function(x){return '<div><b>'+escAttr(x.name||'Namnlös')+'</b></div><div>'+escAttr(x.monster_type||'—')+' · '+(Number(x.quantity)||0)+'</div><div>'+contentVisibilityBadge(x.player_visible)+'</div><div>'+contentActionButtons('monster',x.id)+'</div>';}).join('');
}
function ensureCampaignContentReady(){
  if(campaignContentReady)return true;
  alert('Kampanjinnehållets databastabeller är inte installerade ännu. Kör SQL-migrationen först.');
  return false;
}
function locationOptionsContent(selected){
  var html='<option value="">Ingen aktuell plats</option>';
  html+=campaignLocations.map(function(l){
    return '<option value="'+l.id+'" '+(selected===l.id?'selected':'')+'>'+escAttr(sitePath(l.site_id)+' › '+l.location_key+'. '+l.name)+'</option>';
  }).join('');
  return html;
}
function showContentEditor(title,html){
  $('adminEditorTitle').textContent=title;
  $('adminEditorBody').innerHTML=html;
  $('adminEditor').classList.remove('hidden');
}

function editCampaignEvent(id){
  if(!ensureCampaignContentReady())return;
  id=id||'';
  var x=id?campaignEvents.find(function(v){return v.id===id;}):null;
  var status=x&&x.status?x.status:'planned';
  var statusHtml=['planned','active','resolved','disabled'].map(function(s){return '<option value="'+s+'" '+(status===s?'selected':'')+'>'+s+'</option>';}).join('');
  showContentEditor(x?'Redigera händelse':'Lägg till händelse',
    '<div class="adminform">'+
    '<label>Namn<input id="ceName" value="'+escAttr(x&&x.name||'')+'"></label>'+
    '<label>Status<select id="ceStatus">'+statusHtml+'</select></label>'+
    '<label>Sammanfattning<textarea id="ceSummary">'+escAttr(x&&x.summary||'')+'</textarea></label>'+
    '<label>Text att läsa upp<textarea id="ceRead">'+escAttr(x&&x.read_aloud||'')+'</textarea></label>'+
    '<label>Trigger / villkor<textarea id="ceTrigger">'+escAttr(x&&x.trigger_text||'')+'</textarea></label>'+
    '<label class="admincheck"><input id="ceVisible" type="checkbox" '+(x&&x.player_visible?'checked':'')+'> Synlig för spelare</label>'+
    '<div class="adminformactions"><button class="btn" onclick="closeAdminEditor()">Avbryt</button><button class="btn primary" onclick="saveCampaignEvent(\''+id+'\')">Spara</button></div></div>');
}
async function saveCampaignEvent(id){
  id=id||'';
  var name=$('ceName').value.trim();if(!name){alert('Namn måste anges.');return;}
  var body={campaign_id:centralCampaignId,name:name,status:$('ceStatus').value,summary:$('ceSummary').value,read_aloud:$('ceRead').value,trigger_text:$('ceTrigger').value,player_visible:$('ceVisible').checked,updated_at:new Date().toISOString()};
  if(!id)body.created_by=supabaseSession.user.id;
  try{
    if(id)await dbJson('campaign_events?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(body)});
    else await dbJson('campaign_events',{method:'POST',body:JSON.stringify(body)});
    closeAdminEditor();await loadCampaignContentData();renderAdminCampaignContent();showBackupToast('✓ Händelse sparad');
  }catch(e){alert('Kunde inte spara händelsen: '+e.message);}
}
async function deleteCampaignEvent(id){
  var x=campaignEvents.find(function(v){return v.id===id;});if(!x)return;
  if(!await askConfirm('Ta bort händelse','Vill du ta bort '+x.name+'? Kopplingar till platser tas också bort.','Ta bort',true))return;
  try{await dbJson('campaign_events?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});await loadCampaignContentData();renderAdminCampaignContent();}catch(e){alert('Kunde inte ta bort händelsen: '+e.message);}
}

function editCampaignNpc(id){
  if(!ensureCampaignContentReady())return;
  id=id||'';var x=id?campaignNpcs.find(function(v){return v.id===id;}):null;
  showContentEditor(x?'Redigera SLP':'Lägg till SLP',
    '<div class="adminform">'+
    '<label>Namn<input id="cnName" value="'+escAttr(x&&x.name||'')+'"></label>'+
    '<label>Roll / titel<input id="cnTitle" value="'+escAttr(x&&x.title||'')+'"></label>'+
    '<label>Aktuell plats<select id="cnLocation">'+locationOptionsContent(x&&x.current_location_id||'')+'</select></label>'+
    '<label>Beskrivning<textarea id="cnDesc">'+escAttr(x&&x.description||'')+'</textarea></label>'+
    '<label>SL-noteringar<textarea id="cnNotes">'+escAttr(x&&x.gm_notes||'')+'</textarea></label>'+
    '<label class="admincheck"><input id="cnVisible" type="checkbox" '+(x&&x.player_visible?'checked':'')+'> Synlig för spelare</label>'+
    '<label class="admincheck"><input id="cnActive" type="checkbox" '+(!x||x.active!==false?'checked':'')+'> Aktiv</label>'+
    '<div class="adminformactions"><button class="btn" onclick="closeAdminEditor()">Avbryt</button><button class="btn primary" onclick="saveCampaignNpc(\''+id+'\')">Spara</button></div></div>');
}
async function saveCampaignNpc(id){
  id=id||'';var name=$('cnName').value.trim();if(!name){alert('Namn måste anges.');return;}
  var body={campaign_id:centralCampaignId,name:name,title:$('cnTitle').value,current_location_id:$('cnLocation').value||null,description:$('cnDesc').value,gm_notes:$('cnNotes').value,player_visible:$('cnVisible').checked,active:$('cnActive').checked,updated_at:new Date().toISOString()};
  if(!id)body.created_by=supabaseSession.user.id;
  try{if(id)await dbJson('campaign_npcs?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(body)});else await dbJson('campaign_npcs',{method:'POST',body:JSON.stringify(body)});closeAdminEditor();await loadCampaignContentData();renderAdminCampaignContent();showBackupToast('✓ SLP sparad');}catch(e){alert('Kunde inte spara SLP: '+e.message);}
}
async function deleteCampaignNpc(id){
  var x=campaignNpcs.find(function(v){return v.id===id;});if(!x)return;
  if(!await askConfirm('Ta bort SLP','Vill du ta bort '+x.name+'? Kopplingar till platser tas också bort.','Ta bort',true))return;
  try{await dbJson('campaign_npcs?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});await loadCampaignContentData();renderAdminCampaignContent();}catch(e){alert('Kunde inte ta bort SLP: '+e.message);}
}

function editCampaignMonster(id){
  if(!ensureCampaignContentReady())return;
  id=id||'';var x=id?campaignMonsters.find(function(v){return v.id===id;}):null;
  showContentEditor(x?'Redigera monster':'Lägg till monster',
    '<div class="adminform">'+
    '<label>Namn<input id="cmName" value="'+escAttr(x&&x.name||'')+'"></label>'+
    '<label>Monstertyp<input id="cmType" value="'+escAttr(x&&x.monster_type||'')+'"></label>'+
    '<label>Antal<input id="cmQty" type="number" min="0" value="'+(x?Number(x.quantity)||0:1)+'"></label>'+
    '<label>Aktuell plats<select id="cmLocation">'+locationOptionsContent(x&&x.current_location_id||'')+'</select></label>'+
    '<label>Beskrivning<textarea id="cmDesc">'+escAttr(x&&x.description||'')+'</textarea></label>'+
    '<label>SL-noteringar<textarea id="cmNotes">'+escAttr(x&&x.gm_notes||'')+'</textarea></label>'+
    '<label class="admincheck"><input id="cmVisible" type="checkbox" '+(x&&x.player_visible?'checked':'')+'> Synlig för spelare</label>'+
    '<label class="admincheck"><input id="cmActive" type="checkbox" '+(!x||x.active!==false?'checked':'')+'> Aktiv</label>'+
    '<div class="adminformactions"><button class="btn" onclick="closeAdminEditor()">Avbryt</button><button class="btn primary" onclick="saveCampaignMonster(\''+id+'\')">Spara</button></div></div>');
}
async function saveCampaignMonster(id){
  id=id||'';var name=$('cmName').value.trim();if(!name){alert('Namn måste anges.');return;}
  var body={campaign_id:centralCampaignId,name:name,monster_type:$('cmType').value,quantity:Math.max(0,Number($('cmQty').value)||0),current_location_id:$('cmLocation').value||null,description:$('cmDesc').value,gm_notes:$('cmNotes').value,player_visible:$('cmVisible').checked,active:$('cmActive').checked,updated_at:new Date().toISOString()};
  if(!id)body.created_by=supabaseSession.user.id;
  try{if(id)await dbJson('campaign_monsters?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(body)});else await dbJson('campaign_monsters',{method:'POST',body:JSON.stringify(body)});closeAdminEditor();await loadCampaignContentData();renderAdminCampaignContent();showBackupToast('✓ Monster sparat');}catch(e){alert('Kunde inte spara monster: '+e.message);}
}
async function deleteCampaignMonster(id){
  var x=campaignMonsters.find(function(v){return v.id===id;});if(!x)return;
  if(!await askConfirm('Ta bort monster','Vill du ta bort '+x.name+'? Kopplingar till platser tas också bort.','Ta bort',true))return;
  try{await dbJson('campaign_monsters?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});await loadCampaignContentData();renderAdminCampaignContent();}catch(e){alert('Kunde inte ta bort monster: '+e.message);}
}

function locationLinkChecks(items,selected,kind,labelFn){
  var set=new Set(selected||[]);
  if(!items.length)return '<div class="content-empty">Inga objekt skapade ännu.</div>';
  return items.map(function(x){return '<label><input type="checkbox" data-location-link="'+kind+'" value="'+x.id+'" '+(set.has(x.id)?'checked':'')+'> '+escAttr(labelFn(x))+'</label>';}).join('');
}
async function editLocationContent(id){
  var l=campaignLocations.find(function(x){return x.id===id;});if(!l)return;if(!ensureCampaignContentReady())return;
  try{
    currentLocationContentId=id;
    var r=await Promise.all([
      dbJson('campaign_location_player_texts?location_id=eq.'+encodeURIComponent(id)+'&text_kind=eq.description&select=id,body&order=sort_order.asc&limit=1'),
      dbJson('campaign_location_gm_notes?location_id=eq.'+encodeURIComponent(id)+'&note_kind=eq.general&select=id,body&order=sort_order.asc&limit=1'),
      dbJson('campaign_location_assets?location_id=eq.'+encodeURIComponent(id)+'&select=id,storage_path,caption,player_visible,sort_order&order=sort_order.asc'),
      dbJson('campaign_location_event_links?location_id=eq.'+encodeURIComponent(id)+'&select=event_id'),
      dbJson('campaign_location_npc_links?location_id=eq.'+encodeURIComponent(id)+'&select=npc_id'),
      dbJson('campaign_location_monster_links?location_id=eq.'+encodeURIComponent(id)+'&select=monster_id')
    ]);
    currentLocationAssets=Array.isArray(r[2])?r[2]:[];
    var html='<div class="location-content-grid">'+
      '<label class="wide">Beskrivning för spelare<textarea id="lcPlayerText">'+escAttr(r[0]&&r[0][0]&&r[0][0].body||'')+'</textarea></label>'+
      '<label class="wide">SL-noteringar<textarea id="lcGmNotes">'+escAttr(r[1]&&r[1][0]&&r[1][0].body||'')+'</textarea></label>'+
      '<div class="location-link-group"><h4>Händelser</h4>'+locationLinkChecks(campaignEvents,(r[3]||[]).map(function(x){return x.event_id;}),'event',function(x){return x.name;})+'</div>'+
      '<div class="location-link-group"><h4>SLP</h4>'+locationLinkChecks(campaignNpcs,(r[4]||[]).map(function(x){return x.npc_id;}),'npc',function(x){return x.name+(x.title?' · '+x.title:'');})+'</div>'+
      '<div class="location-link-group"><h4>Monster</h4>'+locationLinkChecks(campaignMonsters,(r[5]||[]).map(function(x){return x.monster_id;}),'monster',function(x){return x.name+(x.quantity>1?' ×'+x.quantity:'');})+'</div>'+
      '<div class="wide"><div class="admin-subsection-head"><h3>Bilder</h3><button class="smallbtn" type="button" onclick="$(\'locationAssetFile\').click()">+ Lägg till bild</button></div><div id="locationAssetList" class="location-assets"></div></div></div>'+
      '<div class="adminformactions"><button class="btn" onclick="closeAdminEditor()">Avbryt</button><button class="btn primary" onclick="saveLocationContent(\''+id+'\')">Spara platsinnehåll</button></div>';
    showContentEditor('Platsinnehåll · '+l.location_key+'. '+l.name,html);
    await renderLocationAssetList();
  }catch(e){alert('Kunde inte öppna platsinnehållet: '+e.message);}
}
function selectedLocationLinks(kind){
  return Array.prototype.slice.call(document.querySelectorAll('[data-location-link="'+kind+'"]:checked')).map(function(x){return x.value;});
}
async function replaceLocationLinks(table,idColumn,locationId,ids){
  await dbJson(table+'?location_id=eq.'+encodeURIComponent(locationId),{method:'DELETE',headers:{'Prefer':'return=minimal'}});
  if(ids.length){
    var rows=ids.map(function(v){var row={campaign_id:centralCampaignId,location_id:locationId,relation_kind:'related'};row[idColumn]=v;return row;});
    await dbJson(table,{method:'POST',body:JSON.stringify(rows)});
  }
}
async function saveLocationContent(id){
  var player=$('lcPlayerText')?$('lcPlayerText').value:'',gm=$('lcGmNotes')?$('lcGmNotes').value:'';
  try{
    await dbJson('campaign_location_player_texts?location_id=eq.'+encodeURIComponent(id)+'&text_kind=eq.description',{method:'DELETE',headers:{'Prefer':'return=minimal'}});
    if(player.trim())await dbJson('campaign_location_player_texts',{method:'POST',body:JSON.stringify({campaign_id:centralCampaignId,location_id:id,text_kind:'description',title:'Beskrivning',body:player,player_visible:true,created_by:supabaseSession.user.id})});
    await dbJson('campaign_location_gm_notes?location_id=eq.'+encodeURIComponent(id)+'&note_kind=eq.general',{method:'DELETE',headers:{'Prefer':'return=minimal'}});
    if(gm.trim())await dbJson('campaign_location_gm_notes',{method:'POST',body:JSON.stringify({campaign_id:centralCampaignId,location_id:id,note_kind:'general',title:'SL-noteringar',body:gm,created_by:supabaseSession.user.id})});
    await replaceLocationLinks('campaign_location_event_links','event_id',id,selectedLocationLinks('event'));
    await replaceLocationLinks('campaign_location_npc_links','npc_id',id,selectedLocationLinks('npc'));
    await replaceLocationLinks('campaign_location_monster_links','monster_id',id,selectedLocationLinks('monster'));
    closeAdminEditor();showBackupToast('✓ Platsinnehåll sparat');
  }catch(e){alert('Kunde inte spara platsinnehållet: '+e.message);}
}

async function locationAssetStorageFetch(path,options){
  options=options||{};
  var headers=Object.assign({'apikey':SUPABASE_KEY,'Authorization':'Bearer '+supabaseSession.access_token},options.headers||{});
  return fetch(SUPABASE_URL+'/storage/v1/'+path,Object.assign({},options,{headers:headers}));
}
async function getLocationAssetUrl(asset){
  var cached=locationAssetUrlCache.get(asset.storage_path);if(cached)return cached;
  var r=await locationAssetStorageFetch('object/campaign-location-assets/'+encodeStoragePath(asset.storage_path),{method:'GET'});
  if(!r.ok)throw new Error('Kunde inte läsa bilden ('+r.status+').');
  var blob=await r.blob(),url=URL.createObjectURL(blob);locationAssetUrlCache.set(asset.storage_path,url);return url;
}
async function renderLocationAssetList(){
  var el=$('locationAssetList');if(!el)return;
  if(!currentLocationAssets.length){el.innerHTML='<div class="content-empty">Inga bilder kopplade till platsen ännu.</div>';return;}
  el.innerHTML=currentLocationAssets.map(function(a){
    return '<div class="location-asset-row"><div class="location-asset-thumb" data-asset-thumb="'+a.id+'"></div><div><b>'+escAttr(a.caption||'Bild')+'</b><div class="muted">'+(a.player_visible?'Synlig för spelare':'Endast SL')+'</div></div><div class="admin-map-actions"><button class="smallbtn '+(a.player_visible?'admin-map-toggle active':'')+'" onclick="toggleLocationAssetVisibility(\''+a.id+'\')" title="Växla spelaråtkomst">👁</button><button class="deletebtn" onclick="deleteLocationAsset(\''+a.id+'\')">×</button></div></div>';
  }).join('');
  for(var i=0;i<currentLocationAssets.length;i++){
    var a=currentLocationAssets[i];
    try{var url=await getLocationAssetUrl(a),box=document.querySelector('[data-asset-thumb="'+a.id+'"]');if(box)box.innerHTML='<img class="location-asset-thumb" src="'+url+'" alt="">';}catch(e){console.warn(e);}
  }
}
async function handleLocationAssetFile(file){
  if(!file||!currentLocationContentId||!campaignContentReady||$('adminEditor').classList.contains('hidden'))return;
  var caption=prompt('Bildtext',(file.name||'Bild').replace(/\.[^.]+$/,''));if(caption===null)return;
  var ext=(file.name.split('.').pop()||'webp').toLowerCase();if(['png','jpg','jpeg','webp'].indexOf(ext)<0)ext='webp';
  var assetId=crypto.randomUUID(),path=centralCampaignId+'/'+currentLocationContentId+'/'+assetId+'.'+ext,rowCreated=false;
  try{
    await dbJson('campaign_location_assets',{method:'POST',body:JSON.stringify({id:assetId,campaign_id:centralCampaignId,location_id:currentLocationContentId,asset_kind:'image',asset_type:'image',storage_path:path,caption:caption.trim(),player_visible:true,sort_order:currentLocationAssets.length,created_by:supabaseSession.user.id})});rowCreated=true;
    var r=await locationAssetStorageFetch('object/campaign-location-assets/'+encodeStoragePath(path),{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
    if(!r.ok){var d=await r.json().catch(function(){return {};});throw new Error(d&&d.message||d&&d.error||'Bilduppladdningen misslyckades.');}
    currentLocationAssets=await dbJson('campaign_location_assets?location_id=eq.'+encodeURIComponent(currentLocationContentId)+'&select=id,storage_path,caption,player_visible,sort_order&order=sort_order.asc');
    await renderLocationAssetList();showBackupToast('✓ Bild tillagd');
  }catch(e){
    if(rowCreated)dbJson('campaign_location_assets?id=eq.'+encodeURIComponent(assetId),{method:'DELETE',headers:{'Prefer':'return=minimal'}}).catch(function(){});
    alert('Kunde inte lägga till bilden: '+e.message);
  }
}
async function toggleLocationAssetVisibility(id){
  var a=currentLocationAssets.find(function(x){return x.id===id;});if(!a)return;
  try{await dbJson('campaign_location_assets?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({player_visible:!a.player_visible})});a.player_visible=!a.player_visible;await renderLocationAssetList();}catch(e){alert('Kunde inte ändra spelaråtkomst: '+e.message);}
}
async function deleteLocationAsset(id){
  var a=currentLocationAssets.find(function(x){return x.id===id;});if(!a)return;
  if(!await askConfirm('Ta bort bild','Vill du ta bort bilden från platsen?','Ta bort',true))return;
  try{
    await dbJson('campaign_location_assets?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});
    var r=await locationAssetStorageFetch('object/campaign-location-assets',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[a.storage_path]})});
    if(!r.ok)console.warn('Bildfilen kunde inte tas bort från storage');
    var old=locationAssetUrlCache.get(a.storage_path);if(old){URL.revokeObjectURL(old);locationAssetUrlCache.delete(a.storage_path);}
    currentLocationAssets=currentLocationAssets.filter(function(x){return x.id!==id;});await renderLocationAssetList();
  }catch(e){alert('Kunde inte ta bort bilden: '+e.message);}
}
