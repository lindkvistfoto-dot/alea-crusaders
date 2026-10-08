/* Bilbo – search, gallery and metadata management for private campaign materials. */
import './storage.js?v=0.34.79';
import {createAragorn} from './links.js?v=0.34.83';
import {createLegolas} from './viewer.js?v=0.34.84';
import {mountFrodo} from './frodo-ui.js?v=0.34.85';
import {mountSam} from './player-folder-ui.js?v=0.34.86';
import {mountGaladriel} from './galadriel-ui.js?v=0.34.87';

const BILBO_PAGE_SIZE=24;
const BILBO_BUCKETS=new Set(['campaign-materials','campaign-actor-images','campaign-location-assets','campaign-maps','combat-scene-maps','combat-icons']);
const bilboState={campaign:'',rows:[],page:0,hasNext:false,category:'all',status:'active',sort:'newest',search:'',selected:null,busy:false,querySeq:0,mediaSeq:0,detailSeq:0,layout:'grid',thumbUrls:new Map(),detailUrl:'',note:'',searchTimer:null};
const bilboStorage=()=>window.gimliMaterialApi;
const legolas=createLegolas({
 getCampaign:()=>String(centralCampaignId||''),
 isLoggedIn:()=>Boolean(activeUser()),
 isGM:()=>Boolean(activeUser()?.admin||centralCampaignRole==='gm'),
 query:(path)=>dbJson(path),
 read:async (bucket,path)=>{
  const res=await mapStorageFetch('object/'+bucket+'/'+encodeStoragePath(path),{method:'GET'});
  if(!res.ok)throw Error('Filåtkomst nekad ('+res.status+').');
  return res.blob();
 }
});
legolas.mount();
const frodoUi=mountFrodo({
 legolas,
 getCampaign:()=>String(centralCampaignId||''),
 isLoggedIn:()=>Boolean(activeUser()),
 isGM:()=>Boolean(activeUser()?.admin||centralCampaignRole==='gm'),
 request:(path,options)=>dbJson(path,options),
 isRealtimeConnected:()=>Boolean(window.galadrielMaterialApi?.connected())
});
frodoUi.mount();
const samUi=mountSam({
 legolas,
 getCampaign:()=>String(centralCampaignId||''),
 isLoggedIn:()=>Boolean(activeUser()),
 isGM:()=>Boolean(activeUser()?.admin||centralCampaignRole==='gm'),
 request:(path,options)=>dbJson(path,options),
 escape:value=>bilboEscape(value)
});
samUi.mount();
const galadrielUi=mountGaladriel({
 legolas,frodoUi,samUi,
 getCampaign:()=>String(centralCampaignId||''),
 getToken:()=>String(supabaseSession?.access_token||''),
 isAuthenticated:()=>Boolean(activeUser()&&supabaseSession?.access_token),
 isGM:()=>Boolean(activeUser()?.admin||centralCampaignRole==='gm'),
 verifyVisible:async(id,campaign)=>{
  const results=await dbJson('campaign_materials?campaign_id=eq.'+encodeURIComponent(campaign)+
   '&id=eq.'+encodeURIComponent(id)+'&archived_at=is.null&select=id&limit=1');
  return Array.isArray(results)&&results.some(row=>row.id===id);
 },
 supabaseUrl:SUPABASE_URL,
 publishableKey:SUPABASE_KEY
});
galadrielUi.mount();
window.galadrielMaterialApi=Object.freeze({connected:galadrielUi.connected});

