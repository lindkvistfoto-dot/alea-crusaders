/* Alea equipment art · v0.35.50
   Shared, admin-managed image assets for the weapon, armor and shield master registers. */
(function(){
 'use strict';
 const BUCKET='alea-equipment-art';
 const MAX_UPLOAD=12*1024*1024,MAX_STORED=3*1024*1024;
 const TYPES=new Set(['weapon','armor','shield']);
 const VALID_PATH=/^(weapon|armor|shield)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|png)$/;
 let baseUrl='',draft=null;
 function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function configure(url){baseUrl=String(url||'').replace(/\/$/,'')}
 function src(path){
  if(!VALID_PATH.test(String(path||''))||!baseUrl)return '';
  return baseUrl+'/storage/v1/object/public/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/');
 }
 function reset(){
  if(draft?.previewUrl)URL.revokeObjectURL(draft.previewUrl);
  draft=null;
 }
 function visual(){
  if(!draft)return '';
  const url=draft.previewUrl||(draft.removed?'':src(draft.original));
  return url?'<img src="'+escapeHtml(url)+'" alt="Förhandsvisning av föremålsbild">':'<span class="item-art-empty">Ingen bild – standardikon visas</span>';
 }
 function refresh(){
  const host=document.getElementById('itemArtPreview');
  if(host)host.innerHTML=visual();
  const status=document.getElementById('itemArtStatus');
  if(status)status.textContent=draft?.blob?'Ny bild vald – sparas tillsammans med registerposten.':draft?.removed?'Bilden tas bort när du sparar.':draft?.original?'Sparad bild från registret.':'Välj en bild till föremålet.';
 }
 function start(kind,rule){
  reset();
  if(!TYPES.has(kind))return '';
  draft={kind,original:VALID_PATH.test(String(rule?.image_path||''))?rule.image_path:null,removed:false,blob:null,previewUrl:null};
  return '<section class="item-art-editor wide" aria-label="Inventariebild">'+
   '<div class="item-art-heading"><strong>Inventariebild</strong><span>Vapen, sköldar och rustning kan ha unik bild. PNG eller WebP med transparens rekommenderas.</span></div>'+
   '<div class="item-art-editor-content"><div id="itemArtPreview" class="item-art-preview">'+visual()+'</div>'+
   '<div class="item-art-controls"><label class="item-art-upload">Välj bild<input type="file" accept="image/png,image/jpeg,image/webp" onchange="window.aleaEquipmentArt.choose(this.files[0]);this.value=\'\'"></label>'+
   '<button type="button" class="smallbtn" onclick="window.aleaEquipmentArt.remove()">Ta bort bild</button>'+
   '<small id="itemArtStatus"></small><small>Bild normaliseras till max 900 px och sparas centralt, inte i rollfiguren.</small></div></div></section>';
 }
 async function choose(file){
  if(!file||!draft)return;
  const active=draft;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_UPLOAD){
   alert('Välj PNG, JPG eller WebP, högst 12 MB.');return;
  }
  let source='';
  try{
   source=URL.createObjectURL(file);
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Bilden kan inte läsas.'));img.src=source});
   if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>60000000)throw new Error('Bilden är för stor.');
   const scale=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx)throw new Error('Kunde inte behandla bilden.');
   ctx.clearRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));
   if(!blob||blob.type!=='image/webp')blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob||blob.size>MAX_STORED)throw new Error('Bilden är för stor efter bearbetning (max 3 MB).');
   if(draft!==active)return;
   if(active.previewUrl)URL.revokeObjectURL(active.previewUrl);
   active.previewUrl=URL.createObjectURL(blob);
   active.blob=blob;active.removed=false;
   refresh();
  }catch(e){alert('Kunde inte välja föremålsbild: '+e.message)}
  finally{if(source)URL.revokeObjectURL(source)}
 }
 function remove(){
  if(!draft)return;
  if(draft.previewUrl)URL.revokeObjectURL(draft.previewUrl);
  draft.previewUrl=null;draft.blob=null;draft.removed=true;refresh();
 }
 function authHeaders(ctx){return {'apikey':ctx.key,'Authorization':'Bearer '+ctx.token}}
 async function removeStored(path,ctx){
  if(!src(path)||!ctx?.token)return;
  const res=await fetch(baseUrl+'/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{
   method:'DELETE',headers:authHeaders(ctx)
  });
  if(!res.ok&&res.status!==404)throw new Error('Kunde inte radera tidigare bild ('+res.status+').');
 }
 async function prepare(kind,id,ctx){
  if(!TYPES.has(kind)||!draft||draft.kind!==kind)throw new Error('Öppna föremålseditorn igen.');
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Ogiltigt föremåls-ID.');
  const original=draft.original;
  if(draft.removed)return{path:null,old:original,uploaded:null};
  if(!draft.blob)return{path:original,old:null,uploaded:null};
  if(!ctx?.token||!ctx?.key||!baseUrl)throw new Error('Inloggning saknas.');
  const ext=draft.blob.type==='image/webp'?'webp':'png';
  const path=kind+'/'+id+'/'+crypto.randomUUID()+'.'+ext;
  const response=await fetch(baseUrl+'/storage/v1/object/'+BUCKET+'/'+path,{
   method:'POST',headers:{...authHeaders(ctx),'Content-Type':draft.blob.type,'x-upsert':'false'},body:draft.blob
  });
  if(!response.ok){
   const data=await response.json().catch(()=>null);
   throw new Error(data?.message||data?.error||'Bilduppladdningen misslyckades ('+response.status+').');
  }
  return{path,old:original,uploaded:path};
 }
 function thumbnail(path,fallback,caption=''){
  const url=src(path);
  return url?'<span class="admin-weapon-icon item-art-thumb" title="Inventariebild"><img src="'+escapeHtml(url)+'" alt="'+escapeHtml(caption)+'" loading="lazy"><small>Bild</small></span>':fallback;
 }
 function imageTag(path){
  const url=src(path);
  return url?'<img class="gandalf-equip-art" src="'+escapeHtml(url)+'" alt="" loading="lazy">':'';
 }
 window.aleaEquipmentArt={configure,src,start,choose,remove,reset,prepare,removeStored,thumbnail,imageTag};
})();
