/* ALEA COMBAT GALLERY – desktop display slot for context-selected artwork.
 * A purely local presenter: no storage writes, no spell-rule changes.
 * Future sources can call show({title,path,battleId}) with existing art resolver.
 */
(function(){
 'use strict';
 let current=null,revision=0,hydration=0;
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const frame=()=>document.getElementById('combatArtViewer');

 function html(battleId){
  if(current&&String(current.battleId)!==String(battleId||'')){current=null;++revision}
  return '<section class="combat-art-viewer" id="combatArtViewer" aria-label="Bildvisare i strid">'+
   '<div class="combat-art-viewer-head"><span class="combat-art-viewer-eyebrow">✦ ARCANE GALLERY</span>'+
   '<button class="combat-art-viewer-clear" type="button" aria-label="Rensa bildvisaren" title="Rensa bildvisaren" onclick="window.aleaCombatArtViewer?.clear()">×</button></div>'+
   '<div class="combat-art-viewer-picture">'+
    '<img class="combat-art-viewer-image" alt="" decoding="async" hidden>'+
    '<span class="combat-art-viewer-empty" role="status">Klicka på en besvärjelse i kryptexen för att visa dess ikon här.</span>'+
    '<span class="combat-art-viewer-corner top-left" aria-hidden="true"></span>'+
    '<span class="combat-art-viewer-corner top-right" aria-hidden="true"></span>'+
    '<span class="combat-art-viewer-corner bottom-left" aria-hidden="true"></span>'+
    '<span class="combat-art-viewer-corner bottom-right" aria-hidden="true"></span>'+
   '</div>'+
   '<div class="combat-art-viewer-caption"><span class="combat-art-viewer-type">BILDVISARE</span>'+
   '<strong class="combat-art-viewer-title">Ingen bild vald</strong></div>'+
  '</section>';
 }
 function render(){
  const section=frame();
  if(!section)return;
  const seq=++hydration;
  const img=section.querySelector('.combat-art-viewer-image');
  const empty=section.querySelector('.combat-art-viewer-empty');
  const title=section.querySelector('.combat-art-viewer-title');
  const type=section.querySelector('.combat-art-viewer-type');
  const close=section.querySelector('.combat-art-viewer-clear');
  img.removeAttribute('src');
  img.hidden=true;
  close.hidden=!current;
  title.textContent=current?.title||'Ingen bild vald';
  type.textContent=current?.source==='spell'?'BESVÄRJELSE':'BILDVISARE';
  if(!current){
   empty.textContent='Klicka på en besvärjelse i kryptexen för att visa dess ikon här.';
   empty.hidden=false;return;
  }
  if(!current.path){
   empty.textContent='Ingen bild är kopplad till '+current.title+'.';
   empty.hidden=false;return;
  }
  const art=window.aleaSpellArt;
  if(!art?.validPath?.(current.path)||typeof art.resolveUrl!=='function'){
   empty.textContent='Bilden kan inte öppnas.';
   empty.hidden=false;return;
  }
  const rev=revision;
  empty.textContent='Öppnar bilden…';
  empty.hidden=false;
  const pending=art.resolveUrl(current.path);
  Promise.resolve(pending).then(url=>{
   if(!url||rev!==revision||seq!==hydration||!img.isConnected)return;
   img.onload=()=>{
    if(rev!==revision||seq!==hydration||!img.isConnected)return;
    img.hidden=false;empty.hidden=true;
   };
   img.onerror=()=>{
    if(rev!==revision||seq!==hydration||!img.isConnected)return;
    img.hidden=true;empty.hidden=false;empty.textContent='Bilden kunde inte laddas.';
   };
   img.src=url;
   if(img.complete&&img.naturalWidth)img.onload();
  }).catch(()=>{
   if(rev!==revision||seq!==hydration||!img.isConnected)return;
   empty.hidden=false;empty.textContent='Bilden kunde inte laddas.';
  });
 }
 function show({title,path,battleId,source='image'}={}){
  if(!battleId)return false;
  current={
   title:String(title||'Bild').slice(0,130),
   path:String(path||''),battleId:String(battleId),
   source:String(source||'image')
  };
  ++revision;
  render();
  return true;
 }
 function clear(){current=null;++revision;render()}
 window.aleaCombatArtViewer={html,render,show,clear,get current(){return current?{...current}:null}};
})();
