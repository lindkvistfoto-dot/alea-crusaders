/* v0.35.98 — shared section help. Other sections call
   aleaSectionHelp.register(key,{title,paragraphs:[...]}) and .button(key). */
(function(root){
 'use strict';
 const topics=new Map();
 const clean=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[char]);
 let dialog=null,priorFocus=null;
 function register(key,definition){
  const id=String(key||'');
  if(!/^[a-z][a-z0-9_-]{0,63}$/.test(id))throw new Error('Ogiltigt hjälpämne');
  if(!definition||!String(definition.title||'').trim())throw new Error('Hjälpämne saknar titel');
  const paragraphs=Array.isArray(definition.paragraphs)?definition.paragraphs:[definition.text||''];
  topics.set(id,{title:String(definition.title),paragraphs:paragraphs.map(v=>String(v||'')).filter(Boolean)});
 }
 function button(key){
  const id=String(key||''),topic=topics.get(id);
  if(!topic)return '';
  return '<button type="button" class="alea-section-help-trigger" '+
   'aria-label="Mer information om '+clean(topic.title)+'" title="Mer information" '+
   'onclick="window.aleaSectionHelp.open(\''+id+'\')"><span aria-hidden="true">?</span></button>'
 }
 function createDialog(){
  if(dialog?.isConnected)return dialog;
  if(typeof document==='undefined')return null;
  dialog=document.createElement('dialog');
  dialog.id='aleaSectionHelpDialog';
  dialog.className='alea-section-help-dialog';
  dialog.setAttribute('aria-labelledby','aleaSectionHelpTitle');
  dialog.addEventListener('click',event=>{if(event.target===dialog)close()});
  dialog.addEventListener('close',()=>{if(priorFocus?.isConnected)priorFocus.focus();priorFocus=null});
  document.body.appendChild(dialog);
  return dialog
 }
 function open(key){
  const topic=topics.get(String(key||'')),node=createDialog();
  if(!topic||!node)return false;
  priorFocus=document.activeElement;
  node.innerHTML='<div class="alea-section-help-content">'+
   '<div class="alea-section-help-heading"><h2 id="aleaSectionHelpTitle">'+clean(topic.title)+'</h2>'+
   '<button type="button" class="alea-section-help-close" onclick="window.aleaSectionHelp.close()" aria-label="Stäng information">×</button></div>'+
   topic.paragraphs.map(line=>'<p>'+clean(line)+'</p>').join('')+
   '</div>';
  if(typeof node.showModal==='function'&&!node.open)node.showModal();
  else node.setAttribute('open','');
  node.querySelector('.alea-section-help-close')?.focus();
  return true
 }
 function close(){
  if(!dialog)return;
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();
  else{dialog.removeAttribute('open');if(priorFocus?.isConnected)priorFocus.focus();priorFocus=null}
 }
 register('provisions',{
  title:'Mat & proviant',
  paragraphs:[
   'Mat och vatten räknas separat i hela dagar per rollperson. Ändra förråden med plus och minus. I redigeringsläge kan du ange antal direkt.',
   'Mat: en dag förbrukas när SL startar en ny kampanjdag. Om en måltid betalats på värdshuset under dagen dras ingen medhavd mat vid nästa dagbyte. Reskost ökar antalet matdagar.',
   'Vatten: en dag förbrukas vid varje ny kampanjdag oavsett måltid. En värdshusmåltid påverkar inte vattenförrådet.',
   'Förråden kan aldrig understiga noll.'
  ]
 });
 root.aleaSectionHelp=Object.freeze({register,button,open,close,has:key=>topics.has(String(key||''))});
})(typeof window!=='undefined'?window:globalThis);
