/* Arcane Gallery – private images, Frodo revisions, Galadriel signal refresh. */
const cols='id,campaign_id,title,description,category,asset_kind,storage_bucket,storage_path,thumbnail_path,mime_type,created_at';
const encode=encodeURIComponent;
const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function arcaneGalleryImageIds(events){
 return [...new Set((Array.isArray(events)?events:[]).map(x=>x?.material_id).filter(x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x)))].reverse();
}
export function createArcaneGallery({legolas,request,getCampaign,isLoggedIn,isGM,doc=()=>document,win=()=>window}){
 const root=doc().createElement('section');
 root.id='arcaneGallery';root.className='arcane-gallery hidden';
 root.innerHTML='<header class="arcane-gallery-heading"><strong>ARCANE GALLERY</strong><span id="arcaneGalleryCount"></span></header>'+
  '<div class="arcane-gallery-machine"><div id="arcaneGalleryPicture" class="arcane-gallery-picture" tabindex="0" role="button" aria-label="Öppna bild i stor vy">'+
  '<img id="arcaneGalleryImage" class="hidden" alt=""><span id="arcaneGalleryEmpty">Väntar på bilder från spelledaren…</span></div>'+
  '<div class="arcane-gallery-belt"><div id="arcaneGalleryStrip" class="arcane-gallery-strip" aria-label="Bläddra bland bilder"></div></div>'+
  '<img class="arcane-gallery-overlay" src="./features/material/arcane-gallery-overlay.webp?v=0.35.233" alt="" aria-hidden="true"></div>'+
  '<p id="arcaneGalleryStatus" class="arcane-gallery-status" role="status" aria-live="polite"></p>';
 const $=id=>doc().getElementById(id), state={campaign:'',revision:-1,live:'',rows:[],selected:'',seq:0,media:0,original:'',thumbs:new Map(),observer:null};
 const scope=()=>String(getCampaign()||'');
 const allowed=()=>isLoggedIn()&&!isGM()&&/^[a-f0-9-]{36}$/i.test(scope());
 function release(){state.media++;if(state.original)win().URL.revokeObjectURL(state.original);state.original='';
  for(const u of state.thumbs.values())win().URL.revokeObjectURL(u);state.thumbs.clear();state.observer?.disconnect();state.observer=null;}
 function clear(){state.seq++;release();state.campaign='';state.revision=-1;state.live='';state.rows=[];state.selected='';root.classList.add('hidden');
  const img=$('arcaneGalleryImage');if(img){img.removeAttribute('src');img.classList.add('hidden');}
  const strip=$('arcaneGalleryStrip');if(strip){strip.replaceChildren();strip.dataset.ids='';}}
 const valid=(n,c)=>n===state.seq&&scope()===c&&allowed();
 async function thumb(row,n,c){
  if(!valid(n,c))return;
  try{
   // Recreate the element when the strip is rebuilt without redownloading
   // the same private thumbnail. Gallery history changes often during play.
   let url=state.thumbs.get(row.id);
   if(!url){
    const blob=await legolas.readMedia(row,true);
    if(!valid(n,c))return;
    url=win().URL.createObjectURL(blob);state.thumbs.set(row.id,url);
   }
   const button=$('arcaneGalleryStrip')?.querySelector('[data-gallery-id="'+row.id+'"]');
   if(!button)return;
   const img=doc().createElement('img');img.src=url;img.alt='';img.loading='lazy';button.replaceChildren(img);
  }catch(_){/* RLS must remain authoritative. */}
 }
 function render(){
  root.classList.toggle('hidden',!allowed());if(!allowed())return;
  const strip=$('arcaneGalleryStrip'),rows=state.rows,ids=rows.map(r=>r.id).join('|');
  const visible=new Set(rows.map(r=>r.id));
  for(const [id,url] of state.thumbs){if(!visible.has(id)){
   win().URL.revokeObjectURL(url);state.thumbs.delete(id);
  }}
  $('arcaneGalleryCount').textContent=rows.length+' '+(rows.length===1?'delad bild':'delade bilder');
  $('arcaneGalleryEmpty').classList.toggle('hidden',!!state.selected);
  if(!strip)return;
  if(strip.dataset.ids!==ids){
   strip.dataset.ids=ids;state.observer?.disconnect();
   strip.innerHTML=rows.map((r,i)=>'<button type="button" class="arcane-gallery-tile" data-gallery-id="'+safe(r.id)+'" title="'+safe(r.title)+'" aria-label="Visa '+safe(r.title)+'"><span>'+(i+1)+'</span></button>').join('');
   const lazy=t=>{const r=rows.find(x=>x.id===t.dataset.galleryId);if(r)void thumb(r,state.seq,state.campaign);};
   if(typeof win().IntersectionObserver==='function'){
    state.observer=new win().IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){state.observer?.unobserve(e.target);lazy(e.target);}},
     {root:strip,rootMargin:'140px'});
    strip.querySelectorAll('[data-gallery-id]').forEach(t=>state.observer.observe(t));
   }else strip.querySelectorAll('[data-gallery-id]').forEach((t,i)=>{if(i<20)lazy(t);});
  }
  strip.querySelectorAll('[data-gallery-id]').forEach(t=>{
   const active=t.dataset.galleryId===state.selected;t.classList.toggle('is-active',active);t.setAttribute('aria-pressed',String(active));
  });
  const activeTile=strip.querySelector('[data-gallery-id="'+state.selected+'"]');
  if(activeTile&&strip.scrollTo&&Number.isFinite(activeTile.offsetLeft)){
   const left=Math.max(0,activeTile.offsetLeft-(strip.clientWidth-activeTile.clientWidth)/2);
   strip.scrollTo({left,behavior:'instant'}); // Horizontal only: never jump the page.
  }
  const row=rows.find(x=>x.id===state.selected);
  $('arcaneGalleryStatus').textContent=row?row.title+' · '+(rows.indexOf(row)+1)+' / '+rows.length:'Inga bilder har delats ännu.';
 }
 async function select(id){
  if(!allowed())return;const row=state.rows.find(r=>r.id===id&&r.campaign_id===scope());if(!row)return;
  state.selected=id;render();const img=$('arcaneGalleryImage');const n=++state.media,c=state.campaign;
  const old=state.original;state.original='';if(old)win().URL.revokeObjectURL(old);img.classList.add('hidden');img.removeAttribute('src');
  try{const blob=await legolas.readMedia(row,false);
   if(n!==state.media||c!==scope()||state.selected!==id||!allowed())return;
   state.original=win().URL.createObjectURL(blob);img.src=state.original;img.alt=row.title;img.classList.remove('hidden');
  }catch(_){if(n===state.media)$('arcaneGalleryStatus').textContent='Bilden kan inte läsas.';}
 }
 async function refresh(){
  if(!allowed())return;const c=scope(),n=++state.seq;
  try{
   const hist=[];let offset=0;
   while(true){
    const chunk=await request('campaign_material_presentation_history?campaign_id=eq.'+encode(c)+'&select=revision,material_id&order=revision.desc&limit=100&offset='+offset);
    if(!valid(n,c))return;if(!Array.isArray(chunk))throw Error('Historiken är inte tillgänglig');
    hist.push(...chunk);if(chunk.length<100)break;offset+=100;
   }
   const ids=arcaneGalleryImageIds(hist),materials=[];
   for(let i=0;i<ids.length;i+=40){
    const found=await request('campaign_materials?campaign_id=eq.'+encode(c)+'&id=in.('+ids.slice(i,i+40).map(encode).join(',')+')&archived_at=is.null&select='+cols);
    if(!valid(n,c))return;if(Array.isArray(found))materials.push(...found);
   }
   if(!valid(n,c))return;
   const lookup=new Map(materials.filter(x=>x.campaign_id===c&&x.asset_kind==='image').map(x=>[x.id,x]));
   state.rows=ids.map(id=>lookup.get(id)).filter(Boolean);
   const next=state.live&&lookup.has(state.live)?state.live:state.rows.at(-1)?.id;
   const previous=state.selected;render();
   if(next&&(next!==previous||!$('arcaneGalleryImage').src))void select(next);
  }catch(e){if(valid(n,c))$('arcaneGalleryStatus').textContent='Kunde inte läsa bildhistoriken: '+e.message;}
 }
 function sync(row,revision){
  if(!allowed()){if(state.campaign)clear();return;}
  const c=scope();if(state.campaign!==c){clear();state.campaign=c;}
  const live=row?.campaign_id===c&&row.asset_kind==='image'?row.id:'';
  if(state.revision!==revision||state.live!==live){state.revision=revision;state.live=live;void refresh();}
 }
 function openFull(){const row=state.rows.find(r=>r.id===state.selected);if(row&&allowed())legolas.previewMaterial(row);}
 function mount(){
  root.querySelector('#arcaneGalleryPicture').addEventListener('click',openFull);
  root.querySelector('#arcaneGalleryPicture').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFull();}});
  const strip=root.querySelector('#arcaneGalleryStrip');let drag=null,moved=false;
  strip.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){drag={x:e.clientX,left:strip.scrollLeft};moved=false;}});
  strip.addEventListener('pointermove',e=>{if(drag){const d=e.clientX-drag.x;if(Math.abs(d)>5){strip.scrollLeft=drag.left-d;moved=true;}}});
  ['pointerup','pointercancel','pointerleave'].forEach(e=>strip.addEventListener(e,()=>drag=null));
  strip.addEventListener('click',e=>{if(moved){moved=false;return;}const b=e.target.closest('[data-gallery-id]');if(b)void select(b.dataset.galleryId);});
  strip.addEventListener('keydown',e=>{
   if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
   const index=state.rows.findIndex(row=>row.id===state.selected);
   const next=state.rows[index+(e.key==='ArrowRight'?1:-1)];
   if(!next)return;
   e.preventDefault();void select(next.id);
   strip.querySelector('[data-gallery-id="'+next.id+'"]')?.focus?.({preventScroll:true});
  });
  return root;
 }
 return {mount,sync,refresh,clear,state,root};
}
