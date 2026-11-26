// The adventure map owns navigation. The gallery owns only this player's image selection.
const root=document.getElementById('explorerGallery');
const page=document.getElementById('mapPage');
const holder=root.closest('aside');
const work=holder.closest('.mapworkarea');
const artNames=['FRAME_PRIMARY','FRAME_SECONDARY','HEADER_TITLE','HEADER_SUBTITLE','PANEL_SURFACE',
 'THUMB_NORMAL','THUMB_HOVER','THUMB_ACTIVE','NAV_PREV','NAV_NEXT','NAV_FULLSCREEN','NAV_INFO','COUNTER',
 'DIVIDER_MAIN','COMPASS','BUTTON_NORMAL','BUTTON_ACTIVE','DROPDOWN_MAP','BG_DECOR_01','BG_DECOR_03','ICON_MAP','ICON_GROUP','ICON_IMAGE'];
const btn=(action,label,body='')=>'<button type="button" data-do="'+action+'" aria-label="'+label+'">'+body+'</button>';
const icon=key=>'<i class="eg-icon" data-art="'+key+'" aria-hidden="true"></i>';
root.innerHTML='<canvas class="eg-frame" aria-hidden="true"></canvas><div class="eg-heading"><h3></h3><p></p></div>'+
 '<div class="eg-stage">'+btn('full','Öppna bilden i helbild','<img alt="" hidden><span class="eg-empty"></span>')+
 btn('prev','Föregående bild')+btn('next','Nästa bild')+btn('expand','Visa helbild')+'<output aria-live="polite"></output></div>'+
 '<section class="eg-location"><h4>'+icon('ICON_IMAGE')+'Platsens bilder</h4><div class="eg-thumbs"></div><p class="eg-no-room"></p></section>'+
 '<div class="eg-divider" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><section class="eg-nav"><h4>'+icon('ICON_MAP')+'Karta / Struktur'+btn('info','Om kartvisning')+'</h4>'+
 '<p class="eg-info" hidden>Följ gruppens karta eller studera en delad karta på egen hand. Spelledaren kan samla gruppen igen.</p>'+
 '<div class="eg-modes">'+btn('follow','Följer gruppen',icon('ICON_GROUP')+'<span>Följer gruppen</span>')+btn('free','Fri kartvisning',icon('COMPASS')+'<span>Fri kartvisning</span>')+'</div>'+
 '<label class="eg-picker"><span></span><select aria-label="Välj delad karta eller struktur"></select></label></section>';