const aragorn=createAragorn({
 getSelected:()=>bilboSelected(),
 getCampaign:()=>bilboCampaign(),
 getGeneration:()=>bilboState.detailSeq,
 canManage:()=>bilboAllowed(),
 request:(path,options)=>dbJson(path,options),
 escape:value=>bilboEscape(value),
 notify:(message,error)=>bilboNotice(message,error),
 reload:async()=>{bilboState.page=0;await bilboLoadPage()}
});
const bilboAllowed=()=>bilboStorage()?.canManage()===true;
const bilboCampaign=()=>String(centralCampaignId||'');
function bilboEscape(s){return escAttr(String(s??''))}
function bilboSelected(){return bilboState.rows.find(r=>r.id===bilboState.selected)||null}
function bilboReleaseThumbs(){
 bilboState.mediaSeq++;
 for(const url of bilboState.thumbUrls.values())URL.revokeObjectURL(url);
 bilboState.thumbUrls.clear();
}
function bilboReleaseMedia(){
 aragorn.clear();
 bilboReleaseThumbs();
 bilboState.detailSeq++;
 if(bilboState.detailUrl){URL.revokeObjectURL(bilboState.detailUrl);bilboState.detailUrl=''}
}
function bilboRequestParams(){
 const parts=['campaign_id=eq.'+encodeURIComponent(bilboCampaign())];
 if(bilboState.category!=='all')parts.push('category=eq.'+bilboState.category);
 if(bilboState.status==='active')parts.push('archived_at=is.null');
 if(bilboState.status==='archived')parts.push('archived_at=not.is.null');
 const words=bilboState.search.trim().slice(0,80).replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
 if(words)parts.push('or='+encodeURIComponent('(title.ilike.*'+words+'*,description.ilike.*'+words+'*)'));
 const orders={newest:'created_at.desc',oldest:'created_at.asc',title:'title.asc,created_at.desc'};
 parts.push('select=id,campaign_id,title,description,category,asset_kind,storage_bucket,storage_path,thumbnail_path,mime_type,original_filename,file_size_bytes,created_at,updated_at,archived_at');
 parts.push('order='+orders[bilboState.sort]);
 parts.push('limit='+(BILBO_PAGE_SIZE+1),'offset='+(bilboState.page*BILBO_PAGE_SIZE));
 return 'campaign_materials?'+parts.join('&')
}
function bilboSearchChanged(value){
 if(bilboState.searchTimer)clearTimeout(bilboState.searchTimer);
 bilboState.searchTimer=setTimeout(()=>{bilboState.search=String(value||'').slice(0,80);bilboState.page=0;bilboLoadPage()},250)
}
function bilboSetFilter(key,value){
 if(key==='category'&&!['all',...Object.keys(bilboStorage()?.categories||{})].includes(value))return;
 if(key==='status'&&!['active','archived','all'].includes(value))return;
 if(key==='sort'&&!['newest','oldest','title'].includes(value))return;
 if(!['category','status','sort'].includes(key))return;
 bilboState[key]=value;bilboState.page=0;bilboLoadPage()
}
function bilboPage(delta){
 if(bilboState.busy)return;
 const next=bilboState.page+Number(delta);
 if(next<0||delta>0&&!bilboState.hasNext)return;
 bilboState.page=next;bilboLoadPage()
}
function bilboNotice(message,error=false){
 const el=document.getElementById('bilboNotice');
 if(el){el.textContent=message;el.classList.toggle('is-error',error)}
}
async function bilboLoadPage(){
 if(!bilboAllowed()||!bilboCampaign()){bilboNotice('Välj en kampanj med SL-behörighet.',true);return}
 const seq=++bilboState.querySeq, campaign=bilboCampaign();
 bilboState.busy=true;bilboNotice('Hämtar material…');
 try{
  const rows=await dbJson(bilboRequestParams());
  if(seq!==bilboState.querySeq||campaign!==bilboCampaign())return;
  bilboState.campaign=campaign;
  bilboState.rows=(Array.isArray(rows)?rows:[]).slice(0,BILBO_PAGE_SIZE);
  bilboState.hasNext=Array.isArray(rows)&&rows.length>BILBO_PAGE_SIZE;
  bilboState.selected=null;bilboReleaseMedia();
  bilboRenderPage();bilboNotice(bilboState.rows.length+' material på sidan'+(bilboState.hasNext?' · fler finns':'')+'.');
  bilboLoadThumbnails()
 }catch(error){
  if(seq===bilboState.querySeq){bilboState.rows=[];bilboReleaseMedia();bilboRenderPage();bilboNotice('Kunde inte läsa biblioteket: '+error.message,true)}
 }finally{if(seq===bilboState.querySeq)bilboState.busy=false}
}
function bilboCardHtml(item){
 const type=item.asset_kind==='image'?'▧':item.asset_kind==='document'?'▤':'≡';
 const label=bilboStorage()?.categories?.[item.category]||'Övrigt';
 return '<button class="bilbo-card'+(item.archived_at?' is-archived':'')+(bilboState.selected===item.id?' is-selected':'')+'" type="button" onclick="bilboSelect(\''+bilboEscape(item.id)+'\')">'+
  '<span class="bilbo-card-media" data-bilbo-thumb="'+bilboEscape(item.id)+'">'+type+'</span>'+
  '<span class="bilbo-card-label"><strong>'+bilboEscape(item.title)+'</strong><small>'+bilboEscape(label)+' · '+(item.archived_at?'Arkiverad':'Privat')+'</small></span></button>'
}
function bilboRenderPage(){
 const grid=document.getElementById('bilboGrid'),page=document.getElementById('bilboPageCount');
 if(grid){grid.classList.toggle('is-list',bilboState.layout==='list');grid.innerHTML=bilboState.rows.length?bilboState.rows.map(bilboCardHtml).join(''):'<div class="bilbo-empty">Inga material matchar filtreringen. Ladda upp en fil eller ändra sökningen.</div>'}
 if(page)page.textContent='Sida '+(bilboState.page+1);
 const back=document.getElementById('bilboPrevious'),next=document.getElementById('bilboNext');
 if(back)back.disabled=bilboState.page===0;
 if(next)next.disabled=!bilboState.hasNext;
 const details=document.getElementById('bilboDetails');
 if(details)details.innerHTML='<div class="bilbo-empty">Välj en bild eller ett dokument för att förhandsvisa och redigera.</div>'
}
async function bilboFetchBlob(row,small=true){
 if(!bilboAllowed()||row.campaign_id!==bilboCampaign()||!BILBO_BUCKETS.has(row.storage_bucket))throw Error('Du saknar tillgång till denna bild.');
 if(row.storage_bucket==='campaign-materials')return bilboStorage().read(row,small);
 const path=small&&row.thumbnail_path?row.thumbnail_path:row.storage_path;
 const response=await mapStorageFetch('object/'+row.storage_bucket+'/'+encodeStoragePath(path),{method:'GET'});
 if(!response.ok)throw Error('Kunde inte läsa filen ('+response.status+').');
 return response.blob()
}
async function bilboLoadThumbnails(){
 const generation=bilboState.mediaSeq,rows=bilboState.rows.filter(x=>x.asset_kind==='image');
 let nextIndex=0;
 async function worker(){
  while(nextIndex<rows.length){
   const row=rows[nextIndex++];
   try{
    const blob=await bilboFetchBlob(row,true);
    if(generation!==bilboState.mediaSeq)return;
    const el=document.querySelector('[data-bilbo-thumb="'+row.id+'"]');
    if(!el)continue;
    const url=URL.createObjectURL(blob);
    bilboState.thumbUrls.set(row.id,url);
    const img=document.createElement('img');
    img.alt='';img.loading='lazy';img.src=url;el.replaceChildren(img)
   }catch(error){
    if(generation===bilboState.mediaSeq){
     const el=document.querySelector('[data-bilbo-thumb="'+row.id+'"]');
     if(el){el.title='Bilden kunde inte laddas';el.classList.add('bilbo-thumbnail-error')}
    }
   }
  }
 }
 await Promise.all([worker(),worker(),worker()])
}

