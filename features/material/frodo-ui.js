/* Frodo v0.34.85 — explicit show-now control for Legolas and Bilbo. */
import {createFrodo} from './presentation.js?v=0.34.85';
// Styles loaded as ordinary <link> elements: GitHub Pages serves unbundled ES modules.

export function mountFrodo({
 legolas,getCampaign,isLoggedIn,isGM,request,
 isRealtimeConnected=()=>false,
 doc=()=>document,win=()=>window
}){
 const el=id=>doc().getElementById(id);
 const scope=()=>String(getCampaign()||'');
 const authenticated=()=>Boolean(isLoggedIn()&&scope());
 let liveId=null,initialized=false,queuedStatus='',queuedError=false;
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
   liveId=row.id;
   legolas.previewMaterial(row);
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
  const current=el('frodoCurrent');
  if(current)current.textContent=!state.loaded?'Hämtar aktuell visning…':
   state.materialId?'Visas för deltagarna: '+(row?.title||'Bild'):'Ingen bild visas just nu.';
  card.classList.toggle('frodo-is-active',Boolean(state.materialId));
  el('frodoGmActions').classList.toggle('hidden',!gm);
  el('frodoPlayerActions').classList.toggle('hidden',gm);
  const notice=el('frodoNotice');
  if(notice){notice.textContent=queuedStatus;notice.classList.toggle('is-error',queuedError);}
  const rows=selection(),idx=rows.findIndex(x=>x.id===state.materialId);
  for(const [id,disabled] of [
   ['frodoShowQueue',!gm||!rows.length||state.busy],
   ['frodoPrev',!gm||state.busy||idx<=0],
   ['frodoNext',!gm||state.busy||idx<0||idx>=rows.length-1],
   ['frodoStop',!gm||state.busy||!state.materialId],
   ['frodoOpenCurrent',gm||!row]
  ]){const btn=el(id);if(btn)btn.disabled=disabled;}
 }
 async function showRow(row){
  if(!isGM())return null;
  const result=await frodo.show(row);
  render();return result;
 }
 async function showQueue(index=0){
  if(!isGM())return null;
  const row=selection()[index];
  if(!row){notify('Välj en eller flera bilder med + Välj först.',true);return null;}
  return showRow(row);
 }
 async function step(delta){
  if(!isGM())return;
  const rows=selection(),idx=rows.findIndex(x=>x.id===frodo.state.materialId);
  const next=idx+delta;
  if(idx<0||next<0||next>=rows.length)return;
  await showQueue(next);
 }
 async function refresh(silent=false){
  const result=await frodo.refresh({silent,autoOpen:false});
  render();return result;
 }
 function canWatch(){
  return authenticated()&&!isGM()&&doc().visibilityState!=='hidden'&&
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
   '<div class="frodo-panel-heading"><div class="frodo-heading-copy"><span class="frodo-eyebrow">PRESENTATION · DIREKT</span><strong><span aria-hidden="true">◉</span> Aktuell visning</strong></div>'+
    '<span id="frodoCurrent" role="status" aria-live="polite">Hämtar aktuell visning…</span></div>'+
   '<div id="frodoGmActions" class="frodo-actions hidden">'+
    '<button type="button" id="frodoShowQueue" class="frodo-primary">📡 Visa första valda</button>'+
    '<button type="button" id="frodoPrev">← Föregående</button>'+
    '<button type="button" id="frodoNext">Nästa →</button>'+
    '<button type="button" id="frodoStop" class="frodo-stop">■ Avsluta visning</button></div>'+
   '<div id="frodoPlayerActions" class="frodo-actions hidden">'+
    '<button type="button" id="frodoOpenCurrent" class="frodo-primary">Visa aktuell bild</button>'+
    '<button type="button" id="frodoRefresh">↻ Uppdatera</button></div>'+
   '<p id="frodoNotice" aria-live="polite" role="status"></p>';
  target.insertAdjacentElement('beforebegin',panel);
  const help=el('legolasGmQueue')?.querySelector('p');
  if(help)help.textContent='Välj bilder med + Välj. Visa första valda ovan delar bara den aktuella bilden med deltagarna.';
  el('frodoShowQueue').addEventListener('click',()=>showQueue());
  el('frodoPrev').addEventListener('click',()=>step(-1));
  el('frodoNext').addEventListener('click',()=>step(1));
  el('frodoStop').addEventListener('click',()=>frodo.stop());
  el('frodoOpenCurrent').addEventListener('click',()=>{
   if(!isGM()&&frodo.state.row)legolas.previewMaterial(frodo.state.row);
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
    if(!login.classList.contains('hidden')){frodo.reset();liveId=null;queuedStatus='';}
    else if(canWatch())void frodo.refresh({autoOpen:true,silent:true});
   }).observe(login,{attributes:true,attributeFilter:['class']});
  }
  render();
 }
 return {frodo,mount,refresh,showRow,showQueue,step,render};
}
