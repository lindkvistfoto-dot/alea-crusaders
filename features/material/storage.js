/* Gimli: private campaign material storage. Classic Alea script. */
const GIMLI_BUCKET='campaign-materials', GIMLI_MAX_BYTES=20*1024*1024;
const GIMLI_FORMATS={'image/png':['png','image'],'image/jpeg':['jpg','image'],'image/webp':['webp','image'],'application/pdf':['pdf','document'],'text/plain':['txt','text']};
const GIMLI_CATEGORIES={location:'Platser',npc:'SLP',monster:'Monster',item:'Föremål',map:'Kartor',document:'Dokument',other:'Övrigt'};
let gimliRows=[],gimliPreviewUrl='',gimliUploading=false;
function gimliMime(file){
 const name=String(file?.name||'').toLowerCase();
 const exts={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.txt':'text/plain'};
 const ext=Object.keys(exts).find(x=>name.endsWith(x)),mime=exts[ext];
 if(!mime||file.type&&file.type!==mime)throw Error('Tillåtna filer är PNG, JPG, WebP, PDF och TXT.');
 return mime
}
function gimliSignature(mime,bytes){
 const a=[...bytes],str=(pos,n)=>String.fromCharCode(...a.slice(pos,pos+n));
 if(mime==='image/png')return a.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
 if(mime==='image/jpeg')return a[0]===255&&a[1]===216&&a[2]===255;
 if(mime==='image/webp')return str(0,4)==='RIFF'&&str(8,4)==='WEBP';
 if(mime==='application/pdf')return str(0,5)==='%PDF-';
 if(mime==='text/plain')return !a.some(x=>x===0||x<9||x>13&&x<32||x===127);
 return false
}
async function gimliValidate(file){
 if(!file||!Number.isSafeInteger(file.size)||file.size<1||file.size>GIMLI_MAX_BYTES)throw Error('Filen måste vara mellan 1 byte och 20 MB.');
 const mime=gimliMime(file),head=new Uint8Array(await file.slice(0,mime==='text/plain'?Math.min(file.size,4096):16).arrayBuffer());
 if(!gimliSignature(mime,head))throw Error('Filens innehåll stämmer inte med filtypen.');
 return {mime,ext:GIMLI_FORMATS[mime][0],kind:GIMLI_FORMATS[mime][1]}
}
function gimliPath(campaign,id,filename){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 if(!uuid.test(campaign)||!uuid.test(id)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(filename)||filename.includes('..'))throw Error('Ogiltig lagringsadress.');
 return campaign+'/'+id+'/'+filename
}
function gimliFilename(name,ext){
 const n=String(name||'material').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]/g,'-').replace(/\.[^.]+$/,'').replace(/\.+/g,'-').slice(0,75);
 return (n||'material')+'.'+ext
}
function gimliCanUpload(){return !!activeUser()?.admin||centralCampaignRole==='gm'}
async function gimliStorage(path,options={}){
 const res=await mapStorageFetch('object/'+GIMLI_BUCKET+'/'+encodeStoragePath(path),options);
 if(!res.ok){const json=await res.json().catch(()=>null);throw Error(json?.message||json?.error||'Storage HTTP '+res.status)}
 return res
}
async function gimliThumbnail(file,mime){
 if(!mime.startsWith('image/')||typeof createImageBitmap!=='function')return null;
 let img;
 try{
  img=await createImageBitmap(file);
  if(!img.width||!img.height||img.width*img.height>60000000)return null;
  const c=document.createElement('canvas'),scale=Math.min(1,420/Math.max(img.width,img.height));
  c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  c.getContext('2d')?.drawImage(img,0,0,c.width,c.height);
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',0.78));
  return blob?.type==='image/webp'&&blob.size>0?blob:null
 }catch(e){console.warn('Miniatyr saknas',e);return null}
 finally{img?.close?.()}
}
async function gimliUploadMaterial({campaignId,file,title,category='other',description='',progress=()=>{}}){
 if(!gimliCanUpload())throw Error('Endast SL får ladda upp.');
 if(String(campaignId||'')!==String(centralCampaignId||'')||!campaignId)throw Error('Välj aktiv kampanj.');
 if(!GIMLI_CATEGORIES[category])throw Error('Ogiltig kategori.');
 title=String(title||'').trim();description=String(description||'');
 if(!title||title.length>160||description.length>2000)throw Error('Kontrollera titel och beskrivning.');
 const info=await gimliValidate(file),id=crypto.randomUUID();
 const original=gimliPath(campaignId,id,gimliFilename(file.name,info.ext));
 const thumb=gimliPath(campaignId,id,'thumb.webp'),uploaded=[];
 try{
  progress('Laddar upp fil…');
  await gimliStorage(original,{method:'POST',headers:{'Content-Type':info.mime,'x-upsert':'false'},body:file});
  uploaded.push(original);
  if(info.kind==='image'){
   progress('Skapar miniatyr…');
   const small=await gimliThumbnail(file,info.mime);
   if(small){await gimliStorage(thumb,{method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:small});uploaded.push(thumb)}
  }
  progress('Registrerar materialet…');
  const result=await dbJson('campaign_materials?select=*',{method:'POST',headers:{Prefer:'return=representation'},
   body:JSON.stringify({id,campaign_id:campaignId,title,description,category,asset_kind:info.kind,
    storage_bucket:GIMLI_BUCKET,storage_path:original,thumbnail_path:uploaded.includes(thumb)?thumb:null,
    mime_type:info.mime,original_filename:String(file.name).slice(0,160),file_size_bytes:file.size})});
  if(!Array.isArray(result)||result.length!==1)throw Error('Kunde inte registrera materialet.');
  progress('Klart. Materialet är privat.');
  return result[0]
 }catch(error){
  await gimliRollbackFiles(uploaded);
  throw error
 }
}
async function gimliRollbackFiles(paths){
 const failed=[];
 for(const path of paths.slice().reverse()){
  try{await gimliStorage(path,{method:'DELETE'})}
  catch(error){failed.push(path);console.error('Gimli: orphan file requires cleanup',path,error)}
 }
 if(failed.length)throw Error('Misslyckad uppladdning: osparade filer behöver rensas av SL.')
}
async function gimliReadFile(record,thumbnail=false){
 if(record?.storage_bucket!==GIMLI_BUCKET)throw Error('Den här läsaren hanterar endast privata materialfiler.');
 const path=thumbnail&&record.thumbnail_path?record.thumbnail_path:record.storage_path;
 return (await gimliStorage(path,{method:'GET'})).blob()
}
function gimliStatus(message,isError=false){
 const status=$('gimliStatus');
 if(status){status.textContent=message;status.classList.toggle('error',isError)}
}
async function gimliFileSelected(file){
 if(gimliPreviewUrl){URL.revokeObjectURL(gimliPreviewUrl);gimliPreviewUrl=''}
 const preview=$('gimliPreview'),submit=$('gimliSubmit');
 if(preview)preview.replaceChildren();
 if(submit)submit.disabled=!file;
 if(!file){gimliStatus('Välj en bild eller ett dokument.');return}
 try{
  const info=await gimliValidate(file);
  const title=$('gimliTitle');
  if(title&&!title.value)title.value=file.name.replace(/\.[^.]+$/,'').slice(0,160);
  if(preview&&info.kind==='image'){
   gimliPreviewUrl=URL.createObjectURL(file);
   const img=document.createElement('img');img.src=gimliPreviewUrl;img.alt='Förhandsgranskning';
   preview.append(img)
  }else if(preview)preview.textContent=file.name+' · '+Math.ceil(file.size/1024)+' kB';
  gimliStatus('Filen är validerad och redo att laddas upp.')
 }catch(e){if(submit)submit.disabled=true;gimliStatus(e.message,true)}
}
async function gimliSubmitFile(event){
 event?.preventDefault?.();if(gimliUploading)return;
 const input=$('gimliFile'),button=$('gimliSubmit');
 gimliUploading=true;if(button)button.disabled=true;
 try{
  const file=input?.files?.[0];
  const result=await gimliUploadMaterial({campaignId:centralCampaignId,file,
   title:$('gimliTitle')?.value||'',description:$('gimliDescription')?.value||'',
   category:$('gimliCategory')?.value||'other',progress:gimliStatus});
  if(input)input.value='';
  if($('gimliTitle'))$('gimliTitle').value='';
  if($('gimliDescription'))$('gimliDescription').value='';
  await gimliFileSelected(null);
  gimliStatus('✓ '+result.title+' lagrad privat. Den är inte delad med spelarna.');
  await gimliLoadRecent()
 }catch(e){gimliStatus('Uppladdningen misslyckades: '+e.message,true)}
 finally{gimliUploading=false;if(button)button.disabled=!input?.files?.length}
}
async function gimliLoadRecent(){
 const box=$('gimliRecent');if(!box)return;
 if(!gimliCanUpload()||!centralCampaignId){box.textContent='Välj först en kampanj som du administrerar.';return}
 try{
  const rows=await dbJson('campaign_materials?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+
   '&storage_bucket=eq.'+GIMLI_BUCKET+
   '&select=id,title,category,asset_kind,mime_type,storage_bucket,storage_path,thumbnail_path,archived_at,created_at'+
   '&order=created_at.desc&limit=12');
  gimliRows=Array.isArray(rows)?rows:[];
  box.innerHTML=gimliRows.length?gimliRows.map(row=>'<div class="gimli-row"><span><b>'+
   escAttr(row.title)+'</b><small>'+escAttr(GIMLI_CATEGORIES[row.category]||'Övrigt')+
   ' · '+escAttr(row.mime_type)+(row.archived_at?' · Arkiverad':' · Endast SL')+
   '</small></span><button type="button" class="smallbtn" onclick="gimliShowStored(\''+
   row.id+'\')">Förhandsvisa</button></div>').join(''):'<p class="muted">Inget material uppladdat ännu.</p>'
 }catch(e){gimliStatus('Kunde inte visa material: '+e.message,true)}
}
async function gimliShowStored(id){
 if(!gimliCanUpload())return;
 const record=gimliRows.find(r=>r.id===id),preview=$('gimliStoredPreview');if(!record||!preview)return;
 try{
  const blob=await gimliReadFile(record,true);
  if(gimliPreviewUrl){URL.revokeObjectURL(gimliPreviewUrl);gimliPreviewUrl=''}
  gimliPreviewUrl=URL.createObjectURL(blob);
  preview.replaceChildren();
  if(record.asset_kind==='image'){
   const img=document.createElement('img');img.src=gimliPreviewUrl;img.alt=record.title;preview.append(img)
  }else{
   const a=document.createElement('a');a.href=gimliPreviewUrl;a.target='_blank';a.rel='noopener noreferrer';
   a.textContent='Öppna '+record.title;preview.append(a)
  }
 }catch(e){gimliStatus('Kunde inte läsa filen: '+e.message,true)}
}
function gimliMountAdmin(){
 if(document.querySelector('[data-admin-section="materials"]'))return;
 const place=document.querySelector('.admin-nav-card[onclick*="places"]');
 if(!place)return;
 const button=document.createElement('button');
 button.type='button';button.className='admin-nav-card';
 button.onclick=()=>openAdminSection('materials');
 button.innerHTML='<span class="admin-nav-icon">▧</span><span class="admin-nav-copy"><b>Materiallagring</b><small>Gimli · säker uppladdning</small></span>';
 place.insertAdjacentElement('afterend',button);
 const section=document.createElement('section');section.className='adminbox admin-detail hidden';
 section.dataset.adminSection='materials';
 section.innerHTML='<div class="adminsectionhead"><h2>Gimli · Materiallagring</h2></div>'+
  '<p class="muted">Endast SL kan se uppladdat material tills materialdelning införs.</p>'+
  '<form id="gimliForm" class="gimli-form" onsubmit="gimliSubmitFile(event)">'+
  '<label>Fil (JPG, PNG, WebP, PDF, TXT · max 20 MB)<input id="gimliFile" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt" onchange="gimliFileSelected(this.files&&this.files[0])" required></label>'+
  '<div id="gimliPreview" class="gimli-preview"></div>'+
  '<label>Titel<input id="gimliTitle" maxlength="160" required></label>'+
  '<label>Kategori<select id="gimliCategory">'+Object.entries(GIMLI_CATEGORIES).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label>'+
  '<label>Beskrivning<textarea id="gimliDescription" maxlength="2000" rows="2"></textarea></label>'+
  '<div class="gimli-actions"><button class="btn primary" id="gimliSubmit" type="submit" disabled>Ladda upp privat</button><span id="gimliStatus" role="status" aria-live="polite">Välj en fil.</span></div></form>'+
  '<div class="admin-subsection"><div class="admin-subsection-head"><h3>Senaste uppladdningarna</h3><button type="button" class="smallbtn" onclick="gimliLoadRecent()">Uppdatera</button></div>'+
  '<div id="gimliRecent"></div><div id="gimliStoredPreview" class="gimli-preview"></div></div>';
 document.querySelector('#admin .admin-detail')?.insertAdjacentElement('beforebegin',section)
}

// Expose only the admin UI callbacks needed by existing inline buttons.
Object.assign(window,{gimliFileSelected,gimliSubmitFile,gimliLoadRecent,gimliShowStored,gimliMountAdmin});
