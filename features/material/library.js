/* Bilbo – search, gallery and metadata management for private campaign materials. */
import './storage.js?v=0.34.79';

const BILBO_PAGE_SIZE=24;
const BILBO_BUCKETS=new Set(['campaign-materials','campaign-actor-images','campaign-location-assets','campaign-maps','combat-scene-maps','combat-icons']);
const bilboState={campaign:'',rows:[],page:0,hasNext:false,category:'all',status:'active',sort:'newest',search:'',selected:null,busy:false,querySeq:0,mediaSeq:0,thumbUrls:new Map(),detailUrl:'',note:'',searchTimer:null};
const bilboStorage=()=>window.gimliMaterialApi;
const bilboAllowed=()=>bilboStorage()?.canManage()===true;
const bilboCampaign=()=>String(centralCampaignId||'');
function bilboEscape(s){return escAttr(String(s??''))}
function bilboSelected(){return bilboState.rows.find(r=>r.id===bilboState.selected)||null}
function bilboReleaseMedia(){
 for(const url of bilboState.thumbUrls.values())URL.revokeObjectURL(url);
 bilboState.thumbUrls.clear();
 if(bilboState.detailUrl){URL.revokeObjectURL(bilboState.detailUrl);bilboState.detailUrl=''}
 bilboState.mediaSeq++
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
 return '<button class="bilbo-card'+(item.archived_at?' is-archived':'')+'" type="button" onclick="bilboSelect(\''+bilboEscape(item.id)+'\')">'+
  '<span class="bilbo-card-media" data-bilbo-thumb="'+bilboEscape(item.id)+'">'+type+'</span>'+
  '<span class="bilbo-card-label"><strong>'+bilboEscape(item.title)+'</strong><small>'+bilboEscape(label)+' · '+(item.archived_at?'Arkiverad':'Privat')+'</small></span></button>'
}
function bilboRenderPage(){
 const grid=document.getElementById('bilboGrid'),page=document.getElementById('bilboPageCount');
 if(grid)grid.innerHTML=bilboState.rows.length?bilboState.rows.map(bilboCardHtml).join(''):'<div class="bilbo-empty">Inga material matchar filtreringen. Ladda upp en fil eller ändra sökningen.</div>';
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
