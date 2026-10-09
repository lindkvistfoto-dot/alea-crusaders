/* Sam v0.34.86 — player folder UI hosted inside Legolas, no public URLs. */
import {createSam} from './player-folder.js?v=0.34.86';
// Styles loaded as ordinary <link> elements: GitHub Pages serves unbundled ES modules.

export function mountSam({
 legolas,getCampaign,isLoggedIn,isGM,request,escape,
 doc=()=>document,win=()=>window
}){
 const el=id=>doc().getElementById(id);
 const safe=s=>escape(String(s??''));
 const sam=createSam({getCampaign,isAuthenticated:isLoggedIn,isGM,request});
 let mounted=false,shown=false,lastCampaign='';
 function notice(text,error=false){
  const node=el('samNotice');
  if(node){node.textContent=String(text||'');node.classList.toggle('is-error',Boolean(error));}
 }
 function rows(){
  return [...legolas.state.selection.values()].filter(x=>x.campaign_id===getCampaign()&&!x.archived_at);
 }
 function render(){
  const node=el('samPanel');if(!node)return;
  const gm=Boolean(isGM());
  const actions=el('samGmActions');
  if(actions)actions.classList.toggle('hidden',!gm);
  const selection=rows(),shareButton=el('samShareSelection');
  if(shareButton){shareButton.disabled=!selection.length||sam.state.busy;
   shareButton.textContent='📁 Dela markerade ('+selection.length+')';}
  el('samSubtitle').textContent=gm?
    'Material här ligger kvar för spelarna tills SL återkallar det.':
    'Här hittar du bilder och dokument som spelledaren har sparat åt dig.';
  el('samPage').textContent='Sida '+(sam.state.page+1);
  el('samPrev').disabled=sam.state.page<=0||sam.state.loading;
  el('samNext').disabled=!sam.state.hasNext||sam.state.loading;
  const list=el('samItems');if(!list)return;
  list.innerHTML=sam.state.loading?'<p class="sam-empty">Hämtar spelarmappen…</p>':
   sam.state.rows.length?sam.state.rows.map(entry=>{
    const m=entry.material;
    return '<article class="sam-item">'+
      '<button type="button" data-sam-open="'+safe(m.id)+'" class="sam-item-open">'+
       '<span class="sam-item-symbol" aria-hidden="true">'+(m.asset_kind==='image'?'▧':'▤')+'</span>'+
       '<span><strong>'+safe(m.title)+'</strong><small>'+safe(m.category||'Material')+
       ' · '+safe((entry.created_at||'').slice(0,10))+'</small></span></button>'+
      (gm?'<button type="button" class="sam-revoke" data-sam-revoke="'+safe(m.id)+'"'+
       (sam.state.busy?' disabled':'')+'>Återkalla</button>':'')+
     '</article>';
   }).join(''):'<p class="sam-empty">'+(sam.state.notice?safe(sam.state.notice):
    'Inget material i spelarmappen än.')+'</p>';
 }
 async function load(){
  if(!isLoggedIn()||!getCampaign()){sam.reset();render();return [];}
  if(lastCampaign!==getCampaign()){lastCampaign=getCampaign();sam.reset();}
  const work=sam.load();render();const out=await work;render();
  if(sam.state.notice)notice(sam.state.notice,true);
  return out;
 }
 async function share(row){
  if(!isGM()||!isLoggedIn()||sam.state.busy)return null;
  const result=await sam.share(row);render();
  if(result){const message=sam.state.notice;await load();notice(message);}
  else notice(sam.state.notice||'Delningen kunde inte sparas.',true);
  return result;
 }
 async function shareById(id){
  if(!isGM()||!id)return null;
  const row=legolas.state.rows.find(r=>r.id===id&&r.campaign_id===getCampaign());
  if(!row){notice('Materialet finns inte på den aktuella sidan.',true);return null;}
  return share(row);
 }
 async function shareSelection(){
  const list=rows();
  if(!isGM()||!list.length)return;
  if(!win().confirm('Dela '+list.length+' material permanent till spelarnas mapp?'))return;
  const result=await sam.shareMany(list);
  await load();notice(result.shared+' material behandlade'+(result.failed?' · '+result.failed+' misslyckades.':'.'),Boolean(result.failed));
 }
 async function revoke(id){
  if(!isGM()||!id)return;
  const entry=sam.state.rows.find(x=>x.material_id===id);
  if(!entry?.material)return;
  if(!win().confirm('Återkalla "'+entry.material.title+'" från spelarmappen?'))return;
  const result=await sam.revoke(entry.material);
  if(result){await load();notice('Delningen återkallades. Originalfilen är kvar.');}
  else notice(sam.state.notice||'Det gick inte att återkalla.',true);
 }
 function open(id){
  const entry=sam.state.rows.find(x=>x.material_id===id);
  if(entry?.material&&entry.material.campaign_id===getCampaign())
   legolas.previewMaterial(entry.material);
 }
 async function changePage(direction){
  const work=sam.page(direction);render();await work;render();
 }
 function mount(){
  if(mounted)return;
  const target=el('legolasGmQueue');if(!target)return;
  mounted=true;
  const section=doc().createElement('section');section.id='samPanel';section.className='sam-folder';
  section.setAttribute('aria-label','Spelarmapp');
  section.innerHTML=
   '<div class="sam-header"><div><span class="sam-eyebrow">SPARADE FYND</span><h3>Spelarmapp</h3>'+
    '<p id="samSubtitle"></p></div><button type="button" id="samRefresh">↻ Uppdatera</button></div>'+
   '<div class="sam-actions hidden" id="samGmActions">'+
    '<button type="button" id="samShareSelection" class="sam-share-primary">📁 Dela markerade (0)</button>'+
    '<span>SL kan även dela enskilda filer direkt från bildbiblioteket.</span></div>'+
   '<p id="samNotice" class="sam-notice" role="status" aria-live="polite"></p>'+
   '<div id="samItems" class="sam-items"><p class="sam-empty">Öppna materialpanelen för att läsa mappen.</p></div>'+
   '<nav class="sam-pagination" aria-label="Spelarmappens sidor">'+
    '<button type="button" id="samPrev">← Föregående</button>'+
    '<span id="samPage">Sida 1</span>'+
    '<button type="button" id="samNext">Nästa →</button></nav>';
  target.insertAdjacentElement('beforebegin',section);
  el('samRefresh').addEventListener('click',()=>load());
  el('samShareSelection').addEventListener('click',()=>shareSelection());
  el('samPrev').addEventListener('click',()=>changePage(-1));
  el('samNext').addEventListener('click',()=>changePage(1));
  el('samItems').addEventListener('click',event=>{
   const revokeButton=event.target.closest('[data-sam-revoke]');
   if(revokeButton){void revoke(revokeButton.dataset.samRevoke);return;}
   const openButton=event.target.closest('[data-sam-open]');
   if(openButton)open(openButton.dataset.samOpen);
  });
  el('legolasGrid').addEventListener('click',event=>{
   const button=event.target.closest('[data-sam-share]');
   if(button){event.preventDefault();void shareById(button.dataset.samShare);}
   else if(event.target.closest('[data-legolas-pick]'))win().queueMicrotask?.(render);
  });
  el('legolasQueueItems').addEventListener('click',()=>win().queueMicrotask?.(render));
  el('legolasClearQueue').addEventListener('click',()=>win().queueMicrotask?.(render));
  el('materialNavBtn')?.addEventListener('click',()=>{if(isLoggedIn())void load();});
  doc().addEventListener('visibilitychange',()=>{
   if(doc().visibilityState==='visible'&&legolas.state.panelOpen&&isLoggedIn())void load();
  });
  const login=el('loginScreen');
  if(login&&typeof MutationObserver!=='undefined'){
   new MutationObserver(()=>{
    if(!login.classList.contains('hidden')){sam.reset();lastCampaign='';render();}
   }).observe(login,{attributes:true,attributeFilter:['class']});
  }
  render();
 }
 return {sam,mount,load,share,shareById,shareSelection,revoke,open,render};
}
