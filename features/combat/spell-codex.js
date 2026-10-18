/* ARCANE SPELL CODEX — read-only spell master card.
 * Shares the approved Codex artwork; leaves editing and combat spell UI untouched.
 */
(function(){
 'use strict';
 const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let generation=0,returnFocus=null;
 function modal(){return document.getElementById('spellCodexModal')}
 function ensureModal(){
  let root=modal();
  if(root)return root;
  root=document.createElement('div');
  root.id='spellCodexModal';
  root.className='modalback hidden';
  root.innerHTML='<div class="modal spell-codex-panel" role="dialog" aria-modal="true" aria-labelledby="spellCodexTitle">'+
   '<div class="modalhead"><span class="spell-codex-icon" data-spell-codex-icon role="img" aria-label="Besvärjelseikon">✧</span>'+
   '<h2 id="spellCodexTitle" data-spell-codex-title>Besvärjelse</h2>'+
   '<button type="button" class="modalclose spell-codex-close" data-spell-codex-close aria-label="Stäng besvärjelsekort">Stäng</button></div>'+
   '<div class="spell-codex-body" data-spell-codex-body></div></div>';
  root.addEventListener('click',event=>{
   if(event.target===root||event.target.closest?.('[data-spell-codex-close]'))close();
  });
  document.body.appendChild(root);
  return root;
 }
 function close(){
  generation++;
  const root=modal();
  if(!root||root.classList.contains('hidden'))return;
  root.classList.add('hidden');
  if(returnFocus?.isConnected) returnFocus.focus?.();
  returnFocus=null;
 }
 function stat(label,value){
  return '<div class="spell-codex-stat"><span>'+safe(label)+'</span><strong>'+safe(value===null||value===undefined||value===''?'—':value)+'</strong></div>';
 }
 function paragraph(label,value){
  if(!value)return '';
  return '<section class="spell-codex-description"><h3>'+safe(label)+'</h3><p>'+safe(value)+'</p></section>';
 }
 async function loadArt(row,kind,selector,token){
  const art=window.aleaSpellArt?.artFor?.(row,kind);
  if(!art?.path||!window.aleaSpellArt?.resolveUrl)return;
  const root=modal(),target=root?.querySelector(selector);
  if(!target)return;
  try{
   const url=await window.aleaSpellArt.resolveUrl(art.path);
   if(!url||generation!==token||root!==modal()||root.classList.contains('hidden')||target!==root.querySelector(selector))return;
   const img=document.createElement('img');
   img.alt=(kind==='icon'?'Besvärjelseikon för ':'WIDE-illustration av ')+(row.name||'besvärjelsen');
   img.decoding='async';
   img.src=url;
   target.replaceChildren(img);
   target.classList.add('has-art');
  }catch(error){
   if(generation===token)console.warn('ARCANE SPELL CODEX: kunde inte läsa bild',error);
  }
 }
 function render(row){
  if(!row)return false;
  const root=ensureModal(),body=root.querySelector('[data-spell-codex-body]'),title=root.querySelector('[data-spell-codex-title]');
  if(!body||!title)return false;
  if(root.classList.contains('hidden'))returnFocus=document.activeElement;
  const school=typeof ruleMagicSchools!=='undefined'?ruleMagicSchools.find(s=>String(s.id)===String(row.school_id)):null;
  title.textContent=row.name||'Besvärjelse';
  const properties=[row.kvick?'Kvick (K)':null,row.fysisk?'Fysisk (F)':null,row.ritual?'Ritual (R)':null].filter(Boolean).join(', ')||'—';
  body.innerHTML='<div class="spell-codex-hero" data-spell-codex-hero><div class="spell-codex-hero-fallback">BESVÄRJELSE ILLUSTRATION WIDE saknas</div></div>'+
   '<div class="spell-codex-stats">'+stat('Magiskola',school?.name||'—')+stat('Skolvärde',row.school_value)+stat('Räckvidd',row.range_text)+stat('Varaktighet',row.duration_text)+'</div>'+
   '<div class="spell-codex-facts">'+stat('PSY / EG',row.psy_cost_text)+stat('Mål / område',row.target_text)+stat('Typ',properties)+'</div>'+
   paragraph('Beskrivning',row.description||'Ingen beskrivning är inlagd.')+
   paragraph('Effekt per effektgrad',row.effect_per_eg)+
   paragraph('Motstånd / särskilda regler',row.resistance_text)+
   paragraph('Noteringar',row.notes)+
   '<p class="spell-codex-source">Källa: '+safe(row.source_label||'Masterregister')+'</p>';
  const icon=root.querySelector('[data-spell-codex-icon]');
  icon?.replaceChildren(document.createTextNode('✧'));
  icon?.classList.remove('has-art');
  root.classList.remove('hidden');
  const token=++generation;
  void loadArt(row,'icon','[data-spell-codex-icon]',token);
  void loadArt(row,'wide','[data-spell-codex-hero]',token);
  root.querySelector('[data-spell-codex-close]')?.focus?.();
  return true;
 }
 function openFromAdmin(id){
  const row=typeof ruleSpells!=='undefined'?ruleSpells.find(r=>String(r.id)===String(id)):null;
  return row?render(row):false;
 }
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&modal()&&!modal().classList.contains('hidden')){
   event.preventDefault();close();
  }
 });
 window.aleaSpellCodex={openFromAdmin,render,close};
})();
