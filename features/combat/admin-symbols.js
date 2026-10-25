/* HERMES 4.0 admin intake for symbol art. Uploads are staged server-side; a receipt is not publication. */
(function(){
 'use strict';
 const host=document.getElementById('adminMagicSymbolTable');
 const status=document.getElementById('adminMagicSymbolStatus');
 const section=host?.closest('[data-admin-section="spells"]');
 if(!host||!section)return;
 const LEGACY=/^assets\/spells\/arcane-ivory\/[a-z0-9-]+\.webp$/;
 const HERMES=/^hermes\/symbol\/[a-z0-9-]+\/[a-f0-9]{64}\.webp$/;
 const IMAGE_TYPES=[
  ['icon','Ikon'],['effect','Effektbild'],['cutout','Cutout'],['illustration','Illustration 1:1'],['illustration-wide','Illustration Wide 16:9']
 ];
 const FIELD={icon:'icon_path',effect:'effect_image_path',cutout:'cutout_path',illustration:'illustration_path','illustration-wide':'illustration_wide_path'};
 const STATE={received:'Mottagen',inboxed:'Mottagen · Inbox',archived:'Arkiverad',publishing:'Publiceras',published:'Klar',failed:'Väntar på nytt försök'};
 let pending=false,lastLoaded=0,timer=null;
 const visible=()=>!section.classList.contains('hidden');
 function valid(path,key){return (LEGACY.test(path)&&path==='assets/spells/arcane-ivory/'+key+'.webp')||(HERMES.test(path)&&path.split('/')[2]===key)}
 function src(path){return LEGACY.test(path)?'./'+path:SUPABASE_URL+'/storage/v1/object/public/alea-hermes-public/'+path}
 function id(){return crypto.randomUUID()}
 function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
 function humanJob(job){
  let state=STATE[job.state]||'Okänd status';
  if(job.state==='failed'&&Number(job.attempts)>=12)state='Misslyckad · kontakta administratör';
  else if(job.state==='failed'&&job.next_attempt_at)state='Väntar på nytt försök';
  return state;
 }
 async function loadJobs(){
  if(!visible()||!activeUser()?.admin)return;
  const rows=await dbJson('hermes_asset_jobs?select=id,target_key,image_type,state,attempts,error_code,next_attempt_at,created_at,updated_at&order=created_at.desc&limit=30');
  const pane=document.getElementById('hermesAssetJobs');if(!pane)return;
  pane.replaceChildren();
  if(!rows?.length){pane.appendChild(el('p','muted','Inga uppladdningar ännu.'));return}
  for(const job of rows){
   const line=el('div','hermes-asset-job');
   const type=IMAGE_TYPES.find(x=>x[0]===job.image_type)?.[1]||job.image_type;
   const title=el('strong','',job.target_key+' · '+type+' · '+humanJob(job));
   const detail=el('small','',job.state==='failed'?(job.error_code?('Tekniskt fel: '+job.error_code+' · automatisk återkörning planerad'):'Automatisk återkörning planerad'):('Jobb-ID '+job.id));
   line.append(title,detail);
   if(job.state==='failed'&&Number(job.attempts)>=12){
    const retry=el('button','smallbtn','Försök igen');retry.type='button';
    retry.addEventListener('click',async()=>{
     retry.disabled=true;detail.textContent='Köar om jobbet…';
     try{
      const token=await freshSupabaseAccessToken();
      const response=await fetch(SUPABASE_URL+'/functions/v1/hermes-inbox-bridge',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'retry',job_id:job.id})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw Error(result.message||'Jobbet kunde inte köas om.');
      detail.textContent='Jobbet har köats om. HERMES försöker igen automatiskt.';
      await poll();
     }catch(error){detail.textContent=error?.message||'Återförsöket misslyckades.';retry.disabled=false}
    });
    line.appendChild(retry);
   }
   pane.appendChild(line);
  }
 }
 async function poll(){
  try{await loadJobs()}catch(e){if(status)status.textContent='Jobbstatus kunde inte läsas just nu. Ladda om sidan om den inte visas.'}
 }
 async function validateImage(file,type){
  if(!file||file.size<100||file.size>8388608)throw Error('Välj en bild mellan 100 byte och 8 MiB.');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Välj PNG, JPEG eller WebP.');
  if(['icon','cutout'].includes(type)&&!['image/png','image/webp'].includes(file.type))throw Error('Ikon och cutout behöver en transparent PNG- eller WebP-bild.');
  const bitmap=await createImageBitmap(file);
  try{
   if(bitmap.width>4096||bitmap.height>4096)throw Error('Bilden får vara högst 4096 × 4096 pixlar.');
   const minEdge=type==='cutout'?1024:640;
   if(bitmap.width<minEdge||bitmap.height<minEdge)throw Error('Bilden måste vara minst '+minEdge+' pixlar.');
   if(type==='illustration-wide'){
    if(Math.abs(bitmap.width/bitmap.height-16/9)/(16/9)>0.003)throw Error('Illustration Wide måste ha formatet 16:9.');
   }else if(bitmap.width!==bitmap.height)throw Error('Den här bildtypen måste vara kvadratisk.');
   if(type==='cutout'){
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=false;
    for(let i=3;i<rgba.length;i+=4){if(rgba[i]===0){transparent=true;break}}
    if(!transparent)throw Error('Cutout-bilden behöver helt transparenta pixlar runt motivet.');
   }
  }finally{bitmap.close?.()}
 }
 async function upload(row,type,file,button,lineStatus){
  if(!activeUser()?.admin)throw Error('Endast administratörer får skicka bilder.');
  await validateImage(file,type);
  const bytes=await file.arrayBuffer();
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const slot='alea-hermes-upload:'+row.id+':'+type;
  let receipt=null;try{receipt=JSON.parse(localStorage.getItem(slot)||'null')}catch{}
  if(!receipt||receipt.sha!==sha)receipt={id:id(),sha,target_id:String(row.id),target_key:String(row.symbol_key),image_type:type};
  localStorage.setItem(slot,JSON.stringify(receipt));
  button.disabled=true;lineStatus.textContent='Skickar originalet säkert…';
  try{
   const token=await freshSupabaseAccessToken();
   const response=await fetch(SUPABASE_URL+'/functions/v1/hermes-inbox-bridge',{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':file.type,
     'x-hermes-idempotency-key':receipt.id,'x-hermes-target-id':receipt.target_id,
     'x-hermes-target-key':receipt.target_key,'x-hermes-image-type':receipt.image_type,'x-hermes-sha256':receipt.sha},
    body:file
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.received)throw Error(result.message||'Mottagandet kunde inte bekräftas.');
   localStorage.removeItem(slot);
   lineStatus.textContent='Original mottaget. Jobb '+result.job_id+'. Bilden är ännu inte publicerad.';
   if(status)status.textContent='Original mottaget · jobb '+result.job_id+' · publiceras automatiskt när HERMES är klar.';
   await poll();
  }catch(error){
   lineStatus.textContent=(error?.message||'Uppladdningen misslyckades')+' Om nätet bröts, välj samma bild igen för att kontrollera eller återuppta samma jobb.';
   throw error;
  }finally{button.disabled=false}
 }
 function uploadControls(row){
  const box=el('div','hermes-upload-controls');
  const select=el('select','hermes-image-type');select.setAttribute('aria-label','Bildtyp för '+row.name);
  for(const [value,label] of IMAGE_TYPES){const option=el('option','',label);option.value=value;select.appendChild(option)}
  const input=el('input','hermes-image-file');input.type='file';input.accept='image/png';input.setAttribute('aria-label','Välj bild för '+row.name);
  const button=el('button','smallbtn','Spara bild');button.type='button';
  const lineStatus=el('small','hermes-upload-status','');
  button.addEventListener('click',async()=>{
   if(!input.files?.[0]){lineStatus.textContent='Välj en bild först.';return}
   try{await upload(row,select.value,input.files[0],button,lineStatus)}catch{}
  });
  box.append(select,input,button,lineStatus);return box;
 }
 async function render(){
  if(!visible()||pending||Date.now()-lastLoaded<60000)return;
  if(typeof dbJson!=='function')return;
  pending=true;if(status)status.textContent='Laddar magiska symboler…';
  try{
   const rows=await dbJson('rule_magic_symbols?select=id,symbol_key,name,school_value,icon_path,effect_image_path,cutout_path,illustration_path,illustration_wide_path&order=sort_order.asc,name.asc');
   if(!Array.isArray(rows))throw Error('Ogiltigt registersvar');
   host.replaceChildren();let loaded=0,failed=0;
   const report=()=>{if(status)status.textContent=rows.length+' symboler · '+loaded+' laddade ikoner'+(failed?' · '+failed+' ikoner kunde inte laddas':'')};
   for(const row of rows){
    const key=String(row.symbol_key||''),path=String(row.icon_path||''),hasPath=valid(path,key);
    const line=el('div','admin-symbol-row');line.dataset.symbolKey=key;
    const art=el('div','admin-symbol-art is-missing');
    const placeholder=el('span','admin-symbol-placeholder','✧');placeholder.setAttribute('aria-hidden','true');
    const text=el('div','admin-symbol-text');
    const title=el('strong','',row.name||key),school=el('small','','Skolvärde '+(row.school_value??'—'));
    text.append(title,school);
    const state=el('span','admin-symbol-state',hasPath?'Laddar…':'Ingen ikon');
    art.appendChild(placeholder);line.append(art,text,state);
    if(activeUser()?.admin)line.appendChild(uploadControls(row));
    host.appendChild(line);
    if(hasPath){
     const img=el('img');img.loading='eager';img.decoding='async';img.alt='Sigill för '+row.name;
     const success=()=>{if(!img.isConnected||state.dataset.finished)return;state.dataset.finished='1';art.classList.remove('is-missing');art.classList.add('has-icon');state.textContent='Visas';loaded++;report()};
     const failure=()=>{if(!img.isConnected||state.dataset.finished)return;state.dataset.finished='1';state.textContent='Bild saknas';failed++;report()};
     img.addEventListener('load',success,{once:true});img.addEventListener('error',failure,{once:true});
     art.insertBefore(img,placeholder);img.src=src(path);if(img.complete){if(img.naturalWidth)success();else failure()}
    }
   }
   const jobs=el('section','hermes-asset-jobs-panel');jobs.id='hermesAssetJobs';
   jobs.appendChild(el('h4','','HERMES · uppladdningsstatus'));host.appendChild(jobs);
   report();lastLoaded=Date.now();await poll();
  }catch(error){if(status)status.textContent='Symbolism kunde inte läsas: '+(error?.message||error)}
  finally{pending=false}
 }
 const observer=new MutationObserver(()=>{if(visible()){void render();void poll();if(!timer)timer=setInterval(()=>void poll(),10000)}else if(timer){clearInterval(timer);timer=null}});
 observer.observe(section,{attributes:true,attributeFilter:['class']});
 if(visible()){void render();timer=setInterval(()=>void poll(),10000)}
 window.aleaMagicSymbolsAdmin={refresh:()=>{lastLoaded=0;return render()}};
})();
