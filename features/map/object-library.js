/* ARCANE OBJECT LIBRARY V1.0. Map coordinates remain intrinsic image pixels. */
(() => {
 const root=window,SVG='http://www.w3.org/2000/svg';
 const state={mapId:null,definitions:[],placements:[],assets:new Map(),active:null,drag:null,calibrating:false,calibrationPoints:[],dirty:new Set(),definitionDirty:new Set()};
 let display;
 const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uuid=()=>crypto.randomUUID();
 const manager=()=>typeof canManageCampaignMaps==='function'&&canManageCampaignMaps();
 const visibleMap=()=>{
  if(!$('arcaneObjectLibraryModal')?.classList.contains('hidden'))return campaignMaps.find(m=>m.id===state.mapId)||null;
  return typeof activeCampaignMap!=='undefined'?activeCampaignMap:null;
 };
 const intrinsic=()=>({w:Number(visibleMap()?.width)||1600,h:Number(visibleMap()?.height)||1000});
 function assetUrl(path){
  if(typeof path!=='string'||typeof SUPABASE_URL!=='string'||!SUPABASE_URL)return '';
  if(!/^hermes\/system-asset\/[a-z0-9][a-z0-9_.-]*\/[a-f0-9]{64}\.webp$/.test(path))return '';
  return SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/public/alea-hermes-public/'+path.split('/').map(encodeURIComponent).join('/');
 }
 async function loadAssetUrls(defs){
  const keys=[...new Set(defs.map(x=>x.image_asset_key).filter(Boolean))];
  if(!keys.length)return;
  try{const rows=await dbJson('arcane_system_assets?select=asset_key,asset_path&asset_key=in.('+keys.map(encodeURIComponent).join(',')+')');
   for(const row of rows||[]){const url=assetUrl(row.asset_path);if(url)state.assets.set(row.asset_key,url)}
  }catch(err){console.warn('Objektbilder från HERMES kunde inte läsas',err)}
 }
 async function readDefinitions(){
  const rows=await dbJson('arcane_object_definitions?select=id,object_key,name,object_type,image_asset_key,width_m,depth_m,height_m,default_rotation,revision,active,movement_blocking,light_blocking,shadow_casting,footprint,image_crop&active=eq.true&order=name.asc');
  const definitions=Array.isArray(rows)?rows:[];
  await loadAssetUrls(definitions);
  return definitions;
 }
 async function readPlacements(mapId){
  const rows=await dbJson('campaign_map_objects?select=id,campaign_id,map_id,object_definition_id,x,y,rotation,movement_blocking,light_blocking,shadow_casting&map_id=eq.'+encodeURIComponent(mapId)+'&order=created_at.asc');
  return Array.isArray(rows)?rows:[];
 }
 async function loadPlacements(mapId){
  state.placements=await readPlacements(mapId);
 }
 function selectedDefinition(id){return state.definitions.find(x=>x.id===id)||null}
 function objectSize(def){const size=root.aleaMapObjectGeometry?.pixelSize(def,Number(visibleMap()?.pixels_per_meter)||0);return size?{w:size.width,h:size.depth}:{w:0,h:0}}
 function appendObjectArt(parent,def,url,x,y,w,h,rotation=0){
  const crop=def.image_crop||{x:0,y:0,width:1254,height:1254},group=document.createElementNS(SVG,'g');
  group.setAttribute('transform','translate('+x+' '+y+') rotate('+rotation+')');group.setAttribute('pointer-events','none');
  const art=document.createElementNS(SVG,'svg');art.setAttribute('x',String(-w/2));art.setAttribute('y',String(-h/2));art.setAttribute('width',String(w));art.setAttribute('height',String(h));art.setAttribute('viewBox',[crop.x,crop.y,crop.width,crop.height].join(' '));art.setAttribute('preserveAspectRatio','none');
  const image=document.createElementNS(SVG,'image');image.setAttribute('href',url);image.setAttribute('x','0');image.setAttribute('y','0');image.setAttribute('width','1254');image.setAttribute('height','1254');image.setAttribute('preserveAspectRatio','none');art.append(image);group.append(art);parent.append(group);
 }
 function renderDisplay(){
  const svg=$('mapOverlay');if(!svg)return;
  svg.querySelector('.arcane-map-objects')?.remove();
  const map=activeCampaignMap, viewer=activeUser()?.id, canManage=manager();
  if(!map||display?.mapId!==map.id||display.viewer!==viewer||display.canManage!==canManage||!display.placements?.length)return;
  const group=document.createElementNS(SVG,'g');group.setAttribute('class','arcane-map-objects');group.setAttribute('aria-label','Kartobjekt');
  if(!canManage){
   // Kartakademin draws fog on a separate canvas. Clip SVG art at room boundaries.
   const mask=document.createElementNS(SVG,'mask');
   mask.id='arcaneMapObjectDiscovery';
   mask.setAttribute('maskUnits','userSpaceOnUse');
   mask.setAttribute('x','0');mask.setAttribute('y','0');
   mask.setAttribute('width',map.width);mask.setAttribute('height',map.height);
   const explored=campaignMapAreas.filter(area=>area.status==='explored');
   const concealed=campaignMapAreas.filter(area=>area.status!=='explored');
   mask.innerHTML=explored.map(area=>mapShapeTag(area,'fill="white"')).join('')+
     concealed.map(area=>mapShapeTag(area,'fill="black"')).join('');
   group.append(mask);
   group.setAttribute('mask','url(#arcaneMapObjectDiscovery)');
  }
  const defs=new Map(display.definitions.map(d=>[d.id,d]));
  for(const p of display.placements){
   const definition=defs.get(p.object_definition_id),url=definition&&state.assets.get(definition.image_asset_key);
   if(!definition||!url)continue;
   const size=root.aleaMapObjectGeometry?.pixelSize(definition,Number(map.pixels_per_meter));
   if(size)appendObjectArt(group,definition,url,Number(p.x),Number(p.y),size.width,size.depth,Number(p.rotation)||0);
  }
  // Draw above the map shading and below the room hit targets.
  const fog=svg.querySelector('.map-fog');
  if(fog)fog.after(group);else svg.prepend(group);
 }
 async function syncDisplay(mapId,force=false){
  if(!mapId){display=null;return}
  if(activeCampaignMap?.id!==mapId||!(Number(activeCampaignMap.pixels_per_meter)>0))return;
  const viewer=activeUser()?.id, canManage=manager();
  if(display?.mapId!==mapId||display.viewer!==viewer||display.canManage!==canManage)display={mapId,viewer,canManage};
  const current=display;
  if(!force&&(current.loading||current.placements))return;
  const loading=current.loading=Promise.all([
   !force&&current.definitions ? current.definitions : readDefinitions(),
   readPlacements(mapId),
  ]);
  try{
   const [definitions,placements]=await loading;
   if(display!==current||current.loading!==loading)return;
   Object.assign(current,{definitions,placements});
   renderDisplay();
  }catch(error){
   if(display===current&&current.loading===loading)console.warn('Kartobjekten kunde inte läsas',error);
  }finally{
   if(current.loading===loading)current.loading=null;
  }
 }
 function calibrationText(map){return Number(map?.pixels_per_meter)>0?`${Number(map.pixels_per_meter).toFixed(1)} px/m`:'Skala saknas'}
 function editorCanvasHtml(map){
  const {w,h}=intrinsic(),image=map.image_url||map.imageUrl||'';
  const imageDef=`<image href="${esc(image)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  const defs=state.definitions.map(d=>`<button type="button" draggable="true" class="arcane-object-card ${state.active?.definitionId===d.id?'selected':''}" data-object-def="${esc(d.id)}" aria-pressed="${state.active?.definitionId===d.id}"><img src="${esc(state.assets.get(d.image_asset_key)||'')}" alt=""><span><b>${esc(d.name)}</b><small>${Number(d.width_m).toFixed(2)} × ${Number(d.depth_m).toFixed(2)} m</small></span><span class="arcane-object-add">＋</span></button>`).join('');
  const editable=!!activeUser()?.admin;
  const dimensionEditor=editable?`<details><summary>Objektmått</summary><div class="arcane-object-dimensions">${state.definitions.map(d=>`<fieldset><legend>${esc(d.name)}</legend><label>Bredd (m)<input type="number" min="0.05" step="0.05" value="${Number(d.width_m)}" data-dim="${d.id}" data-field="width_m"></label><label>Djup (m)<input type="number" min="0.05" step="0.05" value="${Number(d.depth_m)}" data-dim="${d.id}" data-field="depth_m"></label><label>Höjd (m)<input type="number" min="0.05" step="0.05" value="${Number(d.height_m)}" data-dim="${d.id}" data-field="height_m"></label><label class="arcane-object-check"><input type="checkbox" data-prop="${d.id}" data-field="movement_blocking" ${d.movement_blocking?'checked':''}> Blockerar rörelse</label><label class="arcane-object-check"><input type="checkbox" data-prop="${d.id}" data-field="light_blocking" ${d.light_blocking?'checked':''}> Blockerar ljus</label><label class="arcane-object-check"><input type="checkbox" data-prop="${d.id}" data-field="shadow_casting" ${d.shadow_casting?'checked':''}> Kastarskugga</label></fieldset>`).join('')}</div></details>`:'';
  const selected=state.placements.find(p=>p.id===state.active?.placementId);
  const flags=['movement_blocking','light_blocking','shadow_casting'].map((field,i)=>`<label class="arcane-object-instance-flag"><input type="checkbox" data-placement-prop="${field}" ${selected?.[field]?'checked':''} ${selected?'':'disabled'}>${['Blockerar rörelse','Blockerar ljus','Kastarskugga'][i]}</label>`).join('');
  return `<div class="arcane-object-editor-grid"><aside class="arcane-object-sidebar"><h3>Objektbibliotek</h3><p>Dra ett objekt till kartan eller tryck på det och sedan på kartan.</p><div class="arcane-object-catalog">${defs}</div>${dimensionEditor}</aside><main class="arcane-object-work"><div class="arcane-object-toolbar"><span id="arcaneObjectScale">${esc(calibrationText(map))}</span><button type="button" class="smallbtn" id="arcaneObjectCalibrate">Kalibrera skala</button><button type="button" class="smallbtn" id="arcaneObjectDuplicate" ${state.active?.placementId?'':'disabled'}>Duplicera</button><label>Rotation° <input id="arcaneObjectRotation" type="number" step="1" value="${Number(state.active?.rotation)||0}" ${state.active?.placementId?'':'disabled'}></label><button type="button" class="deletebtn" id="arcaneObjectDelete" ${state.active?.placementId?'':'disabled'}>Radera</button><button type="button" class="smallbtn" id="arcaneObjectSave">Spara karta</button>${flags}</div><p id="arcaneObjectNotice" class="arcane-object-notice" role="status">${Number(map.pixels_per_meter)>0?'':'Kalibrera kartan innan du placerar objekt.'}</p><div class="arcane-object-board-wrap"><svg id="arcaneObjectBoard" class="arcane-object-board" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-label="Karta för objektplacering">${imageDef}${placementSvg()}</svg></div></main></div>`
 }
 function placementSvg(){return state.placements.map(p=>{const d=selectedDefinition(p.object_definition_id),url=d&&state.assets.get(d.image_asset_key);if(!d||!url)return '';const size=objectSize(d),crop=d.image_crop||{x:0,y:0,width:1254,height:1254};return `<g class="arcane-object-placement ${state.active?.placementId===p.id?'selected':''}" data-placement="${p.id}" transform="translate(${Number(p.x)} ${Number(p.y)}) rotate(${Number(p.rotation)||0})"><svg x="${-size.w/2}" y="${-size.h/2}" width="${size.w}" height="${size.h}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" preserveAspectRatio="none"><image href="${esc(url)}" x="0" y="0" width="1254" height="1254" preserveAspectRatio="none"/></svg><rect x="${-size.w/2}" y="${-size.h/2}" width="${size.w}" height="${size.h}"/></g>`}).join('')}
 function rerenderBoard(){const board=$('arcaneObjectBoard');if(!board)return;board.querySelectorAll('.arcane-object-placement').forEach(n=>n.remove());board.insertAdjacentHTML('beforeend',placementSvg());const map=campaignMaps.find(m=>m.id===state.mapId),selected=state.placements.find(p=>p.id===state.active?.placementId);$('arcaneObjectScale').textContent=calibrationText(map);$('arcaneObjectRotation').value=Number(state.active?.rotation)||0;$('arcaneObjectDuplicate').disabled=!selected;$('arcaneObjectDelete').disabled=!selected;document.querySelectorAll('[data-placement-prop]').forEach(el=>{el.disabled=!selected;el.checked=!!selected?.[el.dataset.placementProp]})}
 function pointerPosition(e){const board=$('arcaneObjectBoard'),r=board.getBoundingClientRect(),{w,h}=intrinsic();return {x:Math.max(0,Math.min(w,(e.clientX-r.left)/r.width*w)),y:Math.max(0,Math.min(h,(e.clientY-r.top)/r.height*h))}}
 function notice(text){const el=$('arcaneObjectNotice');if(el)el.textContent=text}
 function beginPointer(e){
  if(e.button!=null&&e.button!==0)return;const g=e.target.closest('[data-placement]');if(g){state.active={placementId:g.dataset.placement,definitionId:state.placements.find(p=>p.id===g.dataset.placement)?.object_definition_id};const p=state.placements.find(x=>x.id===state.active.placementId);state.active.rotation=p?.rotation||0;state.drag={id:p?.id};try{$('arcaneObjectBoard').setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();rerenderBoard();return}
  if(state.calibrating){state.calibrationPoints.push(pointerPosition(e));notice(state.calibrationPoints.length===1?'Välj punkt två.':'Ange verkligt avståndet i meter.');return}
  if(!state.active?.definitionId||!(Number(visibleMap()?.pixels_per_meter)>0)){notice('Välj ett objekt och kalibrera kartan först.');return}
  const p=pointerPosition(e),d=selectedDefinition(state.active.definitionId),id=uuid();state.placements.push({id,campaign_id:centralCampaignId,map_id:state.mapId,object_definition_id:d.id,x:p.x,y:p.y,rotation:Number(d.default_rotation)||0,movement_blocking:!!d.movement_blocking,light_blocking:!!d.light_blocking,shadow_casting:!!d.shadow_casting,_new:true});state.active.placementId=id;state.active.rotation=Number(d.default_rotation)||0;state.drag={id};try{$('arcaneObjectBoard').setPointerCapture(e.pointerId)}catch(_){}rerenderBoard();e.preventDefault();
 }
 function movePointer(e){if(!state.drag)return;const p=pointerPosition(e),item=state.placements.find(x=>x.id===state.drag.id);if(!item)return;item.x=p.x;item.y=p.y;state.dirty.add(item.id);rerenderBoard()}
 function endPointer(){state.drag=null}
 async function calibrate(){if(!state.mapId)return;state.calibrating=true;state.calibrationPoints=[];notice('Tryck på två kända punkter på kartan.');$('arcaneObjectBoard')?.classList.add('calibrating')}
 async function confirmCalibration(){const [a,b]=state.calibrationPoints;if(!a||!b)return;const meters=Number(prompt('Verkligt avstånd mellan punkterna i meter'));const ppm=root.aleaMapObjectGeometry?.calibrate(a,b,meters);if(!(ppm>0)){notice('Ange ett avstånd större än 0 meter.');state.calibrationPoints=[];return}try{await dbJson('campaign_maps?id=eq.'+encodeURIComponent(state.mapId),{method:'PATCH',body:JSON.stringify({pixels_per_meter:ppm,scale_point_a:a,scale_point_b:b,scale_distance_m:meters})});const map=campaignMaps.find(x=>x.id===state.mapId);Object.assign(map,{pixels_per_meter:ppm,scale_point_a:a,scale_point_b:b,scale_distance_m:meters});$('arcaneObjectBoard')?.classList.remove('calibrating');state.calibrating=false;state.calibrationPoints=[];notice('Skala sparad: '+ppm.toFixed(1)+' px/m.');rerenderBoard()}catch(err){notice('Kunde inte spara skalan: '+err.message)}}
 async function save(){
  try{if(activeUser()?.admin)for(const d of state.definitions){if(!state.definitionDirty.has(d.id))continue;const patch={};document.querySelectorAll('[data-dim="'+d.id+'"]').forEach(i=>patch[i.dataset.field]=Number(i.value));document.querySelectorAll('[data-prop="'+d.id+'"]').forEach(i=>patch[i.dataset.field]=i.checked);if(Object.keys(patch).length){await dbJson('arcane_object_definitions?id=eq.'+encodeURIComponent(d.id),{method:'PATCH',body:JSON.stringify({...patch,revision:Number(d.revision||1)+1})});Object.assign(d,patch);d.revision=Number(d.revision||1)+1}}
   for(const p of state.placements){const body={x:p.x,y:p.y,rotation:Number(p.rotation)||0,movement_blocking:!!p.movement_blocking,light_blocking:!!p.light_blocking,shadow_casting:!!p.shadow_casting};if(p._new){await dbJson('campaign_map_objects',{method:'POST',body:JSON.stringify({...body,campaign_id:centralCampaignId,map_id:state.mapId,object_definition_id:p.object_definition_id,created_by:supabaseSession?.user?.id})});delete p._new}else if(state.dirty.has(p.id))await dbJson('campaign_map_objects?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',body:JSON.stringify(body)})}
   state.dirty.clear();state.definitionDirty.clear();notice('Alla objekt och objektmått är sparade.');await loadPlacements(state.mapId);rerenderBoard();renderDisplay();
  }catch(err){notice('Sparningen misslyckades: '+err.message)}
 }
 async function duplicate(){const p=state.placements.find(x=>x.id===state.active?.placementId);if(!p)return;const copy={...p,id:uuid(),x:Number(p.x)+20,y:Number(p.y)+20,_new:true};state.placements.push(copy);state.active={placementId:copy.id,definitionId:copy.object_definition_id,rotation:copy.rotation};state.dirty.add(copy.id);rerenderBoard()}
 async function remove(){const p=state.placements.find(x=>x.id===state.active?.placementId);if(!p)return;if(p._new)state.placements=state.placements.filter(x=>x.id!==p.id);else{try{await dbJson('campaign_map_objects?id=eq.'+encodeURIComponent(p.id),{method:'DELETE',headers:{'Prefer':'return=minimal'}});state.placements=state.placements.filter(x=>x.id!==p.id)}catch(err){notice('Kunde inte radera objektet: '+err.message);return}}state.active=null;rerenderBoard();renderDisplay()}
 function bindEditor(){
  $('arcaneObjectBoard')?.addEventListener('pointerdown',beginPointer);$('arcaneObjectBoard')?.addEventListener('pointermove',movePointer);$('arcaneObjectBoard')?.addEventListener('pointerup',endPointer);$('arcaneObjectBoard')?.addEventListener('pointercancel',endPointer);
  document.querySelectorAll('[data-object-def]').forEach(b=>{b.addEventListener('click',()=>{state.active={definitionId:b.dataset.objectDef};rerenderBoard();document.querySelectorAll('[data-object-def]').forEach(x=>x.classList.toggle('selected',x===b))});b.addEventListener('dragstart',e=>{state.active={definitionId:b.dataset.objectDef};e.dataTransfer.setData('text/plain',b.dataset.objectDef)})});
  const board=$('arcaneObjectBoard');board?.addEventListener('dragover',e=>e.preventDefault());board?.addEventListener('drop',e=>{e.preventDefault();state.active={definitionId:e.dataTransfer.getData('text/plain')};beginPointer(e)});
  $('arcaneObjectCalibrate')?.addEventListener('click',calibrate);$('arcaneObjectSave')?.addEventListener('click',save);$('arcaneObjectDuplicate')?.addEventListener('click',duplicate);$('arcaneObjectDelete')?.addEventListener('click',remove);
  $('arcaneObjectRotation')?.addEventListener('input',e=>{const p=state.placements.find(x=>x.id===state.active?.placementId);if(p){p.rotation=Number(e.target.value)||0;state.active.rotation=p.rotation;state.dirty.add(p.id);rerenderBoard()}});
  document.querySelectorAll('[data-dim],[data-prop]').forEach(el=>el.addEventListener('change',()=>{const d=state.definitions.find(x=>x.id===(el.dataset.dim||el.dataset.prop));if(d&&el.dataset.dim)d[el.dataset.field]=Number(el.value);if(d&&el.dataset.prop)d[el.dataset.field]=el.checked;if(d)state.definitionDirty.add(d.id);rerenderBoard()}));
  document.querySelectorAll('[data-placement-prop]').forEach(el=>el.addEventListener('change',()=>{const p=state.placements.find(x=>x.id===state.active?.placementId);if(p){p[el.dataset.placementProp]=el.checked;state.dirty.add(p.id)}}));
  board?.addEventListener('pointerup',()=>{if(state.calibrationPoints.length===2)void confirmCalibration()});
 }
 async function open(mapId){
  if(!manager()){alert('Objektredigering är endast tillgänglig för spelledare.');return}
  const original=campaignMaps.find(x=>x.id===mapId);if(!original)return;
  try{
   const [imageUrl,definitions,placements]=await Promise.all([getMapImageUrl(original),readDefinitions(),readPlacements(mapId)]);
   Object.assign(state,{mapId,definitions,placements,active:null,drag:null,calibrating:false,calibrationPoints:[]});
   state.dirty.clear();state.definitionDirty.clear();
   const map={...original,image_url:imageUrl};
   const modal=$('arcaneObjectLibraryModal');
   modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
   modal.innerHTML=`<div class="modal arcane-object-modal" role="dialog" aria-modal="true" aria-labelledby="arcaneObjectTitle"><div class="modalhead"><h2 id="arcaneObjectTitle">Objekt · ${esc(map.name)}</h2><button class="modalclose" id="arcaneObjectClose" aria-label="Stäng">×</button></div>${editorCanvasHtml(map)}</div>`;
   bindEditor();$('arcaneObjectClose').onclick=close;
  }catch(error){alert('Kunde inte öppna objektbiblioteket: '+error.message)}
 }
 function close(){const m=$('arcaneObjectLibraryModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');m.innerHTML=''}state.active=null;if(typeof activeCampaignMap!=='undefined'&&activeCampaignMap?.id)void syncDisplay(activeCampaignMap.id,true)}
 root.openArcaneObjectLibrary=open;root.closeArcaneObjectLibrary=close;root.renderArcaneMapObjects=renderDisplay;root.syncArcaneMapObjects=syncDisplay;
 root.getArcaneMapObjectRuntimeData=id=>{const p=state.placements.find(x=>x.id===id),d=p&&selectedDefinition(p.object_definition_id);if(!p||!d)return null;return {id:p.id,definitionId:d.id,position:{x:Number(p.x),y:Number(p.y)},width_m:Number(d.width_m),depth_m:Number(d.depth_m),height_m:Number(d.height_m),rotation_degrees:Number(p.rotation)||0,footprint:root.aleaMapObjectGeometry?.footprint(d.width_m,d.depth_m,p.rotation)||[],movement_blocking:!!p.movement_blocking,light_blocking:!!p.light_blocking,shadow_casting:!!p.shadow_casting}}
 document.addEventListener('click',e=>{if(e.target?.id==='arcaneObjectLibraryModal')close()});
})();
