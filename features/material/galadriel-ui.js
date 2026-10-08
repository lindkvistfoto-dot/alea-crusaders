/* Galadriel v0.34.87 — interface integration of safe campaign Realtime signals. */
import {createGaladriel} from './realtime.js?v=0.34.87';
import './realtime.css';

export function mountGaladriel({
 legolas,frodoUi,samUi,getCampaign,getToken,isAuthenticated,isGM,supabaseUrl,publishableKey,
 doc=()=>document,win=()=>window,makeSocket
}){
 const el=id=>doc().getElementById(id);
 let mounted=false,refreshSequence=0;
 async function refreshPresentation(){
  if(!isAuthenticated()||!getCampaign())return;
  try{
   await frodoUi.frodo.refresh({autoOpen:true,silent:true});
   if(legolas.state.panelOpen)void legolas.loadPage();
  }catch(_){}
 }
 async function refreshFolder(){
  if(!isAuthenticated()||!legolas.state.panelOpen)return;
  const campaign=getCampaign(),seq=++refreshSequence;
  const displayed=legolas.state.viewerOpen?
    legolas.state.previewRows[legolas.state.index]:null;
  await samUi.load();
  if(seq!==refreshSequence||campaign!==getCampaign()||!isAuthenticated())return;
  // Stop showing revoked persistent library images if not also presented by Frodo.
  if(displayed&&legolas.state.viewerOpen&&
    legolas.state.previewRows[legolas.state.index]?.id===displayed.id&&
    displayed.id!==frodoUi.frodo.state.materialId&&
    !samUi.sam.state.rows.some(entry=>entry.material_id===displayed.id)&&
    !legolas.state.selection.has(displayed.id)&&
    !isGM())legolas.closeViewer();
  void legolas.loadPage();
 }
 const galadriel=createGaladriel({
  getCampaign,getToken,isAuthenticated,supabaseUrl,publishableKey,
  makeSocket,
  onPresentation:refreshPresentation,onFolder:refreshFolder,
  onStatus:(status,connected)=>{
   const node=el('galadrielStatus');
   if(node){node.textContent='✨ Galadriel · '+status;
    node.classList.toggle('galadriel-connected',connected);
    node.setAttribute('data-live',connected?'yes':'no');
   }
  }
 });
 function mount(){
  if(mounted)return;
  const sam=el('samPanel');
  if(!sam)return;
  mounted=true;
  const node=doc().createElement('div');
  node.id='galadrielStatus';node.className='galadriel-status';
  node.setAttribute('role','status');node.setAttribute('aria-live','polite');
  node.textContent='✨ Galadriel · Vilande';
  sam.insertAdjacentElement('afterend',node);
  const login=el('loginScreen');
  if(login&&typeof MutationObserver!=='undefined'){
   new MutationObserver(()=>{
    if(!login.classList.contains('hidden'))galadriel.tick();
    else galadriel.tick();
   }).observe(login,{attributes:true,attributeFilter:['class']});
  }
  doc().addEventListener('visibilitychange',()=>{
   if(doc().visibilityState==='visible'){galadriel.tick();galadriel.reconcile();}
  });
  galadriel.start();
 }
 return {galadriel,mount,stop:galadriel.stop,connected:()=>galadriel.state.connected};
}
