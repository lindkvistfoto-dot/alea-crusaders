/* Alea equipment art · v0.35.53
   Shared, admin-managed image assets for the weapon, armor and shield master registers. */
(function(){
 'use strict';
 const BUCKET='alea-equipment-art';
 const MAX_UPLOAD=12*1024*1024,MAX_STORED=3*1024*1024;
 const TYPES=new Set(['weapon','armor','shield','projectile']);
 const VALID_PATH=/^(?:(?:weapon|armor|shield)\/[0-9a-f-]{36}|armor\/(?:head|arms|torso|legs)\/[0-9a-f-]{36}|projectile\/[a-z][a-z0-9_]{1,50})\/[0-9a-f-]{36}\.(?:webp|png)$/;
 const ARMOR_ZONES=Object.freeze([['head','Huvud'],['arms','Armar'],['torso','Torso'],['legs','Ben']]);
 const armorColumn=z=>'image_'+z+'_path';
 function armorImagePathForSlot(rule,slot){
  const zone=slot==='head'||slot==='arms'||slot==='torso'||slot==='legs'?slot:null;
  return (zone?rule?.[armorColumn(zone)]:null)||rule?.image_path||null;
 }
 let baseUrl='',draft=null;
 function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function configure(url){baseUrl=String(url||'').replace(/\/$/,'')}
 function src(path){
  if(!VALID_PATH.test(String(path||''))||!baseUrl)return '';
  return baseUrl+'/storage/v1/object/public/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/');
 }
 function releasePreview(piece){if(piece?.previewUrl)URL.revokeObjectURL(piece.previewUrl)}
 function reset(){
  if(draft?.pieces)Object.values(draft.pieces).forEach(releasePreview);
  else releasePreview(draft);
  draft=null;
 }
 function visualPiece(piece){
  if(!piece)return '';
  const url=piece.previewUrl||(piece.removed?'':src(piece.original));
  return url?'<img src="'+escapeHtml(url)+'" alt="Förhandsvisning av föremålsbild">':'<span class="item-art-empty">Ingen bild – standardikon visas</span>';
 }
 function pieceStatus(piece){
  return piece?.blob?'Ny bild vald – sparas när du klickar Spara.':
   piece?.removed?'Bilden tas bort när du sparar.':
   piece?.original?'Sparad bild från registret.':'Ingen bild vald.';
 }
 function refresh(zone){
  const piece=draft?.pieces?(draft.pieces[zone]||null):draft;
  const id=draft?.pieces?'itemArtPreview-'+zone:'itemArtPreview';
  const statusId=draft?.pieces?'itemArtStatus-'+zone:'itemArtStatus';
  const host=document.getElementById(id);
  if(host)host.innerHTML=visualPiece(piece);
  const status=document.getElementById(statusId);
  if(status)status.textContent=pieceStatus(piece);
 }
 function makePiece(path){
  return {original:VALID_PATH.test(String(path||''))?path:null,removed:false,blob:null,previewUrl:null};
 }
 function startArmor(rule){
  reset();
  draft={kind:'armor',pieces:Object.fromEntries(ARMOR_ZONES.map(([zone])=>[zone,makePiece(rule?.[armorColumn(zone)])]))};
  return '<section class="item-art-editor item-art-armor wide" aria-label="Rustningsbilder">'+
   '<div class="item-art-heading"><strong>Rustningsbilder · fyra kroppsdelar</strong><span>Varje bild är knuten till sin kroppsdel i ordinarie rustningssystem. PNG och WebP med transparens rekommenderas.</span></div>'+
   '<div class="item-art-armor-grid">'+ARMOR_ZONES.map(([zone,label])=>{
    const piece=draft.pieces[zone];
    return '<div class="item-art-zone"><strong>'+label+'</strong>'+
     '<div id="itemArtPreview-'+zone+'" class="item-art-preview">'+visualPiece(piece)+'</div>'+
     '<div class="item-art-controls"><label class="item-art-upload">Välj bild<input type="file" accept="image/png,image/jpeg,image/webp" onchange="window.aleaEquipmentArt.choose(this.files[0],\''+zone+'\');this.value=\'\'"></label>'+
     '<button type="button" class="smallbtn" onclick="window.aleaEquipmentArt.remove(\''+zone+'\')">Ta bort</button>'+
     '<small id="itemArtStatus-'+zone+'">'+pieceStatus(piece)+'</small></div></div>';
   }).join('')+'</div><small>Max 12 MB vid val. Bilder anpassas till max 900 px och lagras centralt per rustningstyp.</small></section>';
 }
 function start(kind,rule){
  if(kind==='armor')return startArmor(rule);
  reset();
  if(!TYPES.has(kind))return '';
  draft={kind,...makePiece(rule?.image_path)};
  return '<section class="item-art-editor wide" aria-label="Inventariebild">'+
   '<div class="item-art-heading"><strong>Inventariebild</strong><span>Vapen, sköldar och projektiltyper kan ha en gemensam bild. PNG eller WebP med transparens rekommenderas.</span></div>'+
   '<div class="item-art-editor-content"><div id="itemArtPreview" class="item-art-preview">'+visualPiece(draft)+'</div>'+
   '<div class="item-art-controls"><label class="item-art-upload">Välj bild<input type="file" accept="image/png,image/jpeg,image/webp" onchange="window.aleaEquipmentArt.choose(this.files[0]);this.value=\'\'"></label>'+
   '<button type="button" class="smallbtn" onclick="window.aleaEquipmentArt.remove()">Ta bort bild</button>'+
   '<small id="itemArtStatus">'+pieceStatus(draft)+'</small><small>Bild normaliseras till max 900 px och sparas centralt, inte i rollfiguren.</small></div></div></section>';
 }
 async function choose(file,zone=null){
  if(!file||!draft)return;
  const active=draft?.pieces?draft.pieces[zone]:draft;
  if(!active)return;
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
   if((draft?.pieces?draft.pieces[zone]:draft)!==active)return;
   releasePreview(active);
   active.previewUrl=URL.createObjectURL(blob);
   active.blob=blob;active.removed=false;
   refresh(zone);
  }catch(e){alert('Kunde inte välja föremålsbild: '+e.message)}
  finally{if(source)URL.revokeObjectURL(source)}
 }
 function remove(zone=null){
  const active=draft?.pieces?draft.pieces[zone]:draft;
  if(!active)return;
  releasePreview(active);
  active.previewUrl=null;active.blob=null;active.removed=true;refresh(zone);
 }
 /* v0.35.69 — storage requests must never reuse an expired editor-open token. */
 function authHeaders(ctx,token){return {'apikey':ctx.key,'Authorization':'Bearer '+token}}
 async function expiredStorageJwt(response){
  if(response.status===401)return true;
  if(response.status!==400&&response.status!==403)return false;
  const message=await response.clone().text().catch(()=>'');
  return /(?:["']?exp["']?\s+claim\s+timestamp\s+check\s+failed|jwt\s*(?:token\s*)?expired|token(?:\s+has)?\s+expired)/i.test(message);
 }
 async function storageFetch(path,options,ctx){
  if(!ctx?.key||!ctx?.token&&typeof ctx?.getToken!=='function')
   throw new Error('Inloggningen saknas. Logga in igen.');
  const token=typeof ctx.getToken==='function'?await ctx.getToken():ctx.token;
  let headers={...authHeaders(ctx,token),...(options.headers||{})};
  const url=baseUrl+'/storage/v1/'+path;
  let response=await fetch(url,{...options,headers});
  if(typeof ctx.getToken==='function'&&await expiredStorageJwt(response)){
   headers={...headers,Authorization:'Bearer '+await ctx.getToken(true,token)};
   response=await fetch(url,{...options,headers});
  }
  return response;
 }
 async function removeStored(path,ctx){
  if(!src(path)||!ctx?.token&&typeof ctx?.getToken!=='function')return;
  const res=await storageFetch('object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'DELETE'},ctx);
  if(!res.ok&&res.status!==404)throw new Error('Kunde inte radera tidigare bild ('+res.status+').');
 }
 async function prepare(kind,id,ctx){
  if(!TYPES.has(kind)||!draft||draft.kind!==kind)throw new Error('Öppna föremålseditorn igen.');
  if(!(kind==='projectile'?/^[a-z][a-z0-9_]{1,50}$/:/^[0-9a-f-]{36}$/).test(id))throw new Error('Ogiltigt föremåls-ID.');
  const original=draft.original;
  if(draft.removed)return{path:null,old:original,uploaded:null};
  if(!draft.blob)return{path:original,old:null,uploaded:null};
  if((!ctx?.token&&typeof ctx?.getToken!=='function')||!ctx?.key||!baseUrl)throw new Error('Inloggning saknas.');
  const ext=draft.blob.type==='image/webp'?'webp':'png';
  const path=kind+'/'+id+'/'+crypto.randomUUID()+'.'+ext;
  const response=await storageFetch('object/'+BUCKET+'/'+path,{
   method:'POST',headers:{'Content-Type':draft.blob.type,'x-upsert':'false'},body:draft.blob
  },ctx);
  if(!response.ok){
   const data=await response.json().catch(()=>null);
   throw new Error(data?.message||data?.error||'Bilduppladdningen misslyckades ('+response.status+').');
  }
  return{path,old:original,uploaded:path};
 }
 async function uploadPiece(blob,path,ctx){
  const response=await storageFetch('object/'+BUCKET+'/'+path,{
   method:'POST',headers:{'Content-Type':blob.type,'x-upsert':'false'},body:blob
  },ctx);
  if(!response.ok){
   const data=await response.json().catch(()=>null);
   throw new Error(data?.message||data?.error||'Bilduppladdningen misslyckades ('+response.status+').');
  }
 }
 async function prepareArmor(id,ctx){
  // Snapshot all four zones BEFORE the first await. The global editor draft may
  // be reset by a modal close, navigation, or another editor while uploads run.
  const editor=draft;
  if(editor?.kind!=='armor'||!editor.pieces)throw new Error('Öppna rustningseditorn igen.');
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Ogiltigt rustnings-ID.');
  const selected=ARMOR_ZONES.map(([zone])=>{
   const piece=editor.pieces[zone];
   if(!piece)throw new Error('Bildfältet '+zone+' saknas. Öppna rustningen igen.');
   return {zone,original:piece.original,removed:piece.removed,blob:piece.blob};
  });
  const paths={},old=[],uploaded=[];
  try{
   for(const part of selected){
    const {zone}=part,key=armorColumn(zone);
    if(part.removed){paths[key]=null;if(part.original)old.push(part.original);continue;}
    if(!part.blob){paths[key]=part.original;continue;}
    if((!ctx?.token&&typeof ctx?.getToken!=='function')||!ctx?.key||!baseUrl)throw new Error('Inloggning saknas.');
    const ext=part.blob.type==='image/webp'?'webp':'png';
    const path='armor/'+zone+'/'+id+'/'+crypto.randomUUID()+'.'+ext;
    await uploadPiece(part.blob,path,ctx);
    uploaded.push(path);
    paths[key]=path;
    if(part.original)old.push(part.original);
   }
  }catch(e){
   await Promise.all(uploaded.map(path=>removeStored(path,ctx).catch(()=>{})));
   throw e;
  }
  return {paths,old,uploaded};
 }
 function thumbnail(path,fallback,caption=''){
  const url=src(path);
  return url?'<span class="admin-weapon-icon item-art-thumb" title="Inventariebild"><img src="'+escapeHtml(url)+'" alt="'+escapeHtml(caption)+'" loading="lazy"><small>Bild</small></span>':fallback;
 }
 function imageTag(path){
  const url=src(path);
  return url?'<img class="gandalf-equip-art" src="'+escapeHtml(url)+'" alt="" loading="lazy">':'';
 }
 window.aleaEquipmentArt={configure,src,start,startArmor,choose,remove,reset,prepare,prepareArmor,removeStored,thumbnail,imageTag,armorImagePathForSlot,ARMOR_ZONES};
})();
