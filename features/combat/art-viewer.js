/* ALEA COMBAT GALLERY – desktop display slot for context-selected artwork.
 * A purely local presenter: no storage writes, no spell-rule changes.
 * Future sources can call show({title,path,battleId}) with existing art resolver.
 */
(function(){
 'use strict';
 let current=null,revision=0,hydration=0;
 const frame=()=>document.getElementById('combatArtViewer');

 function html(battleId){
  if(current&&String(current.battleId)!==String(battleId||'')){current=null;++revision}
  return '<section class="combat-art-viewer" id="combatArtViewer" data-battle-id="'+String(battleId||'').replace(/[^a-zA-Z0-9_-]/g,'')+'" aria-label="Bildvisare i strid">'+
   '<div class="combat-art-viewer-head"><span class="combat-art-viewer-eyebrow">✦ ARCANE GALLERY</span>'+
   '<button class="combat-art-viewer-clear" type="button" aria-label="Rensa bildvisaren" title="Rensa bildvisaren" onclick="window.aleaCombatArtViewer?.clear()">×</button></div>'+
   '<div class="combat-art-viewer-picture">'+
    '<img class="combat-art-viewer-image" alt="" decoding="async" hidden>'+
    '<span class="combat-art-viewer-empty" role="status">Klicka på en besvärjelse, ett föremål eller en kombatants bild.</span>'+
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
  type.textContent=current?.source==='spell'?'BESVÄRJELSE':current?.source==='equipment'?'UTRUSTNING':current?.source==='combatant'?'KOMBATANT':'BILDVISARE';
  section.classList.toggle('combat-art-viewer-photo',current?.source==='combatant');
  if(!current){
   empty.textContent='Klicka på en besvärjelse i kryptexen för att visa dess ikon här.';
   empty.hidden=false;return;
  }
  if(!current.path&&!current.src){
   empty.textContent='Ingen bild är kopplad till '+current.title+'.';
   empty.hidden=false;return;
  }
  const art=window.aleaSpellArt;
  const rev=revision;
  empty.textContent='Öppnar bilden…';
  empty.hidden=false;
  // Spell paths use the existing verified spell resolver; other sources use
  // the actual already-rendered image URL, never a remote user-supplied URL.
  const pending=current.src?Promise.resolve(current.src):
   (art?.validPath?.(current.path)&&typeof art.resolveUrl==='function'?
    art.resolveUrl(current.path):Promise.reject(new Error('Invalid spell art path')));
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
 function show({title,path,battleId,source='image',src=''}={}){
  if(!battleId)return false;
  current={
   title:String(title||'Bild').slice(0,130),
   path:String(path||''),src:String(src||''),battleId:String(battleId),
   source:String(source||'image')
  };
  ++revision;
  render();
  return true;
 }
 function clear(){current=null;++revision;render()}

 function trustedDisplayedImage(img){
  if(!img||img.tagName?.toLowerCase()!=='img'||!img.isConnected)return '';
  const value=String(img.currentSrc||img.src||'');
  if(!value||!img.complete||!img.naturalWidth)return '';
  // No arbitrary remote/data/javascript URLs; all images originate from
  // the combat UI and must be app assets, authenticated blob URLs or Supabase.
  try{
   const url=new URL(value,document.baseURI||window.location?.href||'https://invalid.local/');
   if(url.protocol==='blob:')return value;
   if(url.protocol!=='https:'&&url.protocol!=='http:')return '';
   const sameOrigin=window.location&&url.origin===window.location.origin;
   const supabaseOrigin=typeof SUPABASE_URL!=='undefined'&&url.origin===new URL(SUPABASE_URL).origin;
   if(!sameOrigin&&!supabaseOrigin)return '';
   if(supabaseOrigin&&!url.pathname.startsWith('/storage/v1/object/'))return '';
   return value;
  }catch(_){return ''}
 }
 function bind(root){
  if(!root||root.dataset.aleaGalleryBound==='1')return;
  root.dataset.aleaGalleryBound='1';
  const equipment='.combat-turn-equip-art .combat-turn-art';
  const portraits='.combatant-card .combat-row-portrait img, .combat-detail-header .combat-row-portrait img';
  const targets=equipment+', '+portraits;
  function handle(event){
   const target=event.target?.closest?.(targets);
   if(!target||!root.contains(target))return;
   const url=trustedDisplayedImage(target);
   if(!url)return;
   const isEquipment=!!target.closest('.combat-turn-equip-art');
   const box=isEquipment?target.closest('.combat-turn-equip-art'):target.closest('.combatant-card, .combat-detail-header');
   const title=isEquipment?
    (box?.querySelector('small')?.textContent||box?.querySelector('span')?.textContent||'Utrustning'):
    (box?.querySelector('.combatant-name-text')?.textContent||box?.querySelector('.combat-detail-identity h2')?.textContent||target.alt||'Kombatant');
   const fight=root.querySelector('#combatArtViewer');
   if(!fight)return;
   // Gallery interaction should never select a new target in combat.
   event.stopPropagation();
   if(event.type==='click')event.preventDefault();
   show({title,battleId:fight.dataset.battleId||fight.getAttribute('data-battle-id'),source:isEquipment?'equipment':'combatant',src:url});
  }
  root.addEventListener('click',handle,true);
  root.addEventListener('keydown',event=>{
   if(event.key!=='Enter'&&event.key!==' ')return;
   const target=event.target?.closest?.(targets);
   if(!target)return;
   event.preventDefault();handle({target,type:'click',stopPropagation:()=>event.stopPropagation(),preventDefault:()=>{}});
  },true);
  root.querySelectorAll(targets).forEach(img=>{
   img.tabIndex=0;img.setAttribute('role','button');
   img.setAttribute('aria-label','Visa '+(img.alt||'bild')+' i Arcane Gallery');
   img.style.cursor='zoom-in';
  });
 }

 window.aleaCombatArtViewer={html,render,show,clear,bind,get current(){return current?{...current}:null}};
})();
