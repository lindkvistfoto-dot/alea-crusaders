/* Legolas Greenleaf v0.34.84 — materialpanel, SL-urval och privat bildvisare. */
export const LEGOLAS_PAGE_SIZE=24;
export const LEGOLAS_BUCKETS=new Set([
 'campaign-materials','campaign-actor-images','campaign-location-assets',
 'campaign-maps','combat-scene-maps','combat-icons'
]);
export function legolasEscape(value){
 return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}
export function legolasQuery(campaign,{page=0,category='all',search=''}={}){
 if(!/^[a-f0-9-]{36}$/i.test(String(campaign||'')))throw Error('Ogiltig kampanj.');
 const params=[
  'campaign_id=eq.'+encodeURIComponent(campaign),
  'archived_at=is.null',
  'select=id,campaign_id,title,description,category,asset_kind,storage_bucket,storage_path,thumbnail_path,mime_type,created_at',
  'order=created_at.desc',
  'limit='+(LEGOLAS_PAGE_SIZE+1),
  'offset='+(Math.max(0,Math.floor(Number(page)||0))*LEGOLAS_PAGE_SIZE)
 ];
 if(category!=='all'&&['location','npc','monster','item','map','document','other'].includes(category))
  params.push('category=eq.'+category);
 const term=String(search||'').slice(0,80).replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
 if(term)params.push('or='+encodeURIComponent('(title.ilike.*'+term+'*,description.ilike.*'+term+'*)'));
 return 'campaign_materials?'+params.join('&');
}
export function legolasClampScale(scale){return Math.max(1,Math.min(6,Number.isFinite(scale)?scale:1));}
export function legolasPanLimit(viewport,fitSize,scale){
 return Math.max(0,(Math.max(0,Number(fitSize)||0)*legolasClampScale(scale)-Math.max(0,Number(viewport)||0))/2);
}
export function createLegolas({
 doc=()=>document,
 win=()=>window,
 getCampaign,
 isLoggedIn,
 isGM,
 query,
 read,
 onError=()=>{}
}){
 const state={
  campaign:'',rows:[],page:0,hasNext:false,category:'all',search:'',
  selection:new Map(),previewRows:[],index:0,loadSeq:0,thumbSeq:0,viewerSeq:0,
  thumbUrls:new Map(),url:null,panelOpen:false,viewerOpen:false,scale:1,tx:0,ty:0,
  pointers:new Map(),pinchDistance:0,pinchScale:1,dragX:0,dragY:0,
  loading:false,searchTimer:null,lastFocus:null,viewerLastFocus:null,
  mounted:false
 };
 const el=id=>doc().getElementById(id);
 const safe=legolasEscape;
 const campaign=()=>String(getCampaign()||'');
 const authorized=()=>Boolean(isLoggedIn()&&campaign());
 const pageValid=(seq,scope)=>state.panelOpen&&seq===state.loadSeq&&scope===campaign()&&authorized();
 const buckets=LEGOLAS_BUCKETS;
 const categories={
  all:'Alla kategorier',location:'Plats',npc:'SLP',monster:'Monster',item:'Föremål',
  map:'Karta',document:'Dokument',other:'Övrigt'
 };
 function notice(message,error=false){
  const node=el('legolasNotice');if(node){node.textContent=message;node.classList.toggle('is-error',error);}
  if(error)onError(message);
 }
 function releaseThumbs(){
  state.thumbSeq++;
  for(const url of state.thumbUrls.values())win().URL.revokeObjectURL(url);
  state.thumbUrls.clear();
 }
 function releaseViewer(){
  state.viewerSeq++;
  state.pointers.clear();state.pinchDistance=0;
  if(state.url){win().URL.revokeObjectURL(state.url);state.url=null;}
 }
 function clearSelection(){
  state.selection.clear();updateQueue();
 }
 function cleanCampaign(){
  if(state.campaign===campaign())return;
  state.campaign=campaign();state.page=0;state.rows=[];releaseThumbs();releaseViewer();
  clearSelection();
 }
 function mount(){
  if(state.mounted||!doc().body)return;
  state.mounted=true;
  const nav=doc().createElement('button');
  nav.id='materialNavBtn';nav.type='button';nav.className='btn legolas-nav';
  nav.title='Materialpanel';nav.setAttribute('aria-label','Öppna materialpanelen');
  nav.textContent='▧ Material';nav.addEventListener('click',()=>openPanel());
  const target=el('mapNavBtn')||doc().querySelector('header .barspacer');
  if(target)target.insertAdjacentElement('beforebegin',nav);
  const panel=doc().createElement('section');panel.id='legolasPanel';panel.className='legolas-panel hidden';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','legolasTitle');
  panel.innerHTML='<div class="legolas-panel-inner">'+
   '<header class="legolas-heading"><div><h2 id="legolasTitle">🏹 Legolas · Material</h2><p id="legolasSubhead">Kampanjens bilder och dokument</p></div>'+
   '<button type="button" class="legolas-close" id="legolasClosePanel" aria-label="Stäng materialpanelen">✕</button></header>'+
   '<div id="legolasGmQueue" class="legolas-queue hidden"><div class="legolas-queue-top"><strong>SL:s urval inför visning</strong><span id="legolasQueueCount">0 bilder</span></div>'+
    '<p>Detta är en privat förhandsvisning. Inget delas med spelarna förrän du väljer Visa nu i en senare etapp.</p>'+
    '<div id="legolasQueueItems" class="legolas-queue-items"></div>'+
    '<div class="legolas-queue-actions"><button type="button" id="legolasPreviewQueue">Förhandsvisa urval</button><button type="button" id="legolasClearQueue">Rensa urval</button></div></div>'+
   '<div class="legolas-filters"><label>Sök<input id="legolasSearch" type="search" maxlength="80" placeholder="Bild, plats, person…" autocomplete="off"></label>'+
    '<label>Kategori<select id="legolasCategory">'+Object.entries(categories).map(([k,v])=>'<option value="'+k+'">'+safe(v)+'</option>').join('')+'</select></label>'+
    '<button type="button" id="legolasRefresh">↻ Uppdatera</button></div>'+
   '<p id="legolasNotice" class="legolas-notice" role="status" aria-live="polite"></p>'+
   '<div id="legolasGrid" class="legolas-grid" aria-label="Tillgängliga material"></div>'+
   '<nav class="legolas-pagination"><button type="button" id="legolasPrevious">← Föregående</button><span id="legolasPageNumber">Sida 1</span><button type="button" id="legolasNext">Nästa →</button></nav>'+
   '</div>';
  const viewer=doc().createElement('section');viewer.id='legolasViewer';viewer.className='legolas-viewer hidden';
  viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-labelledby','legolasViewerTitle');
  viewer.innerHTML='<header class="legolas-viewer-header">'+
   '<div class="legolas-viewer-heading"><strong id="legolasViewerTitle">Material</strong><span id="legolasViewerCount"></span></div>'+
   '<div class="legolas-viewer-actions">'+
    '<button type="button" id="legolasZoomOut" title="Zooma ut" aria-label="Zooma ut">−</button>'+
    '<button type="button" id="legolasZoomReset" title="Anpassa till skärm">1:1</button>'+
    '<button type="button" id="legolasZoomIn" title="Zooma in" aria-label="Zooma in">+</button>'+
    '<button type="button" id="legolasFullscreen" title="Helskärm" aria-label="Helskärm">⛶</button>'+
    '<button type="button" id="legolasCloseViewer" title="Stäng bildvisare" aria-label="Stäng bildvisare">✕</button></div></header>'+
   '<div class="legolas-stage" id="legolasStage" tabindex="0" aria-label="Bild. Dra för att panorera, rulla eller nyp för att zooma.">'+
    '<div id="legolasMedia" class="legolas-media"><p>Hämtar material…</p></div></div>'+
   '<footer class="legolas-viewer-footer"><button type="button" id="legolasViewerPrevious">← Föregående</button>'+
    '<span id="legolasViewerDescription"></span><button type="button" id="legolasViewerNext">Nästa →</button></footer>';
  doc().body.append(panel,viewer);
  el('legolasClosePanel').addEventListener('click',closePanel);
  el('legolasCloseViewer').addEventListener('click',closeViewer);
  el('legolasPrevious').addEventListener('click',()=>turnPage(-1));
  el('legolasNext').addEventListener('click',()=>turnPage(1));
  el('legolasRefresh').addEventListener('click',()=>loadPage());
  el('legolasCategory').addEventListener('change',event=>{state.category=event.target.value;state.page=0;loadPage();});
  el('legolasSearch').addEventListener('input',event=>{
   if(state.searchTimer)clearTimeout(state.searchTimer);
   state.search=event.target.value;state.page=0;state.loadSeq++;
   state.searchTimer=setTimeout(()=>loadPage(),230);
  });
  el('legolasGrid').addEventListener('click',event=>{
   const toggle=event.target.closest('[data-legolas-pick]');if(toggle){toggleSelection(toggle.dataset.legolasPick);return;}
   const item=event.target.closest('[data-legolas-open]');if(item)openViewer(item.dataset.legolasOpen);
  });
  el('legolasQueueItems').addEventListener('click',event=>{
   const button=event.target.closest('[data-legolas-remove]');if(button)toggleSelection(button.dataset.legolasRemove);
  });
  el('legolasPreviewQueue').addEventListener('click',()=>openQueue());
  el('legolasClearQueue').addEventListener('click',clearSelection);
  el('legolasZoomIn').addEventListener('click',()=>zoom(state.scale*1.25));
  el('legolasZoomOut').addEventListener('click',()=>zoom(state.scale/1.25));
  el('legolasZoomReset').addEventListener('click',()=>zoom(1));
  el('legolasFullscreen').addEventListener('click',toggleFullscreen);
  el('legolasViewerPrevious').addEventListener('click',()=>stepViewer(-1));
  el('legolasViewerNext').addEventListener('click',()=>stepViewer(1));
  el('legolasStage').addEventListener('wheel',wheel,{passive:false});
  el('legolasStage').addEventListener('pointerdown',pointerDown);
  el('legolasStage').addEventListener('pointermove',pointerMove);
  el('legolasStage').addEventListener('pointerup',pointerUp);
  el('legolasStage').addEventListener('pointercancel',pointerUp);
  doc().addEventListener('keydown',keyDown);
  panel.addEventListener('click',event=>{if(event.target===panel)closePanel();});
  viewer.addEventListener('click',event=>{if(event.target===viewer)closeViewer();});
 }
 function syncScroll(){
  doc().body.classList.toggle('legolas-open',state.panelOpen||state.viewerOpen);
 }
 function updateQueue(){
  const wrapper=el('legolasGmQueue');if(!wrapper)return;
  const gm=isGM();wrapper.classList.toggle('hidden',!gm);
  const selected=[...state.selection.values()];
  el('legolasQueueCount').textContent=selected.length+' '+(selected.length===1?'bild':'bilder');
  el('legolasQueueItems').innerHTML=selected.length?
   selected.map(row=>'<span class="legolas-queue-chip">'+safe(row.title)+
    '<button type="button" data-legolas-remove="'+safe(row.id)+'" aria-label="Ta bort '+safe(row.title)+' ur urvalet">×</button></span>').join(''):
    '<span class="legolas-queue-empty">Välj bilder med knappen + Välj.</span>';
  el('legolasPreviewQueue').disabled=!selected.length;
  el('legolasClearQueue').disabled=!selected.length;
  el('legolasGrid')?.querySelectorAll('[data-legolas-pick]').forEach(button=>{
   const picked=state.selection.has(button.dataset.legolasPick);
   button.textContent=picked?'✓ Vald':'+ Välj';
   button.setAttribute('aria-pressed',String(picked));
  });
 }
 function toggleSelection(id){
  if(!isGM()||!authorized())return;
  const row=state.rows.find(row=>row.id===id);
  if(state.selection.has(id))state.selection.delete(id);
  else if(row?.asset_kind==='image'&&row.campaign_id===campaign())state.selection.set(id,row);
  updateQueue();
 }
 function openPanel(){
  mount();
  if(!authorized())return;
  cleanCampaign();
  if(state.panelOpen){loadPage();return;}
  state.lastFocus=doc().activeElement;
  state.panelOpen=true;
  el('legolasPanel').classList.remove('hidden');
  el('legolasSubhead').textContent=isGM()?'SL:s material och förhandsvisning':'Material som har delats med dig';
  updateQueue();syncScroll();
  el('legolasClosePanel').focus();
  loadPage();
 }
 function closePanel(){
  state.panelOpen=false;state.loadSeq++;
  if(state.searchTimer)clearTimeout(state.searchTimer);
  state.searchTimer=null;releaseThumbs();closeViewer();
  el('legolasPanel')?.classList.add('hidden');
  syncScroll();
  state.lastFocus?.focus?.();
 }
 function reset(){
  closePanel();
  state.campaign='';state.rows=[];state.page=0;
  clearSelection();
 }
 function card(row){
  const symbol=row.asset_kind==='image'?'▧':row.asset_kind==='document'?'▤':'≡';
  const picked=state.selection.has(row.id);
  return '<article class="legolas-card">'+
   '<button type="button" class="legolas-card-preview" data-legolas-open="'+safe(row.id)+'" aria-label="Förhandsvisa '+safe(row.title)+'">'+
    '<span class="legolas-card-media" data-legolas-thumb="'+safe(row.id)+'">'+symbol+'</span>'+
    '<span class="legolas-card-title">'+safe(row.title)+'</span><small>'+safe(categories[row.category]||'Övrigt')+'</small></button>'+
   (isGM()&&row.asset_kind==='image'?
     '<button type="button" class="legolas-pick" data-legolas-pick="'+safe(row.id)+'" aria-pressed="'+picked+'">'+(picked?'✓ Vald':'+ Välj')+'</button>':'')+
   '</article>';
 }
 function renderPage(){
  const box=el('legolasGrid');if(!box)return;
  box.innerHTML=state.rows.length?state.rows.map(card).join(''):
   '<div class="legolas-empty">'+(isGM()?'Inget material i biblioteket. Lägg till bilder under Administration → Bildbibliotek.':
    'Inget material har delats med dig ännu.')+'</div>';
  el('legolasPageNumber').textContent='Sida '+(state.page+1);
  el('legolasPrevious').disabled=state.page<=0;
  el('legolasNext').disabled=!state.hasNext;
 }
 async function readMedia(row,thumbnail=false){
  if(!authorized()||row?.campaign_id!==campaign()||!buckets.has(row?.storage_bucket))
   throw Error('Materialet hör inte till din kampanj.');
  const path=thumbnail&&row.thumbnail_path?row.thumbnail_path:row.storage_path;
  if(typeof path!=='string'||!path.startsWith(campaign()+'/')||path.includes('..')||path.includes('//'))
   throw Error('Ogiltig filreferens.');
  return read(row.storage_bucket,path);
 }
 async function loadPage(){
  if(!state.panelOpen||!authorized())return;
  cleanCampaign();
  const seq=++state.loadSeq,scope=campaign();
  state.loading=true;notice('Hämtar material…');
  try{
   const items=await query(legolasQuery(scope,{page:state.page,category:state.category,search:state.search}));
   if(!pageValid(seq,scope))return;
   releaseThumbs();
   state.rows=(Array.isArray(items)?items:[]).slice(0,LEGOLAS_PAGE_SIZE);
   state.hasNext=Array.isArray(items)&&items.length>LEGOLAS_PAGE_SIZE;
   renderPage();updateQueue();
   notice(state.rows.length+' material på sidan'+(state.hasNext?' · fler finns':'')+'.');
   void loadThumbnails(scope);
  }catch(error){
   if(pageValid(seq,scope)){state.rows=[];state.hasNext=false;releaseThumbs();renderPage();notice('Kunde inte hämta material: '+error.message,true);}
  }finally{if(seq===state.loadSeq)state.loading=false;}
 }
 async function loadThumbnails(scope){
  const seq=state.thumbSeq,images=state.rows.filter(row=>row.asset_kind==='image');
  let next=0;
  async function worker(){
   while(next<images.length){
    const row=images[next++];
    try{
     const blob=await readMedia(row,true);
     if(seq!==state.thumbSeq||!state.panelOpen||scope!==campaign())return;
     const placeholder=el('legolasGrid')?.querySelector('[data-legolas-thumb="'+row.id+'"]');
     if(!placeholder)continue;
     const url=win().URL.createObjectURL(blob);state.thumbUrls.set(row.id,url);
     const img=doc().createElement('img');img.alt='';img.loading='lazy';img.src=url;
     placeholder.replaceChildren(img);
    }catch(_){/* An unavailable source is intentionally never made public as fallback. */}
   }
  }
  await Promise.all([worker(),worker(),worker()]);
 }
 function turnPage(direction){
  if(!state.panelOpen||state.loading)return;
  const next=state.page+direction;
  if(next<0||(direction>0&&!state.hasNext))return;
  state.page=next;loadPage();
 }
 function openQueue(){
  if(!isGM()||!authorized()||!state.selection.size)return;
  state.previewRows=[...state.selection.values()].filter(row=>row.campaign_id===campaign()&&row.asset_kind==='image');
  state.index=0;showViewer();
 }
 function openViewer(id){
  const row=state.rows.find(row=>row.id===id);
  if(!row||row.campaign_id!==campaign())return;
  state.previewRows=state.rows.slice();
  state.index=state.previewRows.findIndex(r=>r.id===id);
  showViewer();
 }
 function showViewer(){
  if(!state.previewRows.length||!authorized())return;
  state.viewerLastFocus=doc().activeElement;
  state.viewerOpen=true;
  el('legolasViewer').classList.remove('hidden');syncScroll();
  el('legolasCloseViewer').focus();
  void renderViewer();
 }
 function stage(){
  return el('legolasStage');
 }
 function applyTransform(){
  const image=el('legolasMedia')?.querySelector('img');
  if(!image)return;
  const container=stage();
  const bounds=container?.getBoundingClientRect?.()||{width:0,height:0};
  const naturalW=image.naturalWidth||bounds.width,naturalH=image.naturalHeight||bounds.height;
  const fit=Math.min(bounds.width/naturalW,bounds.height/naturalH)||1;
  const fitWidth=naturalW*fit,fitHeight=naturalH*fit;
  state.tx=Math.max(-legolasPanLimit(bounds.width,fitWidth,state.scale),Math.min(legolasPanLimit(bounds.width,fitWidth,state.scale),state.tx));
  state.ty=Math.max(-legolasPanLimit(bounds.height,fitHeight,state.scale),Math.min(legolasPanLimit(bounds.height,fitHeight,state.scale),state.ty));
  image.style.transform='translate('+state.tx+'px,'+state.ty+'px) scale('+state.scale+')';
  el('legolasZoomReset').textContent=Math.round(state.scale*100)+'%';
 }
 function zoom(scale){
  state.scale=legolasClampScale(scale);
  if(state.scale===1){state.tx=0;state.ty=0;}
  applyTransform();
 }
 async function renderViewer(){
  if(!state.viewerOpen||!authorized())return;
  releaseViewer();
  state.scale=1;state.tx=0;state.ty=0;
  const seq=state.viewerSeq,row=state.previewRows[state.index];
  if(!row||row.campaign_id!==campaign()){closeViewer();return;}
  el('legolasViewerTitle').textContent=row.title||'Material';
  el('legolasViewerCount').textContent=(state.index+1)+' / '+state.previewRows.length;
  el('legolasViewerDescription').textContent=row.description||'';
  el('legolasViewerPrevious').disabled=state.index===0;
  el('legolasViewerNext').disabled=state.index>=state.previewRows.length-1;
  const media=el('legolasMedia');media.textContent='Laddar material…';
  el('legolasZoomReset').textContent='100%';
  const image=row.asset_kind==='image';
  for(const id of ['legolasZoomIn','legolasZoomOut','legolasZoomReset'])el(id).disabled=!image;
  try{
   const blob=await readMedia(row,false);
   if(seq!==state.viewerSeq||!state.viewerOpen||row!==state.previewRows[state.index]||row.campaign_id!==campaign())return;
   const url=win().URL.createObjectURL(blob);state.url=url;media.replaceChildren();
   if(image){
    const img=doc().createElement('img');img.src=url;img.alt=row.title;img.draggable=false;
    img.addEventListener('load',()=>{if(seq===state.viewerSeq)applyTransform();});
    media.append(img);
   }else if(row.asset_kind==='document'){
    const frame=doc().createElement('iframe');
    frame.title='Förhandsvisning: '+row.title;frame.src=url;media.append(frame);
    const link=doc().createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='Öppna dokumentet i ny flik';media.append(link);
   }else{
    const text=doc().createElement('pre');text.textContent=await blob.text();media.append(text);
   }
  }catch(error){if(seq===state.viewerSeq&&state.viewerOpen)media.textContent='Kunde inte läsa material: '+error.message;}
 }
 function stepViewer(delta){
  if(!state.viewerOpen)return;
  const index=state.index+delta;
  if(index<0||index>=state.previewRows.length)return;
  state.index=index;void renderViewer();
 }
 function closeViewer(){
  if(!state.viewerOpen){releaseViewer();return;}
  state.viewerOpen=false;releaseViewer();
  const viewer=el('legolasViewer');viewer?.classList.add('hidden');
  if(doc().fullscreenElement===viewer)void doc().exitFullscreen?.().catch?.(()=>{});
  syncScroll();state.viewerLastFocus?.focus?.();
 }
 function toggleFullscreen(){
  const viewer=el('legolasViewer');if(!viewer||!state.viewerOpen)return;
  if(doc().fullscreenElement===viewer){void doc().exitFullscreen?.().catch?.(()=>{});return;}
  void viewer.requestFullscreen?.().catch?.(()=>{});
 }
 function wheel(event){
  if(!state.viewerOpen||!el('legolasMedia')?.querySelector('img'))return;
  event.preventDefault();zoom(state.scale*(event.deltaY<0?1.12:1/1.12));
 }
 function pointerDown(event){
  if(!state.viewerOpen||!el('legolasMedia')?.querySelector('img'))return;
  state.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  state.dragX=event.clientX-state.tx;state.dragY=event.clientY-state.ty;
  stage()?.setPointerCapture?.(event.pointerId);
  if(state.pointers.size>=2){
   const [a,b]=[...state.pointers.values()];
   state.pinchDistance=Math.hypot(a.x-b.x,a.y-b.y)||1;state.pinchScale=state.scale;
  }
 }
 function pointerMove(event){
  if(!state.pointers.has(event.pointerId))return;
  const previous=state.pointers.get(event.pointerId);
  state.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(state.pointers.size>=2){
   const [a,b]=[...state.pointers.values()];
   if(state.pinchDistance)zoom(state.pinchScale*Math.hypot(a.x-b.x,a.y-b.y)/state.pinchDistance);
  }else if(state.scale>1){
   state.tx+=event.clientX-previous.x;state.ty+=event.clientY-previous.y;applyTransform();
  }
 }
 function pointerUp(event){
  state.pointers.delete(event.pointerId);
  if(state.pointers.size<2)state.pinchDistance=0;
  stage()?.releasePointerCapture?.(event.pointerId);
 }
 function keyDown(event){
  if(state.viewerOpen){
   if(event.key==='Escape'){closeViewer();event.preventDefault();}
   else if(event.key==='ArrowRight'){stepViewer(1);event.preventDefault();}
   else if(event.key==='ArrowLeft'){stepViewer(-1);event.preventDefault();}
   else if(event.key==='+'||event.key==='='){zoom(state.scale*1.25);event.preventDefault();}
   else if(event.key==='-'){zoom(state.scale/1.25);event.preventDefault();}
  }else if(state.panelOpen&&event.key==='Escape'){closePanel();event.preventDefault();}
 }
 function getStagedIds(){return isGM()&&authorized()?[...state.selection.keys()]:[];}
 return {state,mount,openPanel,closePanel,reset,loadPage,openViewer,closeViewer,
  openQueue,toggleSelection,getStagedIds,zoom,stepViewer,readMedia};
}
