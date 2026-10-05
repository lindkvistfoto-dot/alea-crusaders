let eventCombatEditorState=null;
async function loadCampaignCombatScenes(){
 if(!centralCampaignId){campaignCombatScenes=[];return campaignCombatScenes}
 try{campaignCombatScenes=await dbJson('campaign_combat_scenes?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=*&order=sort_order.asc,name.asc')||[]}
 catch(e){console.error('Kunde inte läsa stridsscener',e);campaignCombatScenes=[]}
 return campaignCombatScenes
}
function combatSceneAvailableMaps(locationId){
 locationId=locationId||'';
 if(locationId){
  let loc=campaignLocations.find(l=>l.id===locationId);
  if(loc)return campaignMaps.filter(m=>m.site_id===loc.site_id)
 }
 return campaignMaps.slice()
}
function combatSceneMapOptions(selected,locationId){
 selected=selected||'';let maps=combatSceneAvailableMaps(locationId||'');
 return '<option value="">Välj karta…</option>'+maps.map(m=>{
  let label=(m.site_id?sitePath(m.site_id)+' › ':'')+(m.name||'Namnlös karta');
  return '<option value="'+m.id+'" '+(m.id===selected?'selected':'')+'>'+escAttr(label)+'</option>'
 }).join('')
}
function combatSceneLocationOptions(selected){
 selected=selected||'';
 return '<option value="">Ingen särskild plats</option>'+campaignLocations.map(l=>'<option value="'+l.id+'" '+(l.id===selected?'selected':'')+'>'+escAttr(campaignLocationLabel(l))+'</option>').join('')
}
function combatSceneEventOptions(selected){
 selected=selected||'';
 return '<option value="">Ingen händelse kopplad</option>'+campaignEvents.map(e=>'<option value="'+e.id+'" '+(e.id===selected?'selected':'')+'>'+escAttr(e.name||'Händelse')+'</option>').join('')
}
function eventCombatSettings(cfg){
 let raw=(cfg&&cfg.settings&&typeof cfg.settings==='object')?cfg.settings:{};
 let h=Number(raw.map_height_m)||45,hexM=1.5;
 return{hex_m:hexM,map_height_m:h,rows:Math.max(2,Math.round(h/hexM)),hex_scale:Math.max(.5,Math.min(1.5,Number(raw.hex_scale)||1)),offset_x:Number(raw.offset_x)||0,offset_y:Number(raw.offset_y)||0,terrain_visibility:raw.terrain_visibility||'clear'}
}
function combatSceneMeta(scene){
 let map=campaignMaps.find(m=>m.id===scene.map_id),loc=campaignLocations.find(l=>l.id===scene.location_id),evt=campaignEvents.find(e=>e.id===scene.source_event_id),meta=[];
 if(evt)meta.push(evt.name||'Händelse');
 if(loc)meta.push(campaignLocationLabel(loc));
 if(scene.background_image_path)meta.push('Direktuppladdad stridsbild');
 else if(map)meta.push(map.name||'Karta');
 if(!meta.length)meta.push('Ingen karta vald');
 return meta.join(' · ')
}
function renderAdminCombatSceneList(){
 let el=$('adminCombatSceneTable');if(!el)return;
 el.innerHTML=campaignCombatScenes.length?campaignCombatScenes.map(scene=>'<div class="admin-event-row"><div class="event-scene-copy"><b>'+escAttr(scene.name||'Stridsscen')+'</b><small>'+escAttr(combatSceneMeta(scene))+'</small></div><div class="admin-event-actions"><button class="smallbtn" type="button" onclick="openCampaignCombatSceneEditor(\''+scene.id+'\')" title="Redigera stridsscen">✎</button><button class="deletebtn" type="button" onclick="deleteCampaignCombatScene(\''+scene.id+'\')" title="Ta bort stridsscen">×</button></div></div>').join(''):'<div class="content-empty">Inga stridsscener ännu.</div>'
}
async function refreshAdminCombatScenes(){await loadCampaignCombatScenes();renderAdminCombatSceneList();renderAdminOverviewCounts()}
async function deleteCampaignCombatScene(sceneId){
 let scene=campaignCombatScenes.find(x=>x.id===sceneId);
 if(!await askConfirm('Ta bort stridsscen','Vill du ta bort '+(scene?.name||'stridsscenen')+'? Hexterräng, kombatanter och eventuell direktuppladdad stridsbild tas också bort.','Ta bort',true))return;
 try{
  let backgroundPath=scene?.background_image_path||'';
  await dbJson('campaign_combat_scenes?id=eq.'+encodeURIComponent(sceneId),{method:'DELETE',headers:{'Prefer':'return=minimal'}});
  if(backgroundPath)await deleteCombatSceneStoredImage(backgroundPath).catch(e=>console.warn('Kunde inte rensa stridsbild efter scenborttagning',e));
  campaignCombatScenes=campaignCombatScenes.filter(x=>x.id!==sceneId);renderAdminCombatSceneList();renderAdminOverviewCounts();await refreshAdminCombatScenes()
 }catch(e){alert('Kunde inte ta bort stridsscenen: '+e.message)}
}
async function openCampaignCombatSceneEditor(sceneId,presetEventId){
 let existingSceneId=sceneId||'',isNew=!existingSceneId,draftSceneId=existingSceneId||crypto.randomUUID();
 $('adminEditorTitle').textContent=(isNew?'Lägg till':'Redigera')+' stridsscen';
 $('adminEditorBody').innerHTML='<div class="content-empty">Laddar stridsscen…</div>';
 let modal=document.querySelector('#adminEditor .admineditor');if(modal)modal.classList.add('event-combat-editor');
 $('adminEditor').classList.remove('hidden');
 try{
  let cfg=null,hexRows=[],combatantRows=[];
  let characterRows=await dbJson('characters?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=id,name,is_npc&order=name.asc');
  if(existingSceneId){
   let rows=await Promise.all([
    dbJson('campaign_combat_scenes?id=eq.'+encodeURIComponent(existingSceneId)+'&campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=*&limit=1'),
    dbJson('campaign_combat_scene_hexes?scene_id=eq.'+encodeURIComponent(existingSceneId)+'&select=id,q,r,movement_mode,sight_mode,movement_cost,notes'),
    dbJson('campaign_combat_scene_combatants?scene_id=eq.'+encodeURIComponent(existingSceneId)+'&select=*&order=sort_order.asc,name.asc')
   ]);
   cfg=rows[0]?.[0]||null;if(!cfg)throw new Error('Stridsscenen finns inte längre.');
   hexRows=rows[1]||[];combatantRows=rows[2]||[]
  }
  let locationId=cfg?.location_id||'',backgroundPath=cfg?.background_image_path||'',availableMaps=combatSceneAvailableMaps(locationId);
  let mapId=backgroundPath?'':(cfg?.map_id&&availableMaps.some(m=>m.id===cfg.map_id)?cfg.map_id:'');
  let settings=eventCombatSettings(cfg),hexMap=new Map((hexRows||[]).map(h=>[h.q+','+h.r,{...h}]));
  eventCombatEditorState={
   sceneId:draftSceneId,isNew,cfg,sceneName:cfg?.name||'',sourceEventId:cfg?.source_event_id||presetEventId||'',locationId,mapId,
   backgroundPath,backgroundWidth:Number(cfg?.background_width)||0,backgroundHeight:Number(cfg?.background_height)||0,
   originalBackgroundPath:backgroundPath,pendingUploadPath:'',settings,hexes:hexMap,selected:new Set(),imageUrl:'',dirty:false,
   characters:Array.isArray(characterRows)?characterRows:[],
   combatants:(combatantRows||[]).map(x=>({...x,isNew:false})),
   deletedCombatantIds:new Set(),combatantPickerOpen:false,editingCombatantId:null,placementCombatantId:null,dragCombatantId:null,
   tool:null,brushRadius:0,terrainMovement:'free',terrainSight:'clear',zoom:1,paintPointerId:null,paintLastKey:null,pan:null,gesturePointers:new Map(),pinch:null
  };
  renderEventCombatMapEditor();
  if(backgroundPath)await loadEventCombatEditorBackgroundImage(backgroundPath);
  else if(mapId)await loadEventCombatEditorMapImage(mapId)
 }catch(e){
  console.error('Kunde inte öppna stridsscenen',e);
  $('adminEditorBody').innerHTML='<div class="content-empty">Kunde inte öppna stridsscenen: '+escAttr(e.message)+'</div>'
 }
}
async function deleteCombatSceneStoredImage(path){
 if(!path)return;
 let r=await mapStorageFetch('object/combat-scene-maps/'+encodeStoragePath(path),{method:'DELETE'});
 if(!r.ok&&r.status!==404){
  let data=await r.json().catch(()=>({}));
  throw new Error(data?.message||data?.error||'Kunde inte ta bort stridsbilden.')
 }
}
async function getCombatSceneBackgroundUrl(path){
 if(!path)return '';
 let cacheKey='combat-scene-maps:'+path,cached=mapImageCache.get(cacheKey);
 if(cached?.url)return cached.url;
 let r=await mapStorageFetch('object/combat-scene-maps/'+encodeStoragePath(path),{method:'GET'});
 if(!r.ok){
  let data=await r.json().catch(()=>({}));
  throw new Error(data?.message||data?.error||('Kunde inte läsa stridsbilden ('+r.status+').'))
 }
 let blob=await r.blob();if(!blob.size)throw new Error('Stridsbilden är tom.');
 let url=URL.createObjectURL(blob);mapImageCache.set(cacheKey,{url});return url
}
async function handleCombatSceneMapFile(file){
 let st=eventCombatEditorState;if(!file||!st||!centralCampaignId)return;
 let ext=(String(file.name||'').split('.').pop()||'webp').toLowerCase();
 if(!['png','jpg','jpeg','webp'].includes(ext)){alert('Kartbilden måste vara PNG, JPG eller WEBP.');return}
 if((st.hexes.size||sceneHasCombatantPlacements())&&(st.mapId||st.backgroundPath)){
  let ok=await askConfirm('Byt stridskarta','Terrängmarkeringar och startpositioner är kopplade till hexkoordinater. Vill du byta bakgrundsbild och rensa dem?','Byt karta');
  if(!ok)return;
 }
 let path=centralCampaignId+'/'+st.sceneId+'/background-'+crypto.randomUUID()+'.'+ext,previousPending=st.pendingUploadPath;
 try{
  let dim=await readImageDimensions(file);
  let r=await mapStorageFetch('object/combat-scene-maps/'+encodeStoragePath(path),{
   method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file
  });
  if(!r.ok){
   let data=await r.json().catch(()=>({}));
   throw new Error(data?.message||data?.error||'Uppladdningen av kartbilden misslyckades.')
  }
  if(previousPending&&previousPending!==st.originalBackgroundPath)await deleteCombatSceneStoredImage(previousPending).catch(()=>{});
  st.hexes.clear();st.selected.clear();clearAllSceneCombatantPlacements(false);st.mapId='';
  st.backgroundPath=path;st.backgroundWidth=dim.width;st.backgroundHeight=dim.height;st.pendingUploadPath=path;
  st.imageUrl=URL.createObjectURL(file);st.dirty=true;
  renderEventCombatMapEditor();showBackupToast('✓ Stridsbild uppladdad endast till stridsscenen')
 }catch(e){
  console.error('Kartuppladdning till stridsscen misslyckades',e);
  await deleteCombatSceneStoredImage(path).catch(()=>{});
  alert('Kunde inte ladda upp stridskartan: '+e.message)
 }
}
async function removeEventCombatDirectBackground(){
 let st=eventCombatEditorState;if(!st||!st.backgroundPath)return;
 if(st.hexes.size||sceneHasCombatantPlacements()){
  let ok=await askConfirm('Ta bort stridsbild','Vill du ta bort den direktuppladdade bakgrunden? Terrängmarkeringar och startpositioner rensas eftersom de hör till kartans hexnät.','Ta bort',true);
  if(!ok)return
 }
 if(st.pendingUploadPath&&st.pendingUploadPath!==st.originalBackgroundPath)await deleteCombatSceneStoredImage(st.pendingUploadPath).catch(()=>{});
 st.backgroundPath='';st.backgroundWidth=0;st.backgroundHeight=0;st.pendingUploadPath='';
 st.hexes.clear();st.selected.clear();clearAllSceneCombatantPlacements(false);st.imageUrl='';st.dirty=true;
 renderEventCombatMapEditor();if(st.mapId)await loadEventCombatEditorMapImage(st.mapId)
}
async function loadEventCombatEditorBackgroundImage(path){
 if(!eventCombatEditorState||!path)return;
 try{eventCombatEditorState.imageUrl=await getCombatSceneBackgroundUrl(path);renderEventCombatHexCanvas()}
 catch(e){alert('Kunde inte läsa stridsbilden: '+e.message)}
}
async function loadEventCombatEditorMapImage(mapId){
 if(!eventCombatEditorState)return;
 let map=campaignMaps.find(m=>m.id===mapId);if(!map)return;
 try{eventCombatEditorState.imageUrl=await getMapImageUrl(map);renderEventCombatHexCanvas()}
 catch(e){alert('Kunde inte läsa kartbilden: '+e.message)}
}
function sceneCombatantTypeLabel(t){return({player:'SPELARE',npc:'SLP',enemy:'FIENDE',monster:'MONSTER'})[t]||String(t||'KOMBATANT').toUpperCase()}
function sceneCombatantSourceLabel(c){
 if(c.source_type==='character')return c.combatant_type==='player'?'Rollfigur':'Rollfigur · SLP';
 if(c.source_type==='npc')return 'Kampanjperson';
 if(c.source_type==='monster')return 'Fiende-/monstermall';
 return 'Egen kombatant'
}
function sceneCombatantRowHtml(c){
 let st=eventCombatEditorState,editing=st?.editingCombatantId===c.id,placing=st?.placementCombatantId===c.id;
 if(editing){
  return '<div class="scene-combatant-row"><div class="scene-combatant-edit">'+
   '<input id="sceneCombatantName_'+c.id+'" value="'+escAttr(c.name||'')+'" aria-label="Namn">'+
   '<select id="sceneCombatantType_'+c.id+'">'+
    ['player','npc','enemy','monster'].map(t=>'<option value="'+t+'" '+(c.combatant_type===t?'selected':'')+'>'+sceneCombatantTypeLabel(t)+'</option>').join('')+
   '</select>'+
   '<button class="smallbtn" type="button" onclick="saveSceneCombatantEdit(\''+c.id+'\')">✓</button>'+
   '<button class="smallbtn" type="button" onclick="cancelSceneCombatantEdit()">Avbryt</button>'+
  '</div></div>'
 }
 let placed=c.start_q!=null&&c.start_r!=null;
 return '<div class="scene-combatant-row'+(placing?' placement-active':'')+'" data-combatant-id="'+c.id+'" draggable="true" ondragstart="sceneCombatantDragStart(event,\''+c.id+'\')" ondragend="sceneCombatantDragEnd(event)">'+
  '<span class="scene-combatant-badge">'+sceneCombatantTypeLabel(c.combatant_type)+'</span>'+
  '<div class="scene-combatant-copy"><b>'+escAttr(c.name||'Kombatant')+'</b><small>'+escAttr(sceneCombatantSourceLabel(c))+'</small><small class="scene-combatant-position '+(placed?'placed':'unplaced')+'">'+(placed?('Starthex '+c.start_q+','+c.start_r):'Ej placerad')+'</small></div>'+
  '<div class="scene-combatant-actions">'+
   '<button class="smallbtn scene-place-btn'+(placing?' active':'')+'" type="button" onclick="selectSceneCombatantForPlacement(\''+c.id+'\')" title="'+(placed?'Flytta startposition':'Placera startposition')+'">⌖</button>'+
   (placed?'<button class="smallbtn" type="button" onclick="clearSceneCombatantPlacement(\''+c.id+'\')" title="Rensa startposition">↺</button>':'')+
   '<button class="smallbtn" type="button" onclick="editSceneCombatant(\''+c.id+'\')" title="Redigera">✎</button>'+
   '<button class="deletebtn" type="button" onclick="deleteSceneCombatant(\''+c.id+'\')" title="Ta bort">×</button>'+
  '</div>'+
 '</div>'
}
function sceneCombatantPickerHtml(st){
 let existing=new Set((st.combatants||[]).filter(c=>c.source_id&&['character','npc'].includes(c.source_type)).map(c=>c.source_type+':'+c.source_id));
 let players=(st.characters||[]).filter(c=>!c.is_npc).map(c=>
  '<label class="scene-participant-row"><input type="checkbox" data-add-combatant="character" data-id="'+c.id+'" data-kind="player" '+(existing.has('character:'+c.id)?'disabled':'')+'><span><b>'+escAttr(c.name||'Rollfigur')+'</b></span></label>'
 ).join('');
 let characterNpcs=(st.characters||[]).filter(c=>c.is_npc).map(c=>
  '<label class="scene-participant-row"><input type="checkbox" data-add-combatant="character" data-id="'+c.id+'" data-kind="npc" '+(existing.has('character:'+c.id)?'disabled':'')+'><span><b>'+escAttr(c.name||'SLP')+'</b><small>Rollfigur markerad som SLP</small></span></label>'
 ).join('');
 let campaignNpcRows=campaignNpcs.map(n=>
  '<label class="scene-participant-row"><input type="checkbox" data-add-combatant="npc" data-id="'+n.id+'" data-kind="npc" '+(existing.has('npc:'+n.id)?'disabled':'')+'><span><b>'+escAttr(n.name||'SLP')+'</b><small>'+escAttr(n.title||'Kampanjperson')+'</small></span></label>'
 ).join('');
 let templates=campaignMonsters.map(m=>
  '<label class="scene-template-row"><input type="checkbox" data-add-combatant="monster" data-id="'+m.id+'"><span><b>'+escAttr(m.name||'Fiende')+'</b><small>'+escAttr(m.monster_type||'Mall')+'</small></span><input type="number" min="1" max="100" value="'+Math.max(1,Number(m.quantity)||1)+'" data-combatant-qty="'+m.id+'" aria-label="Antal"><select data-combatant-kind="'+m.id+'"><option value="enemy">Fiende</option><option value="monster">Monster</option></select></label>'
 ).join('');
 return '<div class="scene-combatant-picker">'+
  '<div class="scene-participants">'+
   '<section class="scene-participant-group"><h4>Spelare</h4><div class="scene-participant-list">'+(players||'<div class="scene-participant-empty">Inga spelarkaraktärer finns.</div>')+'</div></section>'+
   '<section class="scene-participant-group"><h4>SLP</h4><div class="scene-participant-list">'+((characterNpcs+campaignNpcRows)||'<div class="scene-participant-empty">Inga SLP finns.</div>')+'</div></section>'+
   '<section class="scene-participant-group"><h4>Fiender / monster</h4><div class="scene-participant-list">'+(templates||'<div class="scene-participant-empty">Inga fiende- eller monstermallar finns ännu.</div>')+'</div></section>'+
  '</div>'+
  '<div class="scene-combatant-picker-actions"><button class="smallbtn" type="button" onclick="toggleSceneCombatantPicker()">Avbryt</button><button class="smallbtn" type="button" onclick="addSelectedSceneCombatants()">Lägg till markerade</button></div>'+
 '</div>'
}
function eventCombatCombatantsHtml(st){
 let rows=(st.combatants||[]).map(sceneCombatantRowHtml).join('');
 let placed=(st.combatants||[]).filter(c=>c.start_q!=null&&c.start_r!=null).length,total=(st.combatants||[]).length;
 return '<section class="scene-combatants">'+
  '<div class="scene-combatants-head"><div><h3>Kombatanter</h3><small class="scene-placement-count">'+placed+' / '+total+' placerade</small></div><button class="smallbtn" type="button" onclick="toggleSceneCombatantPicker()">+ Lägg till kombatanter</button></div>'+
  '<div class="scene-placement-help">Dra en kombatant till kartan, eller tryck <b>⌖</b> och därefter på önskad hex. En hex kan ha en startande kombatant.</div>'+
  '<div id="sceneCombatantList" class="scene-combatant-list">'+(rows||'<div class="scene-participant-empty">Inga kombatanter valda.</div>')+'</div>'+
  (st.combatantPickerOpen?sceneCombatantPickerHtml(st):'')+
 '</section>'
}
function renderSceneCombatantsSection(){
 let st=eventCombatEditorState,old=$('sceneCombatantsMount');if(!st||!old)return;
 old.innerHTML=eventCombatCombatantsHtml(st)
}
function toggleSceneCombatantPicker(){let st=eventCombatEditorState;if(!st)return;st.combatantPickerOpen=!st.combatantPickerOpen;st.editingCombatantId=null;renderSceneCombatantsSection()}
function sceneCombatantTempId(){return 'tmp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function nextSceneCombatantInstance(sourceType,sourceId){
 let nums=(eventCombatEditorState?.combatants||[]).filter(c=>c.source_type===sourceType&&c.source_id===sourceId).map(c=>Number(c.instance_no)||1);
 return nums.length?Math.max(...nums)+1:1
}
function addSceneCombatant(sourceType,sourceId,kind,name,instanceNo){
 let st=eventCombatEditorState;if(!st)return;
 st.combatants.push({id:sceneCombatantTempId(),isNew:true,scene_id:st.sceneId||null,campaign_id:centralCampaignId,source_type:sourceType,source_id:sourceId||null,combatant_type:kind,instance_no:instanceNo||1,name:name||'Kombatant',visible_to_players:true,sort_order:st.combatants.length,start_q:null,start_r:null,state:{}})
}
function addSelectedSceneCombatants(){
 let st=eventCombatEditorState;if(!st)return;
 document.querySelectorAll('#sceneCombatantsMount [data-add-combatant="character"]:checked').forEach(cb=>{
  let c=st.characters.find(x=>x.id===cb.dataset.id);if(c)addSceneCombatant('character',c.id,cb.dataset.kind||'player',c.name,1)
 });
 document.querySelectorAll('#sceneCombatantsMount [data-add-combatant="npc"]:checked').forEach(cb=>{
  let n=campaignNpcs.find(x=>x.id===cb.dataset.id);if(n)addSceneCombatant('npc',n.id,'npc',n.name,1)
 });
 document.querySelectorAll('#sceneCombatantsMount [data-add-combatant="monster"]:checked').forEach(cb=>{
  let m=campaignMonsters.find(x=>x.id===cb.dataset.id);if(!m)return;
  let qty=Math.max(1,Math.min(100,Number(document.querySelector('[data-combatant-qty="'+m.id+'"]')?.value)||1));
  let kind=document.querySelector('[data-combatant-kind="'+m.id+'"]')?.value||'enemy';
  let first=nextSceneCombatantInstance('monster',m.id);
  for(let i=0;i<qty;i++){
   let instanceNo=first+i,name=(qty>1||first>1)?(m.name+' '+instanceNo):m.name;
   addSceneCombatant('monster',m.id,kind,name,instanceNo)
  }
 });
 st.combatantPickerOpen=false;st.dirty=true;renderSceneCombatantsSection()
}
function editSceneCombatant(id){let st=eventCombatEditorState;if(!st)return;st.editingCombatantId=id;st.combatantPickerOpen=false;renderSceneCombatantsSection()}
function cancelSceneCombatantEdit(){if(!eventCombatEditorState)return;eventCombatEditorState.editingCombatantId=null;renderSceneCombatantsSection()}
function saveSceneCombatantEdit(id){
 let st=eventCombatEditorState,c=st?.combatants?.find(x=>x.id===id);if(!c)return;
 let name=String($('sceneCombatantName_'+id)?.value||'').trim();if(!name){alert('Kombatanten måste ha ett namn.');return}
 c.name=name;c.combatant_type=$('sceneCombatantType_'+id)?.value||c.combatant_type;c.updated_at=new Date().toISOString();st.editingCombatantId=null;st.dirty=true;renderSceneCombatantsSection()
}
function deleteSceneCombatant(id){
 let st=eventCombatEditorState,c=st?.combatants?.find(x=>x.id===id);if(!st||!c)return;
 if(!c.isNew)st.deletedCombatantIds.add(c.id);
 st.combatants=st.combatants.filter(x=>x.id!==id);if(st.editingCombatantId===id)st.editingCombatantId=null;st.dirty=true;renderSceneCombatantsSection()
}
function sceneCombatantPlacementKey(c){
 return c&&c.start_q!=null&&c.start_r!=null?String(c.start_q)+','+String(c.start_r):''
}
function sceneHasCombatantPlacements(){
 return !!eventCombatEditorState?.combatants?.some(c=>c.start_q!=null&&c.start_r!=null)
}
function clearAllSceneCombatantPlacements(markDirty=true){
 let st=eventCombatEditorState;if(!st)return;
 (st.combatants||[]).forEach(c=>{c.start_q=null;c.start_r=null});
 st.placementCombatantId=null;st.dragCombatantId=null;
 if(markDirty)st.dirty=true
}
function sceneCombatantAtHex(key,exceptId=''){
 let st=eventCombatEditorState;
 return st?.combatants?.find(c=>c.id!==exceptId&&sceneCombatantPlacementKey(c)===key)||null
}
function sceneCombatantTokenLabel(c){
 let parts=String(c?.name||'?').trim().split(/\s+/).filter(Boolean);
 if(!parts.length)return '?';
 if(parts.length===1)return parts[0].slice(0,2).toUpperCase();
 let last=parts[parts.length-1],lastNum=/^\d+$/.test(last)?last:'';
 return (parts[0].charAt(0)+(lastNum||last.charAt(0))).slice(0,2).toUpperCase()
}
function syncEventCombatToolButtons(){
 let st=eventCombatEditorState;
 ['Select','Brush','Erase'].forEach(name=>{
  let b=$('ecTool'+name),active=st?.tool===name.toLowerCase();
  if(b){b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false')}
 })
}
function selectSceneCombatantForPlacement(id){
 let st=eventCombatEditorState,c=st?.combatants?.find(x=>x.id===id);if(!st||!c)return;
 st.placementCombatantId=st.placementCombatantId===id?null:id;
 if(st.placementCombatantId){
  st.tool=null;st.paintLastKey=null;st.paintPointerId=null;st.pan=null;st.pinch=null;st.gesturePointers=new Map()
 }
 syncEventCombatToolButtons();renderSceneCombatantsSection();renderEventCombatHexCanvas()
}
function clearSceneCombatantPlacement(id){
 let st=eventCombatEditorState,c=st?.combatants?.find(x=>x.id===id);if(!c)return;
 c.start_q=null;c.start_r=null;if(st.placementCombatantId===id)st.placementCombatantId=null;
 st.dirty=true;renderSceneCombatantsSection();renderEventCombatHexCanvas()
}
function placeSceneCombatantAtHex(id,key){
 let st=eventCombatEditorState,c=st?.combatants?.find(x=>x.id===id);if(!st||!c||!key)return false;
 let terrain=st.hexes.get(key);
 if(terrain?.movement_mode==='blocked'){alert('Kombatanten kan inte starta på en ogenomtränglig hex.');return false}
 let occupied=sceneCombatantAtHex(key,id);
 if(occupied){alert('Hex '+key+' används redan av '+(occupied.name||'en annan kombatant')+'.');return false}
 let parts=String(key).split(',').map(Number);
 if(parts.length!==2||parts.some(v=>!Number.isInteger(v)))return false;
 c.start_q=parts[0];c.start_r=parts[1];st.placementCombatantId=id;st.dirty=true;
 renderSceneCombatantsSection();renderEventCombatHexCanvas();return true
}
function sceneCombatantDragStart(e,id){
 let st=eventCombatEditorState,c=st?.combatants?.find(x=>x.id===id);if(!st||!c)return;
 st.dragCombatantId=id;
 try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id)}catch(_){}
 e.currentTarget?.classList?.add('dragging')
}
function sceneCombatantDragEnd(e){
 let st=eventCombatEditorState;if(st)st.dragCombatantId=null;
 e.currentTarget?.classList?.remove('dragging');$('eventCombatCanvas')?.classList.remove('combatant-drop-ready')
}
function eventCombatHexKeyFromClient(clientX,clientY){
 let svg=$('eventCombatCanvas')?.querySelector('svg'),g=eventCombatHexGeometry();if(!svg||!g)return '';
 let rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return '';
 if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return '';
 let x=(clientX-rect.left)/rect.width*g.width,y=(clientY-rect.top)/rect.height*g.height,best=null,bestD=Infinity;
 eventCombatHexCells().forEach(c=>{
  if(c.x<0||c.x>g.width||c.y<0||c.y>g.height)return;
  let d=(c.x-x)*(c.x-x)+(c.y-y)*(c.y-y);
  if(d<bestD){bestD=d;best=c}
 });
 return best&&Math.sqrt(bestD)<=g.size?best.key:''
}
function sceneCombatantMapDragOver(e){
 let st=eventCombatEditorState,id=st?.dragCombatantId||e.dataTransfer?.getData?.('text/plain');if(!st||!id)return;
 e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';$('eventCombatCanvas')?.classList.add('combatant-drop-ready')
}
function sceneCombatantMapDragLeave(e){
 let canvas=$('eventCombatCanvas');if(!canvas)return;
 let next=e.relatedTarget;if(!next||!canvas.contains(next))canvas.classList.remove('combatant-drop-ready')
}
function sceneCombatantMapDrop(e){
 let st=eventCombatEditorState;if(!st)return;e.preventDefault();
 let id='';
 try{id=e.dataTransfer?.getData('text/plain')||st.dragCombatantId||''}catch(_){id=st.dragCombatantId||''}
 st.dragCombatantId=null;$('eventCombatCanvas')?.classList.remove('combatant-drop-ready');
 let key=eventCombatHexKeyFromClient(e.clientX,e.clientY);if(id&&key)placeSceneCombatantAtHex(id,key)
}
function renderEventCombatMapEditor(){
 let st=eventCombatEditorState;if(!st)return;
 let set=st.settings,directStatus=st.backgroundPath?'<div class="event-combat-direct-status"><span>Direktuppladdad stridsbild aktiv · sparas endast med stridsscenen</span><button class="smallbtn" type="button" onclick="removeEventCombatDirectBackground()">Ta bort</button></div>':'';
 $('adminEditorBody').innerHTML=
 '<div class="event-combat-editor-layout">'+
  '<div class="event-combat-settings">'+
   '<label>Namn på stridsscenen<input id="ecSceneName" value="'+escAttr(st.sceneName||'')+'" placeholder="t.ex. Bron" oninput="eventCombatEditorState.sceneName=this.value"></label>'+
   '<label>Händelse<select id="ecEvent" onchange="eventCombatEditorState.sourceEventId=this.value;eventCombatEditorState.dirty=true">'+combatSceneEventOptions(st.sourceEventId)+'</select></label>'+
   '<label>Plats<select id="ecLocation" onchange="changeEventCombatSceneLocation(this.value)">'+combatSceneLocationOptions(st.locationId)+'</select></label>'+
   '<div class="event-combat-map-source">'+
     '<div class="event-combat-map-upload"><div><b>Bakgrundskarta</b><small>Ladda upp en bild som hör endast till denna stridsscen. Den läggs inte till bland platsstrukturens permanenta kartor.</small></div><button class="smallbtn" type="button" onclick="$(\'ecSceneMapFile\').click()">↑ Ladda upp kartbild</button><input id="ecSceneMapFile" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange="handleCombatSceneMapFile(this.files&&this.files[0]);this.value=\'\'"></div>'+
     directStatus+
     '<label class="event-combat-existing-map">Eller välj befintlig karta<select id="ecMap" onchange="changeEventCombatMap(this.value)" '+(st.backgroundPath?'disabled':'')+'>'+combatSceneMapOptions(st.mapId,st.locationId)+'</select></label>'+
   '</div>'+
   '<label>Kartans höjd (meter)<input id="ecHeight" type="number" min="3" step="1.5" value="'+set.map_height_m+'" oninput="eventCombatCalibrationChanged()"></label>'+
   '<div class="event-combat-derived"><b id="ecRows">'+set.rows+'</b> hexrader · <b>1,5 m</b> per hex</div>'+
   '<details><summary>Finjustera hexnät</summary><div class="event-combat-offsets"><label>Hexstorlek (%)<input id="ecHexScale" type="number" min="50" max="150" step="1" value="'+Math.round((set.hex_scale||1)*100)+'" oninput="eventCombatCalibrationChanged()"></label><label>X-förskjutning<input id="ecOffsetX" type="number" step="1" value="'+set.offset_x+'" oninput="eventCombatCalibrationChanged()"></label><label>Y-förskjutning<input id="ecOffsetY" type="number" step="1" value="'+set.offset_y+'" oninput="eventCombatCalibrationChanged()"></label></div></details>'+
  '</div>'+
  '<div id="sceneCombatantsMount">'+eventCombatCombatantsHtml(st)+'</div>'+
  '<div id="eventCombatCanvas" class="event-combat-canvas" ondragover="sceneCombatantMapDragOver(event)" ondragleave="sceneCombatantMapDragLeave(event)" ondrop="sceneCombatantMapDrop(event)"><div class="event-combat-loading">Välj eller ladda upp karta…</div></div>'+
  '<div class="event-combat-drawtools">'+
    '<button id="ecToolSelect" class="smallbtn '+(st.tool==='select'?'active':'')+'" type="button" aria-pressed="'+(st.tool==='select'?'true':'false')+'" onclick="setEventCombatTool(\'select\')" title="Markera">⬡ Markera</button>'+
    '<button id="ecToolBrush" class="smallbtn '+(st.tool==='brush'?'active':'')+'" type="button" aria-pressed="'+(st.tool==='brush'?'true':'false')+'" onclick="setEventCombatTool(\'brush\')" title="Pensel">🖌 Pensel</button>'+
    '<button id="ecToolErase" class="smallbtn '+(st.tool==='erase'?'active':'')+'" type="button" aria-pressed="'+(st.tool==='erase'?'true':'false')+'" onclick="setEventCombatTool(\'erase\')" title="Sudd">⌫ Sudd</button>'+
    '<label>Penselstorlek <select id="ecBrushSize" onchange="setEventCombatBrushSize(this.value)"><option value="0" '+((st.brushRadius||0)===0?'selected':'')+'>1 hex</option><option value="1" '+((st.brushRadius||0)===1?'selected':'')+'>3 hex</option><option value="2" '+((st.brushRadius||0)===2?'selected':'')+'>5 hex</option></select></label>'+
    '<button class="smallbtn" type="button" onclick="selectAllEventCombatHexes()">Välj alla</button>'+
    '<button class="smallbtn" type="button" onclick="clearEventCombatSelection()">Rensa markering</button>'+
    '<div class="event-combat-zoom"><button class="smallbtn" type="button" onclick="eventCombatZoomBy(1/1.25)">−</button><span id="ecZoomValue" class="event-combat-zoom-value">'+Math.round((st.zoom||1)*100)+'%</span><button class="smallbtn" type="button" onclick="eventCombatZoomBy(1.25)">+</button><button class="smallbtn" type="button" onclick="eventCombatResetZoom()">100%</button></div>'+
  '</div>'+
  '<div class="event-combat-tools event-combat-terrain-panel">'+
    '<div class="event-combat-selection-summary"><b>Markerade hexar:</b> <span id="ecSelectedCount">0</span></div>'+
    '<div class="event-combat-terrain-choice"><div class="event-combat-terrain-label">Rörelse</div><div class="event-combat-terrain-buttons">'+
      '<button class="smallbtn terrain-choice '+((st.terrainMovement||'free')==='free'?'active':'')+'" type="button" data-terrain-kind="movement" data-terrain-value="free" aria-pressed="'+((st.terrainMovement||'free')==='free'?'true':'false')+'" onclick="setEventCombatTerrainChoice(\'movement\',\'free\')">Fri</button>'+
      '<button class="smallbtn terrain-choice '+((st.terrainMovement||'free')==='difficult'?'active':'')+'" type="button" data-terrain-kind="movement" data-terrain-value="difficult" aria-pressed="'+((st.terrainMovement||'free')==='difficult'?'true':'false')+'" onclick="setEventCombatTerrainChoice(\'movement\',\'difficult\')">Svår terräng</button>'+
      '<button class="smallbtn terrain-choice '+((st.terrainMovement||'free')==='blocked'?'active':'')+'" type="button" data-terrain-kind="movement" data-terrain-value="blocked" aria-pressed="'+((st.terrainMovement||'free')==='blocked'?'true':'false')+'" onclick="setEventCombatTerrainChoice(\'movement\',\'blocked\')">Ogenomtränglig</button>'+
    '</div></div>'+
    '<div class="event-combat-terrain-choice"><div class="event-combat-terrain-label">Sikt</div><div class="event-combat-terrain-buttons">'+
      '<button class="smallbtn terrain-choice '+((st.terrainSight||'clear')==='clear'?'active':'')+'" type="button" data-terrain-kind="sight" data-terrain-value="clear" aria-pressed="'+((st.terrainSight||'clear')==='clear'?'true':'false')+'" onclick="setEventCombatTerrainChoice(\'sight\',\'clear\')">Fri sikt</button>'+
      '<button class="smallbtn terrain-choice '+((st.terrainSight||'clear')==='obscuring'?'active':'')+'" type="button" data-terrain-kind="sight" data-terrain-value="obscuring" aria-pressed="'+((st.terrainSight||'clear')==='obscuring'?'true':'false')+'" onclick="setEventCombatTerrainChoice(\'sight\',\'obscuring\')">Skymmande</button>'+
      '<button class="smallbtn terrain-choice '+((st.terrainSight||'clear')==='blocked'?'active':'')+'" type="button" data-terrain-kind="sight" data-terrain-value="blocked" aria-pressed="'+((st.terrainSight||'clear')==='blocked'?'true':'false')+'" onclick="setEventCombatTerrainChoice(\'sight\',\'blocked\')">Blockerad sikt</button>'+
    '</div></div>'+
    '<button class="smallbtn event-combat-apply-terrain" type="button" onclick="applyEventCombatTerrain()">Tillämpa</button>'+
  '</div>'+
  '<div class="event-combat-legend"><span class="legend-difficult">▧ Svår terräng</span><span class="legend-move-blocked">✕ Ogenomtränglig</span><span class="legend-obscuring">··· Skymmande sikt</span><span class="legend-sight-blocked">◼ Blockerad sikt</span></div>'+
  '<div class="event-combat-help"><b>Markera</b> växlar en enskild hex. <b>Pensel</b> målar fram en markering och <b>Sudd</b> återställer hexar till fri rörelse/fri sikt. Markera först, välj därefter rörelse och sikt och tryck <b>Tillämpa</b>. Markeringen ligger kvar efter Tillämpa tills du ändrar eller rensar den. Utan aktivt verktyg kan du panorera och zooma.</div>'+
  '<div class="adminformactions"><button class="btn" type="button" onclick="returnToCombatScenes()">← Stridsscener</button><button class="btn primary" type="button" onclick="saveEventCombatMapEditor()">Spara stridsscen</button></div>'+
 '</div>';
 renderEventCombatHexCanvas()
}
function returnToCombatScenes(){closeAdminEditor();openAdminSection('scenes')}
function eventCombatCalibrationChanged(){
 let st=eventCombatEditorState;if(!st)return;
 let h=Math.max(3,Number($('ecHeight')?.value)||45),hexM=1.5;
 st.settings.map_height_m=h;st.settings.hex_m=hexM;st.settings.rows=Math.max(2,Math.round(h/hexM));
 st.settings.hex_scale=Math.max(.5,Math.min(1.5,(Number($('ecHexScale')?.value)||100)/100));
 st.settings.offset_x=Number($('ecOffsetX')?.value)||0;st.settings.offset_y=Number($('ecOffsetY')?.value)||0;
 st.dirty=true;if($('ecRows'))$('ecRows').textContent=st.settings.rows;renderEventCombatHexCanvas()
}
async function changeEventCombatSceneLocation(id){
 let st=eventCombatEditorState;if(!st)return;
 st.locationId=id||'';
 if(st.backgroundPath){st.dirty=true;return}
 let maps=combatSceneAvailableMaps(st.locationId);
 if(st.mapId&&!maps.some(m=>m.id===st.mapId)){
  if(st.hexes.size||sceneHasCombatantPlacements()){
   let ok=await askConfirm('Byt plats','Den valda kartan hör inte till den nya platsen. Vill du byta plats och rensa terrängmarkeringar samt startpositioner?','Byt plats');
   if(!ok){renderEventCombatMapEditor();return}
   st.hexes.clear();st.selected.clear();clearAllSceneCombatantPlacements(false)
  }
  st.mapId='';st.imageUrl=''
 }
 st.dirty=true;renderEventCombatMapEditor();if(st.mapId)await loadEventCombatEditorMapImage(st.mapId)
}
async function changeEventCombatMap(id){
 let st=eventCombatEditorState;if(!st)return;
 if(!id){st.mapId='';st.imageUrl='';st.dirty=true;renderEventCombatHexCanvas();return}
 if((st.hexes.size||sceneHasCombatantPlacements())&&(id!==st.mapId||st.backgroundPath)){
  let ok=await askConfirm('Byt stridskarta','Terrängmarkeringar och startpositioner är kopplade till hexkoordinater. Vill du byta karta och rensa dem?','Byt karta');
  if(!ok){renderEventCombatMapEditor();return}
  st.hexes.clear();st.selected.clear();clearAllSceneCombatantPlacements(false)
 }
 if(st.pendingUploadPath&&st.pendingUploadPath!==st.originalBackgroundPath)await deleteCombatSceneStoredImage(st.pendingUploadPath).catch(()=>{});
 st.backgroundPath='';st.backgroundWidth=0;st.backgroundHeight=0;st.pendingUploadPath='';
 st.mapId=id;st.imageUrl='';st.dirty=true;renderEventCombatMapEditor();await loadEventCombatEditorMapImage(id)
}
function eventCombatImageMeta(){
 let st=eventCombatEditorState;if(!st)return null;
 if(st.backgroundPath&&st.backgroundWidth>0&&st.backgroundHeight>0)return{width:st.backgroundWidth,height:st.backgroundHeight,name:'Direktuppladdad stridskarta'};
 let map=campaignMaps.find(m=>m.id===st.mapId);if(!map)return null;
 return{width:Math.max(1,Number(map.width)||1600),height:Math.max(1,Number(map.height)||1000),name:map.name||'Stridskarta'}
}
function eventCombatHexGeometry(){
 let st=eventCombatEditorState,meta=eventCombatImageMeta();if(!st||!meta)return null;
 let width=meta.width,height=meta.height,rows=Math.max(2,st.settings.rows||30),scale=Math.max(.5,Math.min(1.5,Number(st.settings.hex_scale)||1));
 let rowPitch=(height/rows)*scale,size=rowPitch/1.5,xPitch=Math.sqrt(3)*size;
 return{width,height,rows,size,xPitch,rowPitch,offsetX:Number(st.settings.offset_x)||0,offsetY:Number(st.settings.offset_y)||0}
}
function eventCombatHexCells(){
 let g=eventCombatHexGeometry();if(!g)return[];
 let cells=[],rMin=Math.floor((-g.offsetY)/g.rowPitch)-3,rMax=Math.ceil((g.height-g.offsetY)/g.rowPitch)+3;
 for(let r=rMin;r<=rMax;r++){
  let qMin=Math.floor((-g.offsetX)/(g.xPitch)-r/2)-2,qMax=Math.ceil((g.width-g.offsetX)/(g.xPitch)-r/2)+2;
  for(let q=qMin;q<=qMax;q++){
   let x=g.xPitch*(q+r/2)+g.offsetX,y=g.rowPitch*r+g.offsetY;
   if(x<-g.size||x>g.width+g.size||y<-g.size||y>g.height+g.size)continue;
   cells.push({q,r,x,y,key:q+','+r})
  }
 }
 return cells
}
function eventCombatHexPolygon(x,y,size){
 let pts=[];for(let i=0;i<6;i++){let a=(Math.PI/180)*(60*i-30);pts.push((x+size*Math.cos(a)).toFixed(1)+','+(y+size*Math.sin(a)).toFixed(1))}return pts.join(' ')
}
function eventCombatTerrainTitle(h){
 let move=h?.movement_mode==='difficult'?'Svår terräng':h?.movement_mode==='blocked'?'Blockerad rörelse':'Fri rörelse';
 let sight=h?.sight_mode==='obscuring'?'Skymmande sikt':h?.sight_mode==='blocked'?'Siktblockerande':'Fri sikt';
 return move+' · '+sight
}
function renderEventCombatHexCanvas(){
 let st=eventCombatEditorState,el=$('eventCombatCanvas');if(!st||!el)return;
 let meta=eventCombatImageMeta(),g=eventCombatHexGeometry();
 if(!meta||!g){el.innerHTML='<div class="event-combat-loading">Välj en befintlig karta eller ladda upp en stridsbild.</div>';return}
 if(!st.imageUrl){el.innerHTML='<div class="event-combat-loading">Laddar kartbild…</div>';return}
 let defs='<defs>'+
 '<pattern id="ecDifficult" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="10" height="10" fill="rgba(194,137,38,.12)"/><line x1="0" y1="0" x2="0" y2="10" stroke="rgba(231,169,54,.72)" stroke-width="3"/></pattern>'+
 '<pattern id="ecMoveBlocked" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0L12 12M12 0L0 12" stroke="rgba(165,58,43,.7)" stroke-width="2"/></pattern>'+
 '<pattern id="ecObscuring" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="rgba(98,135,157,.8)"/><circle cx="8" cy="7" r="1.2" fill="rgba(98,135,157,.65)"/></pattern>'+
 '</defs>';
 let cells=eventCombatHexCells(),cellMap=new Map(cells.map(c=>[c.key,c])),svg=cells.map(c=>{
  let h=st.hexes.get(c.key)||null,pts=eventCombatHexPolygon(c.x,c.y,g.size*.97),sel=st.selected.has(c.key),overlays='';
  if(h?.movement_mode==='difficult')overlays+='<polygon class="ec-terrain-overlay" points="'+pts+'" fill="url(#ecDifficult)"/>';
  if(h?.movement_mode==='blocked')overlays+='<polygon class="ec-terrain-overlay" points="'+pts+'" fill="url(#ecMoveBlocked)"/>';
  if(h?.sight_mode==='obscuring')overlays+='<polygon class="ec-terrain-overlay" points="'+pts+'" fill="url(#ecObscuring)"/>';
  if(h?.sight_mode==='blocked')overlays+='<polygon class="ec-terrain-overlay ec-sight-blocked" points="'+pts+'"/>';
  return overlays+'<polygon class="ec-hex'+(sel?' selected':'')+'" data-hex="'+c.key+'" points="'+pts+'"><title>Hex '+c.key+' · '+eventCombatTerrainTitle(h)+'</title></polygon>'
 }).join('');
 let tokenRadius=Math.max(8,g.size*.43),tokens=(st.combatants||[]).map(c=>{
  let key=sceneCombatantPlacementKey(c),cell=cellMap.get(key);if(!key||!cell)return '';
  let active=st.placementCombatantId===c.id?' active':'',type=['player','npc','enemy','monster'].includes(c.combatant_type)?c.combatant_type:'npc';
  return '<g class="ec-combatant-token '+type+active+'" data-combatant-id="'+c.id+'" transform="translate('+cell.x.toFixed(1)+' '+cell.y.toFixed(1)+')">'+
   '<circle r="'+tokenRadius.toFixed(1)+'"></circle>'+
   '<text y="'+(tokenRadius*.12).toFixed(1)+'">'+escAttr(sceneCombatantTokenLabel(c))+'</text>'+
   '<title>'+escAttr(c.name||'Kombatant')+' · starthex '+key+'</title>'+
  '</g>'
 }).join('');
 let zoom=Math.max(.5,Math.min(4,Number(st.zoom)||1));
 el.innerHTML='<div class="event-combat-stage" style="width:'+(zoom*100)+'%;aspect-ratio:'+g.width+'/'+g.height+'"><img src="'+st.imageUrl+'" alt="'+escAttr(meta.name)+'"><svg viewBox="0 0 '+g.width+' '+g.height+'" preserveAspectRatio="none" onpointerdown="eventCombatPointerDown(event)" onpointermove="eventCombatPointerMove(event)" onpointerup="eventCombatPointerUp(event)" onpointercancel="eventCombatPointerUp(event)" onwheel="eventCombatWheel(event)">'+defs+svg+tokens+'</svg></div>';
 updateEventCombatSelectionCount();updateEventCombatZoomLabel()
}
function eventCombatHexNeighbors(q,r){return [[q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]]}
function eventCombatBrushKeys(key){
 let st=eventCombatEditorState;if(!st)return[];
 let [q,r]=String(key).split(',').map(Number),radius=Math.max(0,Math.min(2,Number(st.brushRadius)||0)),out=[];
 for(let dq=-radius;dq<=radius;dq++){
  let minDr=Math.max(-radius,-dq-radius),maxDr=Math.min(radius,-dq+radius);
  for(let dr=minDr;dr<=maxDr;dr++)out.push((q+dq)+','+(r+dr))
 }
 return out
}
function eventCombatSyncSelectionDom(keys){
 let st=eventCombatEditorState;if(!st)return;
 (keys||[]).forEach(key=>{
  let el=document.querySelector('#eventCombatCanvas .ec-hex[data-hex="'+key+'"]');
  if(el)el.classList.toggle('selected',st.selected.has(key))
 });
 updateEventCombatSelectionCount()
}
function eventCombatCurrentTerrain(){
 let st=eventCombatEditorState,movement=st?.terrainMovement||'free',sight=st?.terrainSight||'clear';
 return{movement,sight,movementCost:movement==='difficult'?2:1}
}
function setEventCombatTerrainChoice(kind,value){
 let st=eventCombatEditorState;if(!st)return;
 if(kind==='movement'){
  if(!['free','difficult','blocked'].includes(value))return;
  st.terrainMovement=value
 }else if(kind==='sight'){
  if(!['clear','obscuring','blocked'].includes(value))return;
  st.terrainSight=value
 }else return;
 document.querySelectorAll('#adminEditorBody [data-terrain-kind="'+kind+'"]').forEach(btn=>{
  let active=btn.dataset.terrainValue===value;
  btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active?'true':'false')
 })
}
function eventCombatSetTerrainForKeys(keys,movement,sight){
 let st=eventCombatEditorState;if(!st)return;
 let cost=movement==='difficult'?2:1;
 (keys||[]).forEach(key=>{
  let [q,r]=String(key).split(',').map(Number);
  if(movement==='free'&&sight==='clear')st.hexes.delete(key);
  else st.hexes.set(key,{q,r,movement_mode:movement,sight_mode:sight,movement_cost:cost,notes:''})
 });
 st.dirty=true
}
function eventCombatTerrainSignature(key){
 let h=eventCombatEditorState?.hexes?.get(key);
 return (h?.movement_mode||'free')+'|'+(h?.sight_mode||'clear')
}
function eventCombatPaintHex(key){
 let st=eventCombatEditorState;if(!st||!key||st.paintLastKey===key)return;
 st.paintLastKey=key;let keys=eventCombatBrushKeys(key);
 if(st.tool==='erase'){
  eventCombatSetTerrainForKeys(keys,'free','clear');
  keys.forEach(k=>st.selected.delete(k))
 }else{
  keys.forEach(k=>st.selected.add(k))
 }
 eventCombatSyncSelectionDom(keys)
}
function setEventCombatTool(tool){
 let st=eventCombatEditorState;if(!st)return;
 let allowed=['select','brush','erase'];
 st.tool=(allowed.includes(tool)&&st.tool!==tool)?tool:null;
 if(st.tool)st.placementCombatantId=null;
 st.paintLastKey=null;st.paintPointerId=null;st.pan=null;st.pinch=null;st.gesturePointers=new Map();
 syncEventCombatToolButtons();renderSceneCombatantsSection();renderEventCombatHexCanvas()
}
function setEventCombatBrushSize(v){if(eventCombatEditorState)eventCombatEditorState.brushRadius=Math.max(0,Math.min(2,Number(v)||0))}
function eventCombatGestureStart(e){
 let st=eventCombatEditorState,canvas=$('eventCombatCanvas');if(!st||!canvas)return;
 if(!(st.gesturePointers instanceof Map))st.gesturePointers=new Map();
 st.gesturePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 e.currentTarget.setPointerCapture?.(e.pointerId);
 if(st.gesturePointers.size===1){
  st.pan={pointerId:e.pointerId,x:e.clientX,y:e.clientY,left:canvas.scrollLeft,top:canvas.scrollTop};
  st.pinch=null;canvas.classList.add('panning')
 }else if(st.gesturePointers.size===2){
  let p=[...st.gesturePointers.values()],dx=p[1].x-p[0].x,dy=p[1].y-p[0].y;
  st.pinch={distance:Math.max(1,Math.hypot(dx,dy)),zoom:Number(st.zoom)||1};
  st.pan=null
 }
}
function eventCombatPointerDown(e){
 let st=eventCombatEditorState;if(!st||((e.button!=null)&&e.button!==0))return;
 let token=e.target?.closest?.('.ec-combatant-token');
 if(token){e.preventDefault();selectSceneCombatantForPlacement(token.dataset.combatantId);return}
 let hex=e.target?.closest?.('.ec-hex');
 if(st.placementCombatantId&&hex){e.preventDefault();placeSceneCombatantAtHex(st.placementCombatantId,hex.dataset.hex);return}
 if(!st.tool){e.preventDefault();eventCombatGestureStart(e);return}
 if(!hex)return;
 e.preventDefault();
 if(st.tool==='select'){toggleEventCombatHex(hex.dataset.hex);return}
 st.paintPointerId=e.pointerId;st.paintLastKey=null;e.currentTarget.setPointerCapture?.(e.pointerId);eventCombatPaintHex(hex.dataset.hex)
}
function eventCombatPointerMove(e){
 let st=eventCombatEditorState;if(!st)return;
 if(!st.tool){
  if(!(st.gesturePointers instanceof Map)||!st.gesturePointers.has(e.pointerId))return;
  e.preventDefault();st.gesturePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  let canvas=$('eventCombatCanvas');
  if(st.gesturePointers.size===1&&st.pan){
   canvas.scrollLeft=st.pan.left-(e.clientX-st.pan.x);canvas.scrollTop=st.pan.top-(e.clientY-st.pan.y)
  }else if(st.gesturePointers.size===2){
   let p=[...st.gesturePointers.values()],dx=p[1].x-p[0].x,dy=p[1].y-p[0].y,dist=Math.max(1,Math.hypot(dx,dy));
   if(!st.pinch)st.pinch={distance:dist,zoom:Number(st.zoom)||1};
   let cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2;
   eventCombatSetZoom(st.pinch.zoom*(dist/st.pinch.distance),cx,cy)
  }
  return
 }
 if(st.paintPointerId!==e.pointerId)return;
 e.preventDefault();let el=document.elementFromPoint(e.clientX,e.clientY),hex=el?.closest?.('.ec-hex');
 if(hex&&$('eventCombatCanvas')?.contains(hex))eventCombatPaintHex(hex.dataset.hex)
}
function eventCombatPointerUp(e){
 let st=eventCombatEditorState;if(!st)return;
 if(!st.tool&&st.gesturePointers instanceof Map&&st.gesturePointers.has(e.pointerId)){
  st.gesturePointers.delete(e.pointerId);
  let canvas=$('eventCombatCanvas');
  if(!st.gesturePointers.size){
   st.pan=null;st.pinch=null;canvas?.classList.remove('panning')
  }else if(st.gesturePointers.size===1){
   let [id,p]=[...st.gesturePointers.entries()][0];
   st.pan={pointerId:id,x:p.x,y:p.y,left:canvas?.scrollLeft||0,top:canvas?.scrollTop||0};st.pinch=null
  }
 }
 if(st.paintPointerId===e.pointerId){
  st.paintPointerId=null;st.paintLastKey=null;renderEventCombatHexCanvas()
 }
 try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch(_){}
}
function eventCombatBucketFill(startKey){
 let st=eventCombatEditorState,g=eventCombatHexGeometry();if(!st||!g||!startKey)return;
 let cells=eventCombatHexCells().filter(c=>c.x>=0&&c.x<=g.width&&c.y>=0&&c.y<=g.height),cellMap=new Map(cells.map(c=>[c.key,c]));
 let start=cellMap.get(startKey);if(!start)return;
 let sourceSig=eventCombatTerrainSignature(startKey),seen=new Set([startKey]),queue=[start],touchesEdge=false;
 for(let i=0;i<queue.length;i++){
  let c=queue[i];
  for(let [q,r] of eventCombatHexNeighbors(c.q,c.r)){
   let k=q+','+r,n=cellMap.get(k);
   if(!n){touchesEdge=true;continue}
   if(seen.has(k)||eventCombatTerrainSignature(k)!==sourceSig)continue;
   seen.add(k);queue.push(n)
  }
 }
 if(touchesEdge){alert('Färgpytsen kräver en helt sluten yta. Området du klickade i når kartkanten.');return}
 let t=eventCombatCurrentTerrain();
 eventCombatSetTerrainForKeys([...seen],t.movement,t.sight);
 renderEventCombatHexCanvas()
}
function selectAllEventCombatHexes(){
 let st=eventCombatEditorState,g=eventCombatHexGeometry();if(!st||!g)return;
 let keys=eventCombatHexCells().filter(c=>c.x>=0&&c.x<=g.width&&c.y>=0&&c.y<=g.height).map(c=>c.key);
 st.selected=new Set(keys);eventCombatSyncSelectionDom(keys)
}
function toggleEventCombatHex(key){
 let st=eventCombatEditorState;if(!st)return;
 if(st.selected.has(key))st.selected.delete(key);else st.selected.add(key);
 eventCombatSyncSelectionDom([key])
}
function clearEventCombatSelection(){
 let st=eventCombatEditorState;if(!st)return;let keys=[...st.selected];st.selected.clear();eventCombatSyncSelectionDom(keys)
}
function updateEventCombatSelectionCount(){let el=$('ecSelectedCount');if(el)el.textContent=String(eventCombatEditorState?.selected?.size||0)}
function eventCombatSetZoom(next,clientX,clientY){
 let st=eventCombatEditorState,c=$('eventCombatCanvas'),stage=c?.querySelector('.event-combat-stage');if(!st||!c||!stage)return;
 let old=Math.max(.5,Math.min(4,Number(st.zoom)||1)),zoom=Math.max(.5,Math.min(4,Number(next)||1));
 let rect=c.getBoundingClientRect(),ax=clientX==null?c.clientWidth/2:clientX-rect.left,ay=clientY==null?c.clientHeight/2:clientY-rect.top;
 let logicalX=(c.scrollLeft+ax)/old,logicalY=(c.scrollTop+ay)/old;
 st.zoom=zoom;stage.style.width=(zoom*100)+'%';updateEventCombatZoomLabel();
 requestAnimationFrame(()=>{c.scrollLeft=Math.max(0,logicalX*zoom-ax);c.scrollTop=Math.max(0,logicalY*zoom-ay)})
}
function eventCombatZoomBy(factor,clientX,clientY){let st=eventCombatEditorState;if(st)eventCombatSetZoom((Number(st.zoom)||1)*factor,clientX,clientY)}
function eventCombatResetZoom(){let st=eventCombatEditorState;if(!st)return;eventCombatSetZoom(1);let c=$('eventCombatCanvas');if(c){c.scrollLeft=0;c.scrollTop=0}}
function updateEventCombatZoomLabel(){let el=$('ecZoomValue');if(el)el.textContent=Math.round((eventCombatEditorState?.zoom||1)*100)+'%'}
function eventCombatWheel(e){e.preventDefault();eventCombatZoomBy(e.deltaY<0?1.12:1/1.12,e.clientX,e.clientY)}
function applyEventCombatTerrain(){
 let st=eventCombatEditorState;if(!st||!st.selected.size){alert('Markera minst en hex först.');return}
 let t=eventCombatCurrentTerrain(),movement=t.movement,sight=t.sight;
 for(let key of st.selected){
  let [q,r]=key.split(',').map(Number);
  if(movement==='free'&&sight==='clear')st.hexes.delete(key);
  else st.hexes.set(key,{q,r,movement_mode:movement,sight_mode:sight,movement_cost:movement==='difficult'?2:1,notes:''})
 }
 st.dirty=true;renderEventCombatHexCanvas()
}
async function saveEventCombatMapEditor(){
 let st=eventCombatEditorState;if(!st)return;
 let name=String($('ecSceneName')?.value||st.sceneName||'').trim();
 if(!name){alert('Namn på stridsscenen måste anges.');return}
 if(!st.mapId&&!st.backgroundPath){alert('Välj en befintlig karta eller ladda upp en stridsbild.');return}
 try{
  let settings={hex_m:1.5,map_height_m:st.settings.map_height_m,rows:st.settings.rows,hex_scale:st.settings.hex_scale||1,offset_x:st.settings.offset_x,offset_y:st.settings.offset_y,terrain_visibility:'clear'};
  let body={
   campaign_id:centralCampaignId,source_event_id:st.sourceEventId||null,location_id:st.locationId||null,map_id:st.backgroundPath?null:(st.mapId||null),name:name,hex_orientation:'pointy',settings,
   background_image_path:st.backgroundPath||null,background_width:st.backgroundPath?st.backgroundWidth:null,background_height:st.backgroundPath?st.backgroundHeight:null
  };
  let sceneId=st.sceneId;
  if(st.isNew)await dbJson('campaign_combat_scenes',{method:'POST',body:JSON.stringify({...body,id:sceneId})});
  else await dbJson('campaign_combat_scenes?id=eq.'+encodeURIComponent(sceneId),{method:'PATCH',body:JSON.stringify(body)});
  await dbJson('campaign_combat_scene_hexes?scene_id=eq.'+encodeURIComponent(sceneId),{method:'DELETE',headers:{'Prefer':'return=minimal'}});
  let hexRows=[...st.hexes.values()].filter(h=>h.movement_mode!=='free'||h.sight_mode!=='clear').map(h=>({scene_id:sceneId,q:h.q,r:h.r,movement_mode:h.movement_mode||'free',sight_mode:h.sight_mode||'clear',movement_cost:Number(h.movement_cost)||1,notes:h.notes||''}));
  if(hexRows.length)await dbJson('campaign_combat_scene_hexes',{method:'POST',body:JSON.stringify(hexRows)});
  let deleteWrites=[...(st.deletedCombatantIds||[])].map(id=>dbJson('campaign_combat_scene_combatants?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=minimal'}}));
  if(deleteWrites.length)await Promise.all(deleteWrites);
  let writes=[];
  (st.combatants||[]).forEach((c,i)=>{
   let row={scene_id:sceneId,campaign_id:centralCampaignId,source_type:c.source_type||'custom',source_id:c.source_id||null,combatant_type:c.combatant_type||'npc',instance_no:Math.max(1,Number(c.instance_no)||1),name:c.name||'Kombatant',visible_to_players:c.visible_to_players!==false,sort_order:i,start_q:c.start_q==null?null:Number(c.start_q),start_r:c.start_r==null?null:Number(c.start_r),state:c.state&&typeof c.state==='object'?c.state:{}};
   if(c.isNew)writes.push(dbJson('campaign_combat_scene_combatants',{method:'POST',body:JSON.stringify(row)}));
   else writes.push(dbJson('campaign_combat_scene_combatants?id=eq.'+encodeURIComponent(c.id),{method:'PATCH',body:JSON.stringify({...row,updated_at:new Date().toISOString()})}))
  });
  if(writes.length)await Promise.all(writes);
  let oldBackground=st.originalBackgroundPath,newBackground=st.backgroundPath||'';
  st.pendingUploadPath='';st.originalBackgroundPath=newBackground;
  if(oldBackground&&oldBackground!==newBackground)await deleteCombatSceneStoredImage(oldBackground).catch(e=>console.warn('Kunde inte rensa ersatt stridsbild',e));
  showBackupToast('✓ Stridsscenen sparad');eventCombatEditorState=null;closeAdminEditor();await refreshAdminCombatScenes()
 }catch(e){console.error('Kunde inte spara stridsscenen',e);alert('Kunde inte spara stridsscenen: '+e.message)}
}
