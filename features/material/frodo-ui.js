/* Frodo v0.34.85 — explicit show-now control for Legolas and Bilbo. */
import {createFrodo} from './presentation.js?v=0.34.85';
import {createLivePreview} from './live-preview.js?v=0.35.21';
import {createArcaneGallery} from './arcane-gallery.js?v=0.35.239&morph=6&goose=10&carousel=03&seam=01&telescope=03&bronze=01&hatch=02&thumb=01&lift=46';
// Styles loaded as ordinary <link> elements: GitHub Pages serves unbundled ES modules.

export function mountFrodo({
 legolas,getCampaign,isLoggedIn,isGM,request,
 isRealtimeConnected=()=>false,
 doc=()=>document,win=()=>window
}){
 const el=id=>doc().getElementById(id);
 const gallery=createArcaneGallery({legolas,request,getCampaign,isLoggedIn,isGM,doc,win});
 const scope=()=>String(getCampaign()||'');
 const authenticated=()=>Boolean(isLoggedIn()&&scope());
 let liveId=null,initialized=false,queuedStatus='',queuedError=false;
 let stagedId='',queueSignature='',queueGeneration=0,testBusy=false;
 const queueUrls=new Map();
 // GOOSE 05: the GM and players share `gallery`. Staged choices stay
 // exclusively in the administration strip below; selecting them never publishes.
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[char]);
 function clearQueueImages(){
  queueGeneration++;
  for(const url of queueUrls.values())win().URL.revokeObjectURL(url);
  queueUrls.clear();
 }
 async function loadQueueImages(rows,signature){
  const generation=queueGeneration;
  let next=0;
  async function worker(){
   while(next<rows.length){
    const row=rows[next++];
    try{
     const blob=await legolas.readMedia(row,true);
     if(generation!==queueGeneration||signature!==queueSignature||
        !authenticated()||!isGM())return;
     const slot=el('frodoQueueStrip')?.querySelector('[data-frodo-image="'+row.id+'"]');
     if(!slot)continue;
     const url=win().URL.createObjectURL(blob);
     queueUrls.set(row.id,url);
     const image=doc().createElement('img');
     image.alt='';image.decoding='async';image.src=url;
     slot.replaceChildren(image);
    }catch(_){/* Keep the named placeholder if this private thumbnail cannot be read. */}
   }
  }
  await Promise.all([worker(),worker()]);
 }
 function renderQueue(rows,gm){
  const section=el('frodoQueueView'),strip=el('frodoQueueStrip');
  if(!section||!strip)return;
  section.classList.toggle('hidden',!gm);
  if(!gm||!authenticated()){
   if(queueSignature){clearQueueImages();queueSignature='';stagedId='';strip.replaceChildren();}
   return;
  }
  if(stagedId&&!rows.some(row=>row.id===stagedId))stagedId='';
  if(!stagedId&&rows.length)stagedId=rows[0].id;
  const signature=scope()+'|'+rows.map(row=>row.id+':'+(row.thumbnail_path||row.storage_path)).join('|');
  if(signature!==queueSignature){
   clearQueueImages();queueSignature=signature;
   const visible=rows.slice(0,10);
   strip.innerHTML='<button type="button" id="frodoAddToQueue" class="frodo-queue-add" '+
     'aria-label="Välj fler bilder i arkivet"><span aria-hidden="true">＋</span>'+
     '<small>Lägg till<br>bild</small></button>'+
     visible.map((row,index)=>'<button type="button" class="frodo-queue-tile" data-frodo-id="'+
      escapeHtml(row.id)+'" title="'+escapeHtml(row.title||'Bild')+'">'+
      '<span class="frodo-queue-art" data-frodo-image="'+escapeHtml(row.id)+
      '"><span aria-hidden="true">▧</span></span>'+
      '<span class="frodo-queue-number">'+(index+1)+'</span>'+
      '<span class="frodo-queue-title">'+escapeHtml(row.title||'Bild')+'</span></button>').join('')+
     (rows.length>10?'<span class="frodo-queue-overflow">+'+(rows.length-10)+' till</span>':'');
   if(visible.length)void loadQueueImages(visible,signature);
  }
  for(const tile of strip.querySelectorAll('[data-frodo-id]')){
   const selected=tile.dataset.frodoId===stagedId;
   tile.classList.toggle('is-selected',selected);
   tile.setAttribute('aria-pressed',String(selected));
  }
  const count=el('frodoQueueCount');
  if(count)count.textContent=rows.length+' '+(rows.length===1?'bild':'bilder')+' i urval';
  const staged=rows.find(row=>row.id===stagedId);
  const hint=el('frodoQueueHint');
  if(hint)hint.textContent=staged?'Vald: '+(staged.title||'Bild')+
   ' · Visas först när du trycker Visa vald bild.':
   'Välj bilder i arkivet nedanför. Inget delas innan du trycker Visa vald bild.';
 }

 const preview=createLivePreview({
  read:(row,thumbnail)=>legolas.readMedia(row,thumbnail),
  makeUrl:blob=>win().URL.createObjectURL(blob),
  revokeUrl:url=>win().URL.revokeObjectURL(url),
  onChange:s=>{
   const image=el('frodoGmImage'),status=el('frodoGmPreviewStatus');
   if(!image||!status)return;
   if(s.phase==='ready'){
    if(image.getAttribute('src')!==s.url)image.src=s.url;
    image.alt='Bild som delas med spelarna: '+s.title;
    image.classList.remove('hidden');
    status.classList.add('hidden');
   }else{
    image.removeAttribute('src');
    image.classList.add('hidden');
    status.textContent=s.phase==='loading'?'Laddar delad bild…':
     s.phase==='error'?'Bilden kunde inte laddas. Prova Visa stort.':'Ingen bild visas just nu.';
    status.classList.remove('hidden');
   }
  }
 });
 function selection(){
  return [...legolas.state.selection.values()].filter(
   x=>x.campaign_id===scope()&&!x.archived_at&&x.asset_kind==='image'
  );
 }
 function notify(message,error=false){
  queuedStatus=message;queuedError=error;render();
 }
 const frodo=createFrodo({
  getCampaign:scope,isAuthenticated:authenticated,isGM,request,
  onPresentation:row=>{
   if(isGM())return;
   const changedPicture=liveId!==row.id;
   liveId=row.id;
   // A fullscreen preview must not conceal a newly presented GM picture.
   if(changedPicture&&legolas.state.viewerOpen)
    legolas.closeViewer({restoreFocus:false});
   legolas.openPanel();
   if(legolas.state.panelOpen)void legolas.loadPage();
  },
  onCleared:()=>{
   if(liveId){legolas.closeViewer();liveId=null;}
   if(legolas.state.panelOpen)void legolas.loadPage();
  },
  onChange:()=>render(),
  onNotice:notify
 });

 function render(){
  const card=el('frodoPanel');
  if(!card)return;
  const state=frodo.state,gm=Boolean(isGM()),row=state.row;
  card.classList.toggle('frodo-is-gm',gm);
  // Only the GM's small-screen atelier suppresses the redundant archive hero.
  el('legolasPanel')?.classList.toggle('legolas-atelier-gm',gm);
  const heading=el('frodoPanelTitle'),subtitle=el('frodoPanelSubtitle');
  if(heading)heading.textContent='Arcane Gallery';
  if(subtitle)subtitle.textContent='Gemensam visning för spelare och spelledare';
  card.classList.toggle('frodo-is-active',Boolean(state.materialId));
  const current=el('frodoCurrent');
  if(current)current.textContent=!state.loaded?'Hämtar aktuell visning…':
   state.materialId?'Visas för deltagarna: '+(row?.title||'Bild'):'Ingen bild visas just nu.';
  const chip=el('frodoLiveStatus');
  if(chip){chip.textContent=state.materialId?'● LIVE':'☾ Viloläge';
   chip.classList.toggle('is-live',Boolean(state.materialId));}
  const activeRow=gm&&authenticated()&&state.loaded&&row?.id===state.materialId&&
   row.campaign_id===scope()&&!row.archived_at?row:null;
  const gmPreview=el('frodoGmPreview');
  // The legacy small preview is superseded by the actual shared GOOSE viewer.
  if(gmPreview)gmPreview.classList.add('hidden');
  preview.clear();
  const caption=el('frodoGmPreviewCaption');
  if(caption)caption.textContent=activeRow?
   activeRow.asset_kind==='image'?'Originalbilden som visas för deltagarna: '+(activeRow.title||'Bild'):
   'Ett dokument visas för deltagarna. Öppna det i stor vy.':
   'När du visar en bild syns den här, precis som för spelarna.';
  const sceneName=el('frodoSceneName');
  if(sceneName)sceneName.textContent=activeRow?.title||'Ingen aktiv visning';
  const sceneIndicator=el('frodoSceneIndicator');
  if(sceneIndicator)sceneIndicator.textContent=activeRow?'● LIVE':'—';
  const openLarge=el('frodoGmOpenLarge');
  if(openLarge)openLarge.disabled=!activeRow;
  el('frodoGmActions').classList.toggle('hidden',!gm);
  el('frodoGmAdmin')?.classList.toggle('hidden',!gm);
  el('frodoGooseTestControls')?.classList.toggle('hidden',!gm||!authenticated());
  for(const id of ['frodoGooseTestOpen','frodoGooseTestClose']){
   const button=el(id);if(button)button.disabled=!gm||!authenticated()||testBusy;
  }
  el('frodoPlayerActions').classList.toggle('hidden',gm);
  const notice=el('frodoNotice');
  if(notice){notice.textContent=queuedStatus;notice.classList.toggle('is-error',queuedError);}
  gallery.sync(state.row,state.revision);
  const rows=selection(),idx=rows.findIndex(x=>x.id===state.materialId);
  renderQueue(rows,gm);
  // Only the shared presentation history may populate the big gallery.
  for(const [id,disabled] of [
   ['frodoShowQueue',!gm||!rows.length||state.busy],
   ['frodoPrev',!gm||state.busy||idx<=0],
   ['frodoNext',!gm||state.busy||idx<0||idx>=rows.length-1],
   ['frodoStop',!gm||state.busy||!state.materialId],
   ['frodoOpenCurrent',gm||!row]
  ]){const btn=el(id);if(btn)btn.disabled=disabled;}
 }
 async function testGoose(action){
  if(!isGM()||!authenticated()||testBusy)return;
  testBusy=true;
  const status=el('frodoGooseTestStatus');
  if(status)status.textContent=action==='open'?'Öppnar luckorna…':'Stänger luckorna…';
  render();
  try{
   const success=await gallery.testShutter(action);
   if(status)status.textContent=success?
    (action==='open'?'Luckorna öppna.':'Luckorna stängda.'):
    'Vänta tills bilden och den pågående rörelsen är klara.';
  }catch(_){if(status)status.textContent='Lucktestet kunde inte genomföras.';}
  finally{testBusy=false;render();}
 }
 async function showRow(row){
  if(!isGM())return null;
  const result=await frodo.show(row);
  render();return result;
 }
 async function showQueue(index=0){
  if(!isGM())return null;
  const rows=selection(),row=index===0&&stagedId?rows.find(item=>item.id===stagedId):rows[index];
  if(!row){notify('Välj en eller flera bilder med + Välj först.',true);return null;}
  return showRow(row);
 }
 async function step(delta){
  if(!isGM())return;
  const rows=selection(),idx=rows.findIndex(x=>x.id===frodo.state.materialId);
  const next=idx+delta;
  if(idx<0||next<0||next>=rows.length)return;
  await showRow(rows[next]);
 }
 async function refresh(silent=false){
  const result=await frodo.refresh({silent,autoOpen:false});
  render();return result;
 }
 function canWatch(){
  return authenticated()&&doc().visibilityState!=='hidden'&&
   el('loginScreen')?.classList?.contains('hidden');
 }
 function mount(){
  if(initialized)return;
  const target=el('legolasGmQueue'),parent=target?.parentElement;
  if(!parent)return;
  initialized=true;
  const panel=doc().createElement('section');
  panel.id='frodoPanel';panel.className='frodo-panel';
  panel.setAttribute('aria-label','Materialvisning för deltagare');

  panel.innerHTML=
   '<div class="frodo-panel-heading"><div class="frodo-heading-copy">'+
    '<span class="frodo-eyebrow">ALEA CRUSADERS · BILDPRESENTATION</span>'+
    '<strong id="frodoPanelTitle">Presentationsateljén</strong>'+ 
    '<small id="frodoPanelSubtitle">Spelledarens kontrollpanel</small></div>'+
    '<span class="frodo-live-chip" id="frodoLiveStatus">☾ Viloläge</span>'+ 
    '<span id="frodoCurrent" role="status" aria-live="polite">Hämtar aktuell visning…</span></div>'+
   '<button type="button" id="frodoCloseMobile" class="frodo-close-mobile" '+
    'aria-label="Stäng materialpanelen" title="Tillbaka">✕</button>'+
   '<div id="frodoGmPreview" class="frodo-gm-preview hidden" aria-label="Bild som visas för spelarna">'+
    '<div class="frodo-gm-preview-top"><span>▣ SPELARNAS SKÄRM</span>'+
    '<button type="button" id="frodoGmOpenLarge" disabled>⛶ Visa stort</button></div>'+
    '<div class="frodo-gm-preview-stage"><img id="frodoGmImage" class="hidden" alt="">'+
    '<p id="frodoGmPreviewStatus" role="status">Ingen bild visas just nu.</p></div>'+
    '<p id="frodoGmPreviewCaption">När du visar en bild syns den här.</p>'+
    '<div class="frodo-scene-strip"><span><small>AKTUELL SCEN</small>'+
    '<strong id="frodoSceneName">Ingen aktiv visning</strong></span>'+
    '<span id="frodoSceneIndicator" aria-hidden="true">—</span></div></div>'+
   '<div id="frodoGooseTestControls" class="frodo-goose-test-controls hidden" '+
     'role="group" aria-label="Tillfälliga testknappar för GOOSE-luckorna">'+
    '<span class="frodo-goose-test-label">GOOSE · TEST</span>'+
    '<button type="button" id="frodoGooseTestOpen">Öppna</button>'+
    '<button type="button" id="frodoGooseTestClose">Stäng</button>'+
    '<span id="frodoGooseTestStatus" role="status" aria-live="polite"></span></div>'+
   '<details id="frodoGmAdmin" class="frodo-gm-admin hidden" open>'+
    '<summary><span>⚙ Bildadministration</span><small>Förberedelser · endast SL</small></summary>'+
    '<div class="frodo-gm-admin-body">'+
   '<div id="frodoQueueView" class="frodo-queue-view hidden">'+
    '<div class="frodo-queue-heading"><strong>▧ Kommande bilder</strong>'+
    '<span id="frodoQueueCount">0 bilder i urval</span></div>'+
    '<div id="frodoQueueStrip" class="frodo-queue-strip" aria-label="Bildurval för nästa visning"></div>'+
    '<p id="frodoQueueHint" class="frodo-queue-hint"></p></div>'+
   '<div id="frodoGmActions" class="frodo-actions hidden">'+
    '<button type="button" id="frodoShowQueue" class="frodo-primary">◉ Visa vald bild</button>'+
    '<button type="button" id="frodoPrev">← Föregående</button>'+
    '<button type="button" id="frodoNext">Nästa →</button>'+
    '<button type="button" id="frodoStop" class="frodo-stop">■ Avsluta visning</button></div>'+
    '</div></details>'+
   '<details class="frodo-sound-note"><summary>◖ Ljud &amp; atmosfär <span>⌄</span></summary>'+
    '<p>Använd Aleas befintliga Ljud-kontroll för musik och atmosfär.</p></details>'+
   '<div id="frodoPlayerActions" class="frodo-actions hidden">'+
    '<button type="button" id="frodoOpenCurrent" class="frodo-primary">Visa aktuell bild</button>'+
    '<button type="button" id="frodoRefresh">↻ Uppdatera</button></div>'+
   '<p id="frodoNotice" aria-live="polite" role="status"></p>';
  target.insertAdjacentElement('beforebegin',panel);
  el('frodoGmPreview').insertAdjacentElement('beforebegin',gallery.mount());
  const help=el('legolasGmQueue')?.querySelector('p');
  if(help)help.textContent='Förbered bilder privat i bildadministrationen. Bara ett uttryckligt visningskommando påverkar deltagarna.';
  el('frodoCloseMobile').addEventListener('click',()=>el('legolasClosePanel')?.click());
  el('frodoGooseTestOpen').addEventListener('click',()=>{void testGoose('open');});
  el('frodoGooseTestClose').addEventListener('click',()=>{void testGoose('close');});
  el('frodoGmOpenLarge').addEventListener('click',()=>{
   const row=frodo.state.row;
   if(isGM()&&authenticated()&&frodo.state.loaded&&row&&
      frodo.state.materialId===row.id&&row.campaign_id===scope()&&!row.archived_at)
    legolas.previewMaterial(row);
  });
  el('frodoQueueStrip').addEventListener('click',event=>{
   const tile=event.target.closest('[data-frodo-id]');
   if(tile){stagedId=tile.dataset.frodoId;render();return;}
   if(event.target.closest('#frodoAddToQueue')){
    const search=el('legolasSearch');
    if(search){search.scrollIntoView({behavior:'smooth',block:'center'});search.focus({preventScroll:true});}
   }
  });
  el('frodoShowQueue').addEventListener('click',()=>showQueue());
  el('frodoPrev').addEventListener('click',()=>step(-1));
  el('frodoNext').addEventListener('click',()=>step(1));
  el('frodoStop').addEventListener('click',()=>frodo.stop());
  el('frodoOpenCurrent').addEventListener('click',()=>{
   if(!isGM()&&frodo.state.row)el('arcaneGallery')?.scrollIntoView({behavior:'smooth',block:'center'});
  });
  el('frodoRefresh').addEventListener('click',()=>refresh());
  el('materialNavBtn')?.addEventListener('click',()=>{void refresh();});
  el('legolasGrid')?.addEventListener('click',()=>{queueMicrotask(render);});
  el('legolasQueueItems')?.addEventListener('click',()=>{queueMicrotask(render);});
  el('legolasClearQueue')?.addEventListener('click',()=>{queueMicrotask(render);});
  doc().addEventListener('visibilitychange',()=>{
   if(canWatch())void frodo.refresh({autoOpen:true,silent:true});
  });
  win().setInterval?.(()=>{
   if(canWatch()&&!isRealtimeConnected())void frodo.refresh({autoOpen:true,silent:true});
  },5000);
  const login=el('loginScreen');
  if(login&&typeof MutationObserver!=='undefined'){
   new MutationObserver(()=>{
    if(!login.classList.contains('hidden')){gallery.clear();frodo.reset();preview.clear();clearQueueImages();queueSignature='';stagedId='';liveId=null;queuedStatus='';}
    else if(canWatch())void frodo.refresh({autoOpen:true,silent:true});
   }).observe(login,{attributes:true,attributeFilter:['class']});
  }
  render();
 }
 return {frodo,mount,refresh,showRow,showQueue,step,render};
}
