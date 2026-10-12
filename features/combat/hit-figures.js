/* Alea Crusaders v0.35.130 – global race/gender hit-location image library.
 * Uses the existing authenticated Supabase Storage and admin tooling.
 * No campaign-material visibility changes. Client selection is display-only. */
(function(){
 'use strict';
 const BUCKET='alea-hit-figures', MAX_SOURCE=12*1024*1024, MAX_STORED=4*1024*1024;
 const PARTS=Object.freeze([
  ['neutral','Neutral figur'],['head','Huvud och hals'],
  ['chest','Bröstkorg och axlar'],['abdomen','Mage, skrev och bäcken'],
  ['left_arm','Vänster arm'],['right_arm','Höger arm'],
  ['left_leg','Vänster ben'],['right_leg','Höger ben']
 ]);
 const REQUIRED=PARTS.map(([k])=>k);
 const SAFE_PATH=/^figure\/[0-9a-f-]{36}\.webp$/;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 let rows=null,loadPending=null,races=null,selection={race:'manniska',gender:'male'};
 let saving=false,adminSeq=0;
 const blobUrls=new Map();
 const pathPart=s=>String(s).split('/').map(encodeURIComponent).join('/');
 const canManage=()=>{try{return Boolean(activeUser()?.admin)}catch(_){return false}};
 const notice=(s,err=false)=>{
  const target=document.getElementById('hitFigureStatus');
  if(target){target.textContent=s||'';target.classList.toggle('is-error',!!err)}
 };
 function normalizeRace(value){
  const key=String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64);
  if(!key||['human','humanoid','menniska','human_male','human_female'].includes(key))return 'manniska';
  if(key.startsWith('humanoid_'))return key.slice('humanoid_'.length);
  return key;
 }
 function normalizeGender(value){
  const v=String(value||'').trim().toLocaleLowerCase('sv-SE');
  return ['kvinna','kvinnlig','female','woman','f','she'].includes(v)?'female':'male';
 }
 function candidateKeys(race,gender){
  const r=normalizeRace(race),g=normalizeGender(gender);
  const unique=new Set();
  for(const [rr,gg] of [[r,g],[r,'male'],['manniska',g],['manniska','male']])
   unique.add(rr+'|'+gg);
  return [...unique];
 }
 async function list(force=false){
  if(rows&&!force)return rows;
  if(loadPending&&!force)return loadPending;
  const request=dbJson('rule_hit_figure_images?select=id,race_id,gender,body_part,image_path,updated_at&order=race_id.asc,gender.asc,body_part.asc')
   .then(data=>{rows=(Array.isArray(data)?data:[]).filter(r=>SAFE_PATH.test(r.image_path));return rows});
  loadPending=request;
  try{return await request}finally{if(loadPending===request)loadPending=null}
 }
 async function loadRaces(){
  if(races)return races;
  const data=await dbJson('rule_races?select=id,name&order=sort_order.asc,name.asc');
  races=(Array.isArray(data)?data:[]).filter(r=>r.id&&r.name);
  return races;
 }
 function group(rules){
  const packs=new Map();
  for(const r of rules||[]){
   const key=r.race_id+'|'+r.gender;
   if(!packs.has(key))packs.set(key,{});
   packs.get(key)[r.body_part]=r;
  }
  return packs;
 }
 function choosePack(race,gender,records=rows||[]){
  const packs=group(records);
  for(const key of candidateKeys(race,gender)){
   const series=packs.get(key);
   if(series&&REQUIRED.every(part=>series[part]))return {key,images:series};
  }
  return null;
 }
 async function blobUrl(path){
  if(!SAFE_PATH.test(String(path||'')))throw Error('Ogiltig bildreferens.');
  if(blobUrls.has(path))return blobUrls.get(path);
  const promise=(async()=>{
   const res=await mapStorageFetch('object/'+BUCKET+'/'+pathPart(path),{method:'GET'});
   if(!res.ok)throw Error('Bilden kunde inte läsas ('+res.status+').');
   const blob=await res.blob();
   if(!blob.type.startsWith('image/'))throw Error('Ogiltigt bildformat.');
   return URL.createObjectURL(blob);
  })();
  blobUrls.set(path,promise);
  try{return await promise}catch(e){blobUrls.delete(path);throw e}
 }
 async function hydrate(root=document){
  const imgs=Array.from(root.querySelectorAll?.('img.combat-hit-art-image[data-hit-part]')||[]);
  if(!imgs.length)return;
  let available;
  try{available=await list()}catch(error){
   console.warn('Träffområdesbilder kunde inte läsas; anatomisk reserv visas.',error);return;
  }
  for(const img of imgs){
   if(!img.isConnected)return;
   const part=img.dataset.hitPart,pack=choosePack(img.dataset.hitRace,img.dataset.hitGender,available);
   const record=pack?.images[part];
   if(!record)continue;
   const requested=record.image_path;
   img.dataset.hitRequested=requested;
   blobUrl(requested).then(url=>{
    if(!img.isConnected||img.dataset.hitRequested!==requested)return;
    img.onload=()=>{
     if(img.isConnected&&img.dataset.hitRequested===requested)
      img.parentElement?.classList.add('combat-hit-art-loaded');
    };
    img.onerror=()=>img.parentElement?.classList.add('combat-hit-art-failed');
    img.src=url;
   }).catch(error=>console.warn('Träffbild saknas; anatomisk reserv visas.',requested,error));
  }
 }
 function selectedRows(){return (rows||[]).filter(r=>r.race_id===selection.race&&r.gender===selection.gender)}
 function chooseSelection(race,gender){
  if(saving)return;
  if(race)selection.race=String(race);
  if(gender)selection.gender=normalizeGender(gender);
  void renderAdmin();
 }
 async function processedImage(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_SOURCE||file.size<1)
   throw Error('Välj PNG, JPG eller WebP på högst 12 MB.');
  const source=URL.createObjectURL(file);
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Ogiltig bild.'));img.src=source});
   if(img.naturalWidth<100||img.naturalHeight<150)throw Error('Bilden behöver vara minst 100 × 150 pixlar.');
   if(Math.abs(img.naturalWidth/img.naturalHeight-2/3)>0.025)
    throw Error('Bilderna måste ha formatet 2:3, exempelvis 1024 × 1536.');
   const factor=Math.min(1,1024/img.naturalWidth,1536/img.naturalHeight);
   const canvas=document.createElement('canvas');
   canvas.width=Math.round(img.naturalWidth*factor);
   canvas.height=Math.round(img.naturalHeight*factor);
   const ctx=canvas.getContext('2d',{alpha:true});
   if(!ctx)throw Error('Bildbearbetning stöds inte i den här webbläsaren.');
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
   if(!blob||blob.size>MAX_STORED)throw Error('Bilden är större än 4 MB efter bearbetning.');
   return blob;
  }finally{URL.revokeObjectURL(source)}
 }
 async function upload(part,file){
  if(!file||!REQUIRED.includes(part)||!canManage()||saving)return;
  if(!(await loadRaces()).some(r=>r.id===selection.race)){notice('Välj en giltig ras.',true);return}
  saving=true;
  const savedSelection={...selection};
  const path='figure/'+crypto.randomUUID()+'.webp';
  let uploaded=false;
  try{
   notice('Bearbetar och laddar upp '+(PARTS.find(p=>p[0]===part)?.[1]||part)+'…');
   const blob=await processedImage(file);
   const old=(await list()).find(r=>r.race_id===savedSelection.race&&r.gender===savedSelection.gender&&r.body_part===part);
   const res=await mapStorageFetch('object/'+BUCKET+'/'+pathPart(path),{
    method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob
   });
   if(!res.ok){const e=await res.json().catch(()=>({}));throw Error(e.message||e.error||'Lagringen misslyckades.')}
   uploaded=true;
   await dbJson('rule_hit_figure_images?on_conflict=race_id,gender,body_part',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({race_id:savedSelection.race,gender:savedSelection.gender,body_part:part,image_path:path,updated_at:new Date().toISOString()})
   });
   rows=null;await list(true);
   if(old?.image_path&&old.image_path!==path)await cleanup(old.image_path);
   await renderAdmin();
   await hydrate(document);
   notice('✓ Bilden är sparad för '+savedSelection.race+' / '+(savedSelection.gender==='female'?'kvinna':'man')+'.');
   return true;
  }catch(e){
   if(uploaded)await cleanup(path);
   notice('Uppladdningen misslyckades: '+(e.message||e),true);
   return false;
  }finally{saving=false}
 }
 /* Imports up to eight named files at once; also supports single-slot upload.
  * Naming convention: neutral.webp, head.png, chest.webp, etc. */
 async function uploadBatch(listOfFiles){
  if(!canManage()||saving)return;
  const files=Array.from(listOfFiles||[]);
  const parts=new Map();
  for(const file of files){
   const name=String(file.name||'').replace(/\.(png|jpe?g|webp)$/i,'')
    .trim().toLowerCase().replace(/[\s-]+/g,'_');
   if(!REQUIRED.includes(name)){
    notice('Filnamnet '+file.name+' motsvarar inget träffområde. Använd exempelvis head.webp eller ladda upp filen på respektive bildplats.',true);
    return;
   }
   if(parts.has(name)){notice('Du har valt flera bilder för '+name+'.',true);return}
   parts.set(name,file);
  }
  if(!parts.size)return;
  let ok=0;
  for(const [part,file] of parts){
   if(await upload(part,file)===true)ok++;
   else break;
  }
  notice(ok===parts.size
   ?'✓ '+ok+' bild(er) har laddats upp till vald ras och kön.'
   :ok+' av '+parts.size+' bilder sparades. Kontrollera felet och försök igen.',ok!==parts.size);
 }
 async function cleanup(path){
  if(!SAFE_PATH.test(String(path||'')))return;
  try{await mapStorageFetch('object/'+BUCKET+'/'+pathPart(path),{method:'DELETE'})}
  catch(e){console.warn('Kunde inte rensa ersatt träffbild.',e)}
  const cached=blobUrls.get(path);blobUrls.delete(path);
  if(cached)Promise.resolve(cached).then(url=>URL.revokeObjectURL(url)).catch(()=>{});
 }
 async function remove(part){
  if(!canManage()||saving||!REQUIRED.includes(part))return;
  const old=selectedRows().find(r=>r.body_part===part);
  if(!old||!confirm('Ta bort bilden "'+(PARTS.find(p=>p[0]===part)?.[1]||part)+'" för vald ras och kön? Ofullständig serie används inte i strid.'))return;
  saving=true;
  try{
   await dbJson('rule_hit_figure_images?id=eq.'+encodeURIComponent(old.id),{
    method:'DELETE',headers:{Prefer:'return=minimal'}
   });
   rows=null;await list(true);await cleanup(old.image_path);await renderAdmin();
   notice('Bilden är borttagen. När serien är ofullständig används en reservserie.');
  }catch(e){notice('Kunde inte ta bort bilden: '+e.message,true)}
  finally{saving=false}
 }
 async function renderAdmin(){
  if(!canManage())return;
  const host=document.getElementById('adminHitFigures');
  if(!host)return;
  const seq=++adminSeq;
  host.textContent='Läser bildserier och rasregister…';
  let existing,known;
  try{[existing,known]=await Promise.all([list(),loadRaces()]);}
  catch(e){if(seq===adminSeq)host.textContent='Kunde inte läsa registret: '+e.message;return}
  if(seq!==adminSeq)return;
  if(!known.some(r=>r.id===selection.race))selection.race=known.find(r=>r.id==='manniska')?.id||known[0]?.id||'manniska';
  const rowsForSelection=selectedRows(),byPart=new Map(rowsForSelection.map(r=>[r.body_part,r]));
  const groups=group(existing);
  const summary=[...groups].map(([key,p])=>{
   const [race,gender]=key.split('|'),found=REQUIRED.filter(part=>p[part]).length;
   const name=known.find(r=>r.id===race)?.name||race;
   return '<div class="hit-figure-series-status"><b>'+escape(name)+' · '+(gender==='female'?'Kvinna':'Man')+'</b><span>'+found+'/8 '+(found===8?'· komplett':'· ofullständig')+'</span></div>';
  }).join('');
  const actual=choosePack(selection.race,selection.gender,existing);
  const note=actual
   ?'I strid används bildserien '+escape(known.find(r=>r.id===actual.key.split('|')[0])?.name||actual.key.split('|')[0])+' / '+(actual.key.endsWith('|female')?'kvinna':'man')+'.'
   :'Ingen komplett bildserie finns ännu. Den anatomiska reservfiguren visas.';
  host.innerHTML=
   '<div class="hit-figure-toolbar"><label>Ras<select id="hitFigureRaceSelect" onchange="aleaHitFigures.chooseSelection(this.value,null)">'+
   known.map(r=>'<option value="'+escape(r.id)+'"'+(r.id===selection.race?' selected':'')+'>'+escape(r.name)+'</option>').join('')+
   '</select></label><label>Kön<select id="hitFigureGenderSelect" onchange="aleaHitFigures.chooseSelection(null,this.value)">'+
   '<option value="male"'+(selection.gender==='male'?' selected':'')+'>Man</option>'+
   '<option value="female"'+(selection.gender==='female'?' selected':'')+'>Kvinna</option>'+
   '</select></label></div>'+
   '<p class="hit-figure-note">'+note+'</p>'+
   '<label class="smallbtn hit-figure-bulk">Ladda upp flera bilder samtidigt (neutral.webp, head.webp osv.)'+
   '<input type="file" multiple accept="image/png,image/jpeg,image/webp" onchange="aleaHitFigures.uploadBatch(this.files);this.value=\\'\\'"></label>'+
   '<div class="hit-figure-grid">'+PARTS.map(([part,label])=>{
    const row=byPart.get(part);
    return '<article class="hit-figure-tile"><div class="hit-figure-preview">'+
     (row?'<img data-hit-figure-preview="'+escape(row.id)+'" alt="'+escape(label)+'" loading="lazy">':'<span>Ingen bild</span>')+
     '</div><strong>'+escape(label)+'</strong>'+
     '<label class="smallbtn hit-figure-file"> '+(row?'Byt bild':'Ladda upp')+
     '<input type="file" accept="image/png,image/jpeg,image/webp" data-part="'+escape(part)+'" onchange="aleaHitFigures.upload(this.dataset.part,this.files[0]);this.value=\'\'"></label>'+
     (row?'<button type="button" class="smallbtn hit-figure-remove" onclick="aleaHitFigures.remove(\''+escape(part)+'\')">Ta bort</button>':'')+
     '</article>';
   }).join('')+'</div>'+
   '<h3>Registrerade bildserier</h3><div class="hit-figure-series">'+
   (summary||'<span class="muted">Inga serier har laddats upp än.</span>')+'</div>';
  for(const row of rowsForSelection){
   const img=host.querySelector('[data-hit-figure-preview="'+row.id+'"]');
   if(!img)continue;
   blobUrl(row.image_path).then(url=>{if(seq===adminSeq&&img.isConnected)img.src=url})
    .catch(()=>{if(img.isConnected)img.alt='Bildfil saknas'});
  }
 }
 window.aleaHitFigures=Object.freeze({
  parts:PARTS,normalizeRace,normalizeGender,candidateKeys,choosePack,
  list,hydrate,renderAdmin,chooseSelection,upload,uploadBatch,remove
 });
})();