function bilboDetailHtml(row){
 const categories=bilboStorage()?.categories||{};
 return '<div class="bilbo-detail-heading"><div><h3>'+bilboEscape(row.title)+'</h3><small>'+(row.archived_at?'Arkiverad':'Privat material')+
  ' · '+bilboEscape(row.mime_type)+'</small></div><button type="button" class="smallbtn" onclick="bilboCloseDetail()">Stäng</button></div>'+
  '<div id="bilboFullPreview" class="bilbo-full-preview" aria-live="polite"><span>Laddar förhandsvisning…</span></div>'+
  '<form class="bilbo-metadata" id="bilboMetadata" onsubmit="bilboSaveMetadata(event)">'+
  '<label>Titel<input name="title" maxlength="160" required value="'+bilboEscape(row.title)+'"></label>'+
  '<label>Kategori<select name="category">'+Object.entries(categories).map(([id,label])=>
   '<option value="'+id+'"'+(row.category===id?' selected':'')+'>'+bilboEscape(label)+'</option>').join('')+'</select></label>'+
  '<label>Beskrivning som kan visas för spelare<textarea name="description" maxlength="2000" rows="4">'+
   bilboEscape(row.description||'')+'</textarea></label>'+
  '<button type="submit" class="btn primary" id="bilboSaveButton">Spara uppgifter</button></form>'+
  '<div class="bilbo-note"><label>Privata SL-anteckningar<textarea id="bilboGmNote" maxlength="8000" rows="3" placeholder="Endast spelledaren kan läsa detta…"></textarea></label>'+
  '<button type="button" class="smallbtn" id="bilboNoteSave" onclick="bilboSaveNote()">Spara SL-anteckning</button></div>'+
  aragorn.html()+
  '<div class="bilbo-detail-actions"><button type="button" class="smallbtn" data-id="'+bilboEscape(row.id)+'" onclick="legolasPreviewMaterial(this.dataset.id)">⛶ Förhandsvisa i Legolas</button>'+
   (!row.archived_at?'<button type="button" class="smallbtn" data-id="'+bilboEscape(row.id)+'" onclick="frodoShowMaterial(this.dataset.id)">📡 Visa nu för spelarna</button>':'')+
   (!row.archived_at?'<button type="button" class="smallbtn" data-id="'+bilboEscape(row.id)+'" onclick="samShareMaterial(this.dataset.id)">📁 Dela till spelarmapp</button>':'')+
  '<button type="button" class="smallbtn" id="bilboArchiveButton" onclick="bilboToggleArchive()">'+
   (row.archived_at?'Återställ ur arkiv':'Arkivera material')+'</button></div>'+
  '<p class="bilbo-detail-info">'+(row.file_size_bytes?Math.ceil(row.file_size_bytes/1024)+' kB · ':'')+
   'Uppladdad: '+bilboEscape((row.created_at||'').slice(0,10))+'<br>Fil: '+bilboEscape(row.original_filename||'—')+'</p>'+
  '<p class="bilbo-detail-info">Arkivering döljer materialet ur det aktiva biblioteket utan att radera filen.</p>'
}
function bilboCloseDetail(){
 aragorn.clear();
 bilboState.detailSeq++;
 bilboState.selected=null;bilboState.note='';
 if(bilboState.detailUrl){URL.revokeObjectURL(bilboState.detailUrl);bilboState.detailUrl=''}
 const el=document.getElementById('bilboDetails');
 if(el)el.innerHTML='<div class="bilbo-empty">Välj material för att förhandsvisa och redigera.</div>';
 document.querySelectorAll('.bilbo-card').forEach(el=>el.classList.remove('is-selected'))
}
async function bilboSelect(id){
 if(!bilboAllowed())return;
 const row=bilboState.rows.find(m=>m.id===id);if(!row)return;
 bilboCloseDetail();
 bilboState.selected=row.id;
 document.querySelectorAll('.bilbo-card').forEach(el=>{
  const selected=el.querySelector('[data-bilbo-thumb="'+id+'"]');
  el.classList.toggle('is-selected',Boolean(selected))
 });
 const box=document.getElementById('bilboDetails');
 if(box)box.innerHTML=bilboDetailHtml(row);
 const generation=++bilboState.detailSeq;
 // Do not invalidate the thumbnail URLs when opening details.
 await Promise.allSettled([bilboShowFullPreview(row,generation),bilboLoadNote(row,generation),aragorn.loadDetails(row,generation)])
}
async function bilboShowFullPreview(row,generation){
 const box=document.getElementById('bilboFullPreview');if(!box)return;
 try{
  const blob=await bilboFetchBlob(row,false);
  if(generation!==bilboState.detailSeq||bilboState.selected!==row.id)return;
  const url=URL.createObjectURL(blob);
  if(bilboState.detailUrl)URL.revokeObjectURL(bilboState.detailUrl);
  bilboState.detailUrl=url;box.replaceChildren();
  if(row.asset_kind==='image'){
   const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
   link.title='Öppna bilden i större format';
   const image=document.createElement('img');image.alt=row.title;image.src=url;link.append(image);box.append(link)
  }else{
   const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='Öppna '+(row.asset_kind==='document'?'PDF-dokumentet':'textfilen');
   box.append(link)
  }
 }catch(error){
  if(generation===bilboState.detailSeq&&bilboState.selected===row.id)box.textContent='Förhandsvisningen kunde inte laddas: '+error.message
 }
}
async function bilboLoadNote(row,generation){
 try{
  const results=await dbJson('campaign_material_gm_notes?campaign_id=eq.'+encodeURIComponent(row.campaign_id)+
    '&material_id=eq.'+encodeURIComponent(row.id)+'&select=notes&limit=1');
  if(generation!==bilboState.detailSeq||bilboState.selected!==row.id)return;
  bilboState.note=results?.[0]?.notes||'';
  const input=document.getElementById('bilboGmNote');if(input)input.value=bilboState.note
 }catch(error){if(bilboState.selected===row.id)bilboNotice('Kunde inte läsa SL-anteckningar: '+error.message,true)}
}
async function bilboSaveMetadata(event){
 event?.preventDefault?.();
 if(!bilboAllowed()||bilboState.busy)return;
 const row=bilboSelected(),form=document.getElementById('bilboMetadata');
 if(!row||!form||row.campaign_id!==bilboCampaign())return;
 const title=String(form.elements.namedItem('title')?.value||'').trim();
 const category=String(form.elements.namedItem('category')?.value||'');
 const description=String(form.elements.namedItem('description')?.value||'');
 if(title.length<1||title.length>160||description.length>2000||!Object.hasOwn(bilboStorage()?.categories||{},category)){
  bilboNotice('Kontrollera titel, beskrivning och kategori.',true);return
 }
 const button=document.getElementById('bilboSaveButton');if(button)button.disabled=true;
 bilboState.busy=true;
 try{
  const url='campaign_materials?id=eq.'+encodeURIComponent(row.id)+
   '&campaign_id=eq.'+encodeURIComponent(row.campaign_id)+
   '&updated_at=eq.'+encodeURIComponent(row.updated_at)+'&select=*';
  const update=await dbJson(url,{method:'PATCH',headers:{Prefer:'return=representation'},
   body:JSON.stringify({title,category,description,updated_at:new Date().toISOString()})});
  if(!Array.isArray(update)||update.length!==1)throw Error('Materialet har ändrats av någon annan. Läs om sidan.');
  const index=bilboState.rows.findIndex(x=>x.id===row.id);
  if(index>=0)bilboState.rows[index]={...bilboState.rows[index],...update[0]};
  const cards=document.getElementById('bilboGrid');
  if(cards){bilboReleaseThumbs();cards.innerHTML=bilboState.rows.map(bilboCardHtml).join('');bilboLoadThumbnails()}
  const details=document.getElementById('bilboDetails');
  if(details){const heading=details.querySelector('.bilbo-detail-heading h3');if(heading)heading.textContent=title}
  bilboNotice('Uppgifter sparade för '+title+'.');
 }catch(error){bilboNotice('Kunde inte spara: '+error.message,true)}
 finally{bilboState.busy=false;if(button)button.disabled=false}
}
async function bilboSaveNote(){
 if(!bilboAllowed()||bilboState.busy)return;
 const row=bilboSelected(),input=document.getElementById('bilboGmNote'),button=document.getElementById('bilboNoteSave');
 if(!row||!input)return;
 const notes=String(input.value||'');
 if(notes.length>8000){bilboNotice('SL-anteckningen får ha högst 8000 tecken.',true);return}
 if(button)button.disabled=true;bilboState.busy=true;
 try{
  await dbJson('campaign_material_gm_notes?on_conflict=material_id',{
   method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
   body:JSON.stringify({material_id:row.id,campaign_id:row.campaign_id,notes,updated_at:new Date().toISOString()})
  });
  bilboState.note=notes;bilboNotice('Privat SL-anteckning sparad.')
 }catch(error){bilboNotice('Kunde inte spara SL-anteckningen: '+error.message,true)}
 finally{bilboState.busy=false;if(button)button.disabled=false}
}
async function bilboToggleArchive(){
 if(!bilboAllowed()||bilboState.busy)return;
 const row=bilboSelected();
 if(!row||row.campaign_id!==bilboCampaign())return;
 const restore=Boolean(row.archived_at);
 if(!window.confirm(restore?'Återställa '+row.title+' till det aktiva biblioteket?':'Arkivera '+row.title+'? Filen raderas inte.'))return;
 bilboState.busy=true;
 const button=document.getElementById('bilboArchiveButton');if(button)button.disabled=true;
 try{
  const url='campaign_materials?id=eq.'+encodeURIComponent(row.id)+
   '&campaign_id=eq.'+encodeURIComponent(row.campaign_id)+
   '&updated_at=eq.'+encodeURIComponent(row.updated_at)+'&select=id';
  const result=await dbJson(url,{method:'PATCH',headers:{Prefer:'return=representation'},
   body:JSON.stringify({archived_at:restore?null:new Date().toISOString(),updated_at:new Date().toISOString()})});
  if(!Array.isArray(result)||result.length!==1)throw Error('Materialet har ändrats. Läs om biblioteket.');
  bilboNotice(restore?'Materialet är återställt.':'Materialet är arkiverat, filen finns kvar.');
  await bilboLoadPage()
 }catch(error){bilboNotice('Det gick inte att ändra arkivstatus: '+error.message,true)}
 finally{bilboState.busy=false;if(button)button.disabled=false}
}

