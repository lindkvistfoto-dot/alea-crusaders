/* Alea Crusaders: restore navigation within the same browser tab on refresh.
 * Never repeat dice throws, combat actions or form submissions. */
(function(){
 'use strict';
 const KEY='alea-refresh-location-v1';
 const PAGES=new Set(['landing','home','view','shopPage','innPage','academyPage',
  'combatPage','mapPage','dicePage','journalPage','admin','legolasPanel']);
 const TABS=new Set(['grund','skills','magic','weapons','equipment','images']);
 const ROUTES={
  landing:'landingHomeNavBtn',home:'landingCharactersNavBtn',
  shopPage:'shopNavBtn',innPage:'innNavBtn',academyPage:'academyNavBtn',
  combatPage:'combatNavBtn',mapPage:'mapNavBtn',dicePage:'diceNavBtn',
  journalPage:'journalNavBtn',legolasPanel:'materialNavBtn'
 };
 let pending=null,armed=false,started=false,characterId='',characterTab='grund';
 try{
  const state=JSON.parse(sessionStorage.getItem(KEY)||'null');
  if(state?.v===1&&PAGES.has(state.page))pending=state;
 }catch(_){}
 const main=document.querySelector('main');
 const sections=()=>Array.from(main?.querySelectorAll(':scope > section[id]')||[]);
 const activePage=()=>{
  const active=sections().filter(el=>PAGES.has(el.id)&&!el.classList.contains('hidden'));
  return active.find(el=>el.id!=='landing'&&el.id!=='home')?.id||
   active.find(el=>el.id==='home')?.id||active[0]?.id||'';
 };
 const authorized=()=>!!main&&!main.classList.contains('hidden')&&
  document.getElementById('loginScreen')?.classList.contains('hidden');
 const adminSection=()=>document.querySelector('#admin .admin-detail:not(.hidden)')
  ?.dataset?.adminSection||'overview';
 function snapshot(){
  if(!authorized())return null;
  const page=activePage();
  if(!PAGES.has(page))return null;
  const state={v:1,page,scrollY:Math.max(0,Math.round(window.scrollY||0))};
  if(page==='shopPage')
   state.alchemy=!!document.getElementById('shopPage')?.classList.contains('shop-alchemy');
  if(page==='admin')state.adminSection=adminSection();
  if(page==='view'&&characterId){
   state.characterId=characterId;
   state.characterTab=TABS.has(characterTab)?characterTab:'grund';
  }
  return state;
 }
 function save(){
  if(!armed)return;
  const state=snapshot();
  if(!state)return;
  try{sessionStorage.setItem(KEY,JSON.stringify(state))}catch(_){}
 }
 function clear(){
  pending=null;armed=false;started=false;characterId='';characterTab='grund';
  try{sessionStorage.removeItem(KEY)}catch(_){}
 }
 function characterOpened(id){
  characterId=typeof id==='string'?id:'';
  characterTab='grund';save();
 }
 function tabChanged(tab){
  if(TABS.has(tab))characterTab=tab;
  save();
 }
 // Watch only page visibility and admin section visibility, not combat state.
 if(typeof MutationObserver==='function'&&main){
  const observed=new WeakSet();
  const observer=new MutationObserver(save);
  function watch(){
   for(const el of [...sections(),...document.querySelectorAll('#admin .admin-detail')]){
    if(observed.has(el))continue;
    observed.add(el);
    observer.observe(el,{attributes:true,attributeFilter:['class']});
   }
  }
  watch();
  new MutationObserver(watch).observe(main,{childList:true,subtree:true});
 }
 window.addEventListener('pagehide',save);
 document.addEventListener('click',()=>{if(armed)requestAnimationFrame(save)},true);
 async function restore(){
  if(started)return;
  started=true;
  if(!authorized())return;
  const state=pending;
  pending=null;
  const current=activePage();
  // Navigation performed while Supabase loaded must take precedence.
  if(!state||!['landing','home',''].includes(current)){
   armed=true;save();return;
  }
  try{
   if(state.page==='view'){
    if(typeof state.characterId==='string'&&state.characterId.length<160&&
       typeof window.openChar==='function'){
     window.openChar(state.characterId);
     if(!document.getElementById('view')?.classList.contains('hidden')){
      characterId=state.characterId;
      characterTab='grund';
      if(TABS.has(state.characterTab)&&typeof window.setTab==='function'){
       window.setTab(state.characterTab);
       characterTab=state.characterTab;
      }
     }
    }
    if(document.getElementById('view')?.classList.contains('hidden'))
     window.openCharacters?.();
   }else if(state.page==='admin'){
    if(typeof window.openAdmin==='function'){
     await window.openAdmin();
     if(!document.getElementById('admin')?.classList.contains('hidden')&&
        typeof state.adminSection==='string'&&state.adminSection.length<80)
      await window.openAdminSection?.(state.adminSection);
    }
   }else{
    const id=state.page==='shopPage'&&state.alchemy?'alchemyNavBtn':ROUTES[state.page];
    if(id)document.getElementById(id)?.click();
   }
   const y=Number(state.scrollY);
   if(Number.isFinite(y)&&y>=0)requestAnimationFrame(()=>
    requestAnimationFrame(()=>window.scrollTo?.(0,Math.min(y,200000))));
  }catch(err){
   console.warn('Alea: kunde inte återställa tidigare sida',err);
  }finally{
   armed=true;
   requestAnimationFrame(save);
  }
 }
 window.aleaRefreshLocation={restore,save,clear,characterOpened,tabChanged};
})();