const $=s=>root.querySelector(s);
const control=id=>$('[data-do="'+id+'"]');
const mainImage=$('.eg-stage img'),empty=$('.eg-empty'),picker=$('select'),strip=$('.eg-thumbs');
const dialog=document.createElement('dialog');
dialog.className='explorer-image-viewer';dialog.setAttribute('aria-label','Helbild');
dialog.innerHTML='<button type="button" aria-label="Stäng helbild">×</button><img alt="">';
document.body.append(dialog);
const fullImage=dialog.querySelector('img');
dialog.querySelector('button').onclick=()=>dialog.close();
dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
dialog.onclose=()=>{fullImage.removeAttribute('src');if(!root.hidden)control('expand').focus({preventScroll:true});};
let scope='',roomKey='',roomRows=[],shared=[],selected='',shown='',liveToken='',newRoom=false,pendingRoom=false;
let menuKey='',thumbKey='',busyRoom=false,artLoading=false,artReady=false,artRetry=0,frameImage;
const media=new Map();
const rows=()=>[...roomRows,...shared];
const area=()=>campaignMapAreas.find(a=>a.id===mapSelectedAreaId && a.status==='explored');
const usable=()=>!root.hidden && !page.classList.contains('hidden') && !holder.classList.contains('in-battle') && !work.classList.contains('encounter-active');
function forget(id,entry){
 media.delete(id);
 if(entry.url)URL.revokeObjectURL(entry.url);
}
function release(){
 for(const [id,entry] of media)forget(id,entry);
 if(dialog.open)dialog.close();
 roomRows=[];shared=[];selected='';shown='';roomKey='';liveToken='';thumbKey='';menuKey='';pendingRoom=false;
 strip.replaceChildren();mainImage.removeAttribute('src');mainImage.alt='';mainImage.hidden=true;
}
async function load(row){
 let entry=media.get(row.id);
 if(entry&&entry.version===row.version)return entry.task;
 if(entry)forget(row.id,entry);
 entry={version:row.version};media.set(row.id,entry);
 entry.task=Promise.resolve().then(row.read).then(blob=>{
  if(media.get(row.id)!==entry)return '';
  entry.url=URL.createObjectURL(blob);return entry.url;
 }).catch(()=>{if(media.get(row.id)===entry)media.delete(row.id);return '';});
 return entry.task;
}
function paintSelected(){
 const all=rows(),r=all.find(x=>x.id===selected);
 const index=all.indexOf(r);
 control('prev').disabled=control('next').disabled=all.length<2;
 $('output').textContent=all.length?(index+1)+' / '+all.length:'0 / 0';
 for(const el of strip.children)el.setAttribute('aria-pressed',String(el.dataset.id===selected));
 if(!r){
  shown='';mainImage.removeAttribute('src');mainImage.alt='';mainImage.hidden=true;
  if(dialog.open)dialog.close();
  empty.textContent=pendingRoom?'Hämtar platsens bilder …':'Inga delade bilder ännu';empty.hidden=false;
  control('full').disabled=control('expand').disabled=true;return;
 }
 const current=r.id+'|'+(r.version||'');
 if(shown===current)return;
 shown=current;mainImage.hidden=true;mainImage.removeAttribute('src');empty.hidden=false;empty.textContent='Hämtar bilden …';
 control('full').disabled=control('expand').disabled=true;
 if(dialog.open)dialog.close();
 void load(r).then(async url=>{
  if(shown!==current||!url){if(shown===current){empty.textContent='Bilden kunde inte läsas.';shown='';}return;}
  mainImage.src=url;mainImage.alt=r.title||'Delad bild';
  try{await mainImage.decode();}catch{if(shown===current){empty.textContent='Bilden kunde inte öppnas.';shown='';}return;}
  if(shown!==current||mainImage.getAttribute('src')!==url)return;
  mainImage.hidden=false;empty.hidden=true;control('full').disabled=control('expand').disabled=false;
 });
}
function paintPhotos(){
 const all=rows(),valid=new Map(all.map(r=>[r.id,r.version]));
 for(const [id,e] of media)if(!valid.has(id)||valid.get(id)!==e.version)forget(id,e);
 if(!valid.has(selected))selected=roomRows[0]?.id||shared.at(-1)?.id||'';
 const key=JSON.stringify(roomRows.map(r=>[r.id,r.version,r.title]));
 if(thumbKey!==key){
  thumbKey=key;strip.replaceChildren();
  for(const row of roomRows){
   const b=document.createElement('button'),img=document.createElement('img');
   b.type='button';b.dataset.id=row.id;b.setAttribute('aria-label',row.title||'Platsbild');img.alt='';b.append(img);strip.append(b);
   void load(row).then(url=>{if(url&&b.isConnected)img.src=url;});
  }
 }
 const msg=$('.eg-no-room');msg.hidden=roomRows.length>0;
 msg.textContent=pendingRoom?'Hämtar bilder …':area()?'Inga platsbilder har delats.':'Välj en utforskad plats på kartan.';
 paintSelected();
}
function readShared(){
 const feed=window.aleaPresentedImages?.()||{rows:[],live:'',revision:-1};
 shared=feed.rows;
 const next=feed.revision+'|'+feed.live;
 if(feed.live&&next!==liveToken&&shared.some(r=>r.id==='material:'+feed.live)){
  selected='material:'+feed.live;newRoom=false;liveToken=next;
 }
 if(!feed.live)liveToken=next;
}
function sync(){
 const enabled=!page.classList.contains('hidden')&&!!centralCampaignId&&!adventureCanManage()&&!!activeUser()&&
  document.getElementById('loginScreen').classList.contains('hidden');
 root.hidden=!enabled;
 holder.classList.toggle('explorer-gallery-panel',enabled);
 const current=enabled?[centralCampaignId,activeUser().id,adventurePlayerPreview].join('|'):'';
 if(current!==scope){release();scope=current;}
 if(!enabled)return;
 const a=area(),nextKey=(activeCampaignMap?.id||'')+'|'+(a?.id||'');
 if(nextKey!==roomKey){
  roomKey=nextKey;roomRows=[];newRoom=!!a?.location_id;pendingRoom=newRoom;
 }
 $('.eg-heading h3').textContent=activeCampaignMap?.name||'Äventyrskarta';
 $('.eg-heading p').textContent=a?.name||'Utforskning';
 const maps=campaignMaps.filter(m=>m.player_visible);
 const sig=JSON.stringify([campaignActiveMapId,...maps.map(m=>[m.id,m.name])]);
 if(sig!==menuKey){
  menuKey=sig;picker.replaceChildren(...maps.map(m=>new Option(m.name+(m.id===campaignActiveMapId?' (aktuell)':''),m.id)));
 }
 picker.value=activeCampaignMap?.id||'';picker.disabled=!maps.length;
 $('.eg-picker span').textContent=picker.selectedOptions[0]?.textContent||'Ingen delad karta';
 const free=Boolean(requestedAdventureMap(maps));
 control('follow').setAttribute('aria-pressed',String(!free));control('free').setAttribute('aria-pressed',String(free));
 control('free').disabled=!activeCampaignMap;control('follow').disabled=!campaignActiveMapId;
 readShared();paintPhotos();void ensureArt();
}
function room(id,images,read){
 sync();if(root.hidden||area()?.id!==id)return;
 const incoming=images.filter(r=>r.player_visible===true).map(r=>({
  id:'room:'+r.id,title:r.title||'Platsbild',version:(r.storage_bucket||'campaign-location-assets')+'/'+r.storage_path,read:()=>read(r)
 }));
 const prev=new Set(roomRows.map(r=>r.id));const added=incoming.filter(r=>!prev.has(r.id));
 if((newRoom||!pendingRoom)&&added.length)selected=(newRoom?incoming[0]:added.at(-1)).id;
 newRoom=false;pendingRoom=false;roomRows=incoming;paintPhotos();
}
window.aleaExplorerGallery={sync,room,enabled:()=>!root.hidden,closeViewer:()=>{if(dialog.open)dialog.close();},roomFailed(id){if(!root.hidden&&area()?.id===id){roomRows=[];pendingRoom=false;paintPhotos();}}};
root.onclick=e=>{
 const button=e.target.closest('button');if(!button||button.disabled)return;
 const doWhat=button.dataset.do;
 if(button.dataset.id){selected=button.dataset.id;paintSelected();return;}
 const items=rows(),idx=items.findIndex(r=>r.id===selected);
 if(doWhat==='prev'||doWhat==='next'){
  selected=items[(idx+(doWhat==='next'?1:-1)+items.length)%items.length].id;paintSelected();
 }else if(doWhat==='full'||doWhat==='expand'){
  if(!mainImage.hidden){fullImage.src=mainImage.src;fullImage.alt=mainImage.alt;dialog.showModal();}
 }else if(doWhat==='info'){$('.eg-info').hidden=!$('.eg-info').hidden;}
 else if(doWhat==='follow'){void goToActiveCampaignMap();}
 else if(doWhat==='free' && activeCampaignMap){adventureRequestedMap={campaign:centralCampaignId,id:activeCampaignMap.id};sync();picker.focus();}
};
picker.onchange=()=>{void selectAdventureMap(picker.value,{free:true});};
window.addEventListener('alea:presented-images',()=>{if(!root.hidden){readShared();paintPhotos();}});
// Folder changes are signalled by Galadriel. Recheck the authorized history
// after returning to a tab and during long sessions if a signal was missed.
let checkingHistory=false;
async function recheckHistory(){
 if(!usable()||document.hidden||checkingHistory)return;
 checkingHistory=true;
 try{await window.refreshExplorerPresentedImages?.();}finally{checkingHistory=false;}
}
document.addEventListener('visibilitychange',recheckHistory);
window.setInterval(recheckHistory,30000);
const lifecycle=new MutationObserver(()=>{sync();if(!usable()&&dialog.open)dialog.close();});
for(const el of [page,work,holder,document.getElementById('loginScreen')])lifecycle.observe(el,{attributes:true,attributeFilter:['class']});
window.setInterval(async()=>{
 const a=area();if(!usable()||document.hidden||busyRoom||!a?.location_id)return;
 busyRoom=true;try{await window.refreshExplorerRoomPhotos?.(a);}catch{window.aleaExplorerGallery.roomFailed(a.id);}finally{busyRoom=false;}
},7000);
// Raster guides are in source pixels. Draw rigid source patches at one uniform
// scale; only the two undecorated horizontal bands and straight side rails grow.
const canvas=$('canvas');
function drawFrame(){
 const image=frameImage;if(!image?.naturalWidth||root.hidden)return;
 const w=root.clientWidth,h=root.clientHeight;if(!w||!h)return;
 const dpr=Math.min(devicePixelRatio||1,3),scale=Math.min(w/1070,h/580);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
 const px=[0,168,198,368,397,565],py=[0,156,235,359];
 const remaining=w-(565-59)*scale;
 const dx=[0,168*scale,168*scale+remaining/2,w-168*scale-remaining/2,w-168*scale,w];
 const dy=[0,156*scale,h-124*scale,h];
 for(let y=0;y<3;y++)for(let x=0;x<5;x++){
  ctx.drawImage(image,px[x],py[y],px[x+1]-px[x],py[y+1]-py[y],
   dx[x],dy[y],dx[x+1]-dx[x]+(x<4?.35:0),dy[y+1]-dy[y]+(y<2?.35:0));
 }
}
async function ensureArt(){
 if(artReady||artLoading||Date.now()<artRetry)return;
 artLoading=true;
 try{
  const keys=artNames.map(n=>'ARCANE_GALLERY_'+n);
  const entries=await dbJson('arcane_system_assets?asset_key=in.('+keys.join(',')+')&select=asset_key,asset_path,alpha_preserved');
  for(const row of entries){
   if(!keys.includes(row.asset_key)||!row.alpha_preserved||!row.asset_path.startsWith('hermes/system-asset/'+row.asset_key+'/')||!/[0-9a-f]{64}\.webp$/.test(row.asset_path))continue;
   const src=ALEA_SUPABASE_CONFIG.endpoint('/storage/v1/object/public/alea-hermes-public/'+row.asset_path);
   const name=row.asset_key.slice(15);root.style.setProperty('--eg-'+name,'url("'+src+'")');
   if(name==='FRAME_PRIMARY'){frameImage=new Image();frameImage.onload=drawFrame;frameImage.src=src;}
  }
  artReady=keys.every(k=>root.style.getPropertyValue('--eg-'+k.slice(15)));
 }catch(error){console.warn('Kunde inte läsa ARCANE GALLERYs systembilder',error);}
 finally{artLoading=false;artRetry=Date.now()+5000;}
}
new ResizeObserver(drawFrame).observe(root);
sync();
