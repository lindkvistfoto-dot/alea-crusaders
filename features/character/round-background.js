/* Personal round illustration. Stored as a private WebP on the character
 * (not inside character JSON, where large files would break sync/backup).
 * Each upload has a fresh immutable path for existing encounter snapshots. */
(function(){
 'use strict';
 const BUCKET='alea-character-round-backgrounds';
 const PATH=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
 const MAX_SOURCE=12*1024*1024,MAX_OUTPUT=6*1024*1024;
 const cache=new Map();
 let busy=false,drawToken=0;
 const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const scope=(character,path)=>Boolean(
  character?._dbId&&centralCampaignId&&PATH.test(String(path||''))&&
  String(path).startsWith(String(centralCampaignId)+'/'+String(character._dbId)+'/')
 );
 const canEdit=character=>Boolean(character?._dbId&&centralCampaignId&&canEditCharacter(character));
 const getPath=character=>scope(character,character?.roundBackgroundPath)?character.roundBackgroundPath:'';
 const status=message=>{const host=document.getElementById('characterRoundStatus');if(host)host.textContent=message||''};
 function getUrl(path){
  if(!PATH.test(String(path||'')))return Promise.resolve('');
  if(cache.has(path))return Promise.resolve(cache.get(path));
  return (async()=>{
   const res=await mapStorageFetch('object/'+BUCKET+'/'+encodeStoragePath(path),{method:'GET'});
   if(!res.ok)throw Error('Kunde inte läsa rollpersonens rundbild ('+res.status+').');
   const blob=await res.blob();
   if(!blob.type.startsWith('image/'))throw Error('Ogiltigt bildformat.');
   const url=URL.createObjectURL(blob);
   cache.set(path,url);return url;
  })();
 }
 function render(){
  const host=document.getElementById('characterRoundGallery');
  if(!host)return;
  const character=typeof current==='undefined'?null:current;
  const path=getPath(character),editable=canEdit(character);
  const token=++drawToken;
  host.innerHTML='<div class="character-round-heading"><strong>Rundbakgrund i strid</strong><small>Panoramabild som visas när rollpersonen är aktiv kombattant. Utan egen bild slumpas ett motiv från adminbiblioteket.</small></div>'+
   '<div class="character-round-preview" id="characterRoundPreview">'+
    (path?'<span>Laddar bild…</span>':'<span>Ingen personlig rundbakgrund – slumpas från adminbiblioteket</span>')+
   '</div>'+
   (editable?'<div class="character-round-actions"><label class="smallbtn">✧ '+(path?'Byt bild':'Ladda upp bild')+
    '<input type="file" accept="image/png,image/jpeg,image/webp" data-round-upload class="character-round-file"></label>'+
    (path?'<button class="smallbtn" type="button" data-round-remove>Ta bort bild</button>':'')+
    '<small>PNG, JPG eller WebP · max 12 MB · bred bild rekommenderas</small></div>':'')+
   '<p id="characterRoundStatus" aria-live="polite" role="status"></p>';
  host.querySelector('[data-round-upload]')?.addEventListener('change',event=>{
   const file=event.target.files?.[0];event.target.value='';
   if(file)void upload(character,file);
  });
  host.querySelector('[data-round-remove]')?.addEventListener('click',()=>void remove(character));
  if(!path)return;
  void getUrl(path).then(url=>{
   if(token!==drawToken||current!==character||!host.isConnected)return;
   const preview=host.querySelector('#characterRoundPreview');
   if(preview&&url){preview.textContent='';const img=document.createElement('img');img.src=url;img.alt='Personlig rundbakgrund';preview.appendChild(img)}
  }).catch(e=>{if(token===drawToken)status('Kunde inte läsa bilden: '+(e.message||e))});
 }
 async function convert(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_SOURCE)
   throw Error('Välj PNG, JPG eller WebP på högst 12 MB.');
  const url=URL.createObjectURL(file);
  try{
   const image=new Image();
   await new Promise((ok,fail)=>{
    image.onload=ok;image.onerror=()=>fail(Error('Kunde inte läsa bildfilen.'));image.src=url;
   });
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>60000000)
    throw Error('Bilden är för stor eller har ogiltiga mått.');
   const ratio=Math.min(1,1920/image.naturalWidth,1200/image.naturalHeight);
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
   const context=canvas.getContext('2d');
   if(!context)throw Error('Bildbearbetning stöds inte i webbläsaren.');
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise(done=>canvas.toBlob(done,'image/webp',0.84));
   if(!blob||blob.type!=='image/webp'||blob.size>MAX_OUTPUT)
    throw Error('Bilden kunde inte sparas som WebP under 6 MB.');
   return blob;
  }finally{URL.revokeObjectURL(url)}
 }
 async function upload(character,file){
  if(!canEdit(character)||busy)return;
  busy=true;status('Laddar upp rundbakgrund…');
  const path=centralCampaignId+'/'+character._dbId+'/'+crypto.randomUUID()+'.webp';
  let didUpload=false;
  try{
   const blob=await convert(file);
   if(!canEdit(character))throw Error('Du har inte längre behörighet att ändra bilden.');
   const response=await mapStorageFetch('object/'+BUCKET+'/'+encodeStoragePath(path),{
    method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob
   });
   if(!response.ok){const body=await response.json().catch(()=>null);throw Error(body?.message||body?.error||'Lagringsfel '+response.status)}
   didUpload=true;
   await dbJson('characters?id=eq.'+encodeURIComponent(character._dbId)+'&campaign_id=eq.'+encodeURIComponent(centralCampaignId),{
    method:'PATCH',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({round_background_path:path})
   });
   character.roundBackgroundPath=path;
   if(current===character){render();status('✓ Personlig rundbakgrund sparad.')}
   if(typeof showBackupToast==='function')showBackupToast('✓ Rundbakgrund sparad');
  }catch(e){
   if(didUpload)await mapStorageFetch('object/'+BUCKET+'/'+encodeStoragePath(path),{method:'DELETE'}).catch(()=>{});
   status('Kunde inte spara bild: '+(e.message||e));
   console.error('Uppladdning av rundbakgrund misslyckades',e);
  }finally{busy=false}
 }
 async function remove(character){
  if(!canEdit(character)||busy||!getPath(character))return;
  if(!confirm('Ta bort personlig rundbakgrund? Då används en slumpad bild från adminbiblioteket i nya strider.'))return;
  busy=true;status('Tar bort kopplingen…');
  try{
   await dbJson('characters?id=eq.'+encodeURIComponent(character._dbId)+'&campaign_id=eq.'+encodeURIComponent(centralCampaignId),{
    method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({round_background_path:null})
   });
   character.roundBackgroundPath='';
   if(current===character){render();status('✓ Ingen personlig bild. Adminbiblioteket används.')}
  }catch(e){status('Kunde inte ta bort bilden: '+(e.message||e))}
  finally{busy=false}
 }
 window.aleaCharacterRoundBackground={render,upload,remove,resolveUrl:getUrl,getPath};
})();