function bilboSetLayout(layout){
 if(!['grid','list'].includes(layout))return;
 bilboState.layout=layout;
 bilboCloseDetail();bilboReleaseThumbs();
 bilboRenderPage();bilboLoadThumbnails()
}
function bilboMountLibrary(){
 if(document.querySelector('[data-admin-section="library"]'))return;
 const place=document.querySelector('.admin-nav-card[onclick*="places"]');
 if(!place)return;
 const nav=document.createElement('button');
 nav.type='button';nav.className='admin-nav-card';
 nav.onclick=()=>openAdminSection('library');
 nav.innerHTML='<span class="admin-nav-icon">▧</span><span class="admin-nav-copy"><b>Bildbibliotek</b><small>Bilbo · bilder, dokument och SL-anteckningar</small></span>';
 place.insertAdjacentElement('beforebegin',nav);
 const section=document.createElement('section');section.className='adminbox admin-detail hidden';section.dataset.adminSection='library';
 section.innerHTML='<div class="adminsectionhead bilbo-page-header"><div><h2>Bilbo · Bildbibliotek</h2>'+
  '<p class="muted">Sök, granska och organisera kampanjens privata bilder och dokument.</p></div>'+
  '<div class="aragorn-header-actions"><button type="button" class="smallbtn" id="aragornSyncButton" onclick="aragornSyncLegacy()">↻ Hämta äldre bilder</button>'+ 
  '<button type="button" class="smallbtn" onclick="openAdminSection(\'materials\')">+ Ladda upp</button></div></div>'+
  '<div class="bilbo-controls"><label><span>Sök titel eller beskrivning</span><input id="bilboSearch" type="search" maxlength="80" placeholder="Sök material…" oninput="bilboSearchChanged(this.value)"></label>'+
  '<label><span>Kategori</span><select id="bilboCategory" onchange="bilboSetFilter(\'category\',this.value)">'+
   '<option value="all">Alla kategorier</option>'+
   Object.entries(bilboStorage()?.categories||{}).map(([key,value])=>'<option value="'+key+'">'+bilboEscape(value)+'</option>').join('')+'</select></label>'+
  '<label><span>Status</span><select id="bilboStatus" onchange="bilboSetFilter(\'status\',this.value)">'+
   '<option value="active">Aktiva</option><option value="archived">Arkiverade</option><option value="all">Alla</option></select></label>'+
  '<label><span>Sortering</span><select id="bilboSort" onchange="bilboSetFilter(\'sort\',this.value)">'+
   '<option value="newest">Nyast först</option><option value="oldest">Äldst först</option><option value="title">Titel A–Ö</option></select></label></div>'+
  '<div class="bilbo-toolbar"><span id="bilboNotice" role="status" aria-live="polite">Laddar bibliotek…</span>'+
   '<div class="bilbo-view-choice"><button type="button" title="Rutnät" onclick="bilboSetLayout(\'grid\')">▦ Rutnät</button>'+
   '<button type="button" title="Lista" onclick="bilboSetLayout(\'list\')">☷ Lista</button></div></div>'+
  '<div class="bilbo-columns"><div class="bilbo-gallery"><div id="bilboGrid" class="bilbo-grid"></div>'+
   '<nav class="bilbo-pagination" aria-label="Bläddra mellan materialsidor"><button type="button" id="bilboPrevious" onclick="bilboPage(-1)">← Föregående</button>'+
   '<span id="bilboPageCount">Sida 1</span><button type="button" id="bilboNext" onclick="bilboPage(1)">Nästa →</button></nav></div>'+
   '<aside id="bilboDetails" class="bilbo-details"><div class="bilbo-empty">Välj en bild för förhandsvisning.</div></aside></div>';
 document.querySelector('#admin .admin-detail')?.insertAdjacentElement('beforebegin',section);
 const gimli=document.querySelector('[data-admin-section="materials"] .adminsectionhead');
 if(gimli&&!gimli.querySelector('.bilbo-back-link')){
  const back=document.createElement('button');back.className='smallbtn bilbo-back-link';back.type='button';
  back.textContent='← Bildbibliotek';back.onclick=()=>openAdminSection('library');gimli.append(back)
 }
}
Object.assign(window,{bilboMountLibrary,bilboLoadPage,bilboSelect,bilboCloseDetail,bilboSaveMetadata,
 bilboSaveNote,bilboToggleArchive,bilboSetFilter,bilboSetLayout,bilboPage,bilboSearchChanged,
 aragornSyncLegacy:aragorn.sync,aragornSetTargetType:aragorn.setType,aragornSearchTargets:aragorn.searchTargets,
 aragornLink:aragorn.link,aragornUnlink:aragorn.unlink,
 legolasOpenPanel:legolas.openPanel,legolasClosePanel:legolas.closePanel,legolasReset:legolas.reset,
 legolasGetStagedIds:legolas.getStagedIds,
 legolasPreviewMaterial:(id)=>{const row=bilboState.rows.find(r=>r.id===id&&r.campaign_id===bilboCampaign());if(row)legolas.previewMaterial(row)},
 samShareMaterial:async(id)=>{
  const row=bilboState.rows.find(r=>r.id===id&&r.campaign_id===bilboCampaign()&&!r.archived_at);
  if(!row||!bilboAllowed())return;
  const result=await samUi.share(row);
  bilboNotice(result?('Tillgängligt i spelarmappen: '+row.title+'.'):'Materialet kunde inte delas. Kontrollera materialpanelen.',!result);
 },
 frodoShowMaterial:async(id)=>{const row=bilboState.rows.find(r=>r.id===id&&r.campaign_id===bilboCampaign()&&!r.archived_at);if(!row||!bilboAllowed())return;const result=await frodoUi.showRow(row);if(result)bilboNotice('Visas nu för spelarna: '+row.title+'.');else bilboNotice('Visningen kunde inte startas. Kontrollera status i Materialpanelen.',true);}
});


// GitHub Pages serves plain browser modules, not Vite's built bundle.
// Mount the two administration sections as soon as the static DOM is ready.
function mountCampaignMaterialAdmin(){
 window.gimliMountAdmin?.();
 bilboMountLibrary();
}
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',mountCampaignMaterialAdmin,{once:true});
}else{
 mountCampaignMaterialAdmin();
}
