// One gallery for both roles. Selection and presentation windows belong to this client.
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
 '<section class="eg-location"><h4>'+icon('ICON_IMAGE')+'Platsens bilder</h4><div class="eg-thumbs"></div><p class="eg-no-room"></p><div class="eg-presented" hidden><small>Visas av SL</small><div class="eg-thumbs"></div></div><div class="eg-actions" hidden><p class="eg-status"></p><div>'+btn('share','Dela och visa i helbild','Dela och visa i helbild')+btn('frame','Visa i spelarnas bildram','Visa i bildram')+btn('present','Visa i helbild för spelarna','Visa i helbild')+btn('revoke','Återkalla delning','Återkalla')+'</div><p class="eg-result" role="status"></p></div></section>'+
 '<div class="eg-divider" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><section class="eg-nav"><h4>'+icon('ICON_MAP')+'Karta / Struktur'+btn('info','Om kartvisning')+'</h4>'+
 '<p class="eg-info" hidden>Följ gruppens karta eller studera en delad karta på egen hand. Spelledaren kan samla gruppen igen.</p>'+
 '<div class="eg-modes">'+btn('follow','Följer gruppen',icon('ICON_GROUP')+'<span>Följer gruppen</span>')+btn('free','Fri kartvisning',icon('COMPASS')+'<span>Fri kartvisning</span>')+'</div>'+
 '<label class="eg-picker"><span></span><select aria-label="Välj delad karta eller struktur"></select></label></section>';
const $=s=>root.querySelector(s);
const control=id=>$('[data-do="'+id+'"]');
const mainImage=$('.eg-stage img'),empty=$('.eg-empty'),picker=$('select'),strip=$('.eg-thumbs');
const dialog=document.createElement('dialog');
dialog.className='explorer-image-viewer';dialog.setAttribute('aria-label','Helbild');
dialog.innerHTML='<button type="button" aria-label="Stäng helbild">Stäng</button><img alt="">';
document.body.append(dialog);
const fullImage=dialog.querySelector('img');
dialog.querySelector('button').onclick=()=>dialog.close();
dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
dialog.onclose=()=>{if(dialog.open)return;fullImage.removeAttribute('src');dialog.classList.remove('eg-floating-frame');if(!root.hidden)control('expand').focus({preventScroll:true});};
let scope='',roomKey='',roomRows=[],shared=[],selected='',shown='',liveToken='',newRoom=false,pendingRoom=false;
let menuKey='',thumbKey='',busyRoom=false,artLoading=false,artReady=false,artRetry=0,frameImage;
const media=new Map();
let presented=null, actionPending=false, requestedWindow='', windowValid=null, externalKey='';
const extra=()=>presented&&!roomRows.some(r=>r.id===presented.id)?presented:null;
const rows=()=>[...roomRows,...(extra()?[presented]:[]),...shared];
const manage=()=>adventureCanManage() && !!activeUser();
const area=()=>campaignMapAreas.find(a=>a.id===mapSelectedAreaId && (manage()||a.status==='explored'));
const usable=()=>!root.hidden && !page.classList.contains('hidden') && !holder.classList.contains('in-battle') && !work.classList.contains('encounter-active');
function forget(id,entry){
 media.delete(id);
 if(entry.url)URL.revokeObjectURL(entry.url);
}
function release(){
 for(const [id,entry] of media)forget(id,entry);
 if(dialog.open)dialog.close();
 presented=null;requestedWindow='';windowValid=null;externalKey='';actionPending=false;$('.eg-result').textContent='';
 roomRows=[];shared=[];selected='';shown='';roomKey='';liveToken='';thumbKey='';menuKey='';pendingRoom=false;
 $('.eg-presented .eg-thumbs').replaceChildren();$('.eg-presented').hidden=true;$('.eg-actions').hidden=true;
 fullImage.removeAttribute('src');fullImage.alt='';strip.replaceChildren();mainImage.removeAttribute('src');mainImage.alt='';mainImage.hidden=true;
}
async function load(row){
 let entry=media.get(row.id);
 if(entry&&entry.version===row.version)return entry.task;
 if(entry)forget(row.id,entry);
 entry={version:row.version};media.set(row.id,entry);
 entry.task=Promise.resolve().then(()=>media.get(row.id)===entry?row.read():null).then(blob=>{
  if(!blob||media.get(row.id)!==entry)return '';
  entry.url=URL.createObjectURL(blob);return entry.url;
 }).catch(()=>{if(media.get(row.id)===entry)media.delete(row.id);return '';});
 return entry.task;
}
function openPicture(floating=false){
 if(mainImage.hidden || !mainImage.getAttribute('src'))return;
 if(dialog.open && dialog.classList.contains('eg-floating-frame')!==floating)dialog.close();
 fullImage.src=mainImage.src;fullImage.alt=mainImage.alt;
 dialog.classList.toggle('eg-floating-frame',floating);
 if(!dialog.open){if(floating)dialog.show();else dialog.showModal();}
}
function actions(row){
 const active=manage()&&row?.source;
 $('.eg-actions').hidden=!active;
 if(!active)return;
 $('.eg-status').textContent=row.visible?'Delad med spelarna':'Endast SL';
 for(const action of ['share','frame','present','revoke']){
  const button=control(action);
  button.hidden=action==='share'?row.visible:!row.visible;button.disabled=actionPending;
 }
}
function openRequested(){
 if(requestedWindow&&(!windowValid||windowValid()))openPicture(requestedWindow==='frame');
 requestedWindow='';windowValid=null;
}
function paintSelected(){
 const all=rows(),r=all.find(x=>x.id===selected);
 const index=all.indexOf(r);actions(r);
 control('prev').disabled=control('next').disabled=all.length<2;
 $('output').textContent=all.length?(index+1)+' / '+all.length:'0 / 0';
 for(const el of root.querySelectorAll('.eg-thumbs button'))el.setAttribute('aria-pressed',String(el.dataset.id===selected));
 if(!r){
  shown='';mainImage.removeAttribute('src');mainImage.alt='';mainImage.hidden=true;
  if(dialog.open)dialog.close();
  empty.textContent=pendingRoom?'Hämtar platsens bilder …':'Inga delade bilder ännu';empty.hidden=false;
  control('full').disabled=control('expand').disabled=true;return;
 }
 const current=r.id+'|'+(r.version||'');
 if(shown===current){if(requestedWindow && !mainImage.hidden)openRequested();return;}
 shown=current;mainImage.hidden=true;mainImage.removeAttribute('src');empty.hidden=false;empty.textContent='Hämtar bilden …';
 control('full').disabled=control('expand').disabled=true;
 if(dialog.open)dialog.close();
 void load(r).then(async url=>{
  if(shown!==current||!url){if(shown===current){empty.textContent='Bilden kunde inte läsas.';shown='';}return;}
  mainImage.src=url;mainImage.alt=r.title||'Delad bild';
  try{await mainImage.decode();}catch{if(shown===current){empty.textContent='Bilden kunde inte öppnas.';shown='';}return;}
  if(shown!==current||mainImage.getAttribute('src')!==url)return;
  mainImage.hidden=false;empty.hidden=true;control('full').disabled=control('expand').disabled=false;
  if(requestedWindow)openRequested();
 });
}
function paintPhotos(){
 const all=rows(),valid=new Map(all.map(r=>[r.id,r.version]));
 for(const [id,e] of media)if(!valid.has(id)||valid.get(id)!==e.version)forget(id,e);
 if(!valid.has(selected))selected=roomRows[0]?.id||shared.at(-1)?.id||'';
 const key=JSON.stringify(roomRows.map(r=>[r.id,r.version,r.title,r.visible,manage()]));
 if(thumbKey!==key){thumbKey=key;strip.replaceChildren(...roomRows.map(thumbnail));}
 const other=extra(),otherBox=$('.eg-presented');
 const nextExternal=other?other.id+'|'+other.version:'';
 if(nextExternal!==externalKey){
  externalKey=nextExternal;
  otherBox.querySelector('.eg-thumbs').replaceChildren(...(other?[thumbnail(other)]:[]));
 }
 otherBox.hidden=!other;
 const msg=$('.eg-no-room');msg.hidden=roomRows.length>0;
 msg.textContent=pendingRoom?'Hämtar bilder …':area()?'Inga platsbilder har delats.':'Välj en utforskad plats på kartan.';
 paintSelected();
}
function thumbnail(row){
 const b=document.createElement('button'),img=document.createElement('img');
 b.type='button';b.dataset.id=row.id;b.setAttribute('aria-label',row.title);img.alt='';b.append(img);
 if(manage()&&row.source){
  const mark=document.createElement('span');
  mark.className='eg-badge';mark.dataset.shared=String(row.visible);mark.textContent=row.visible?'✓':'SL';
  mark.title=row.visible?'Delad med spelarna':'Endast SL';b.setAttribute('aria-label',row.title+' · '+mark.title);b.append(mark);
 }
 void load(row).then(url=>{if(url&&b.isConnected)img.src=url;});return b;
}
function readShared(){
 const feed=window.aleaPresentedImages?.()||{rows:[],live:'',revision:-1};
 shared=feed.rows;
 const next=feed.revision+'|'+feed.live;
 if(feed.live&&next!==liveToken&&shared.some(r=>r.id==='material:'+feed.live)){
  if(!manage() && (!presented || liveToken)){requestedWindow='';selected='material:'+feed.live;newRoom=false;}liveToken=next;
 }
 if(!feed.live)liveToken=next;
}
function sync(){
 const authenticated=!!centralCampaignId&&!!activeUser()&&document.getElementById('loginScreen').classList.contains('hidden');
 const enabled=authenticated&&!page.classList.contains('hidden');
 root.hidden=!enabled;
 holder.classList.toggle('explorer-gallery-panel',enabled);
 const current=authenticated?[centralCampaignId,activeUser().id,manage(),adventurePlayerPreview].join('|'):'';
 if(current!==scope){release();scope=current;}
 if(!enabled)return;
 const a=area(),nextKey=(activeCampaignMap?.id||'')+'|'+(a?.id||'');
 if(nextKey!==roomKey){
  roomKey=nextKey;roomRows=[];newRoom=!!a?.location_id;pendingRoom=newRoom;$('.eg-result').textContent='';
 }
 $('.eg-heading h3').textContent=activeCampaignMap?.name||'Äventyrskarta';
 $('.eg-heading p').textContent=a?.name||'Utforskning';
 const maps=campaignMaps.filter(m=>manage()||m.player_visible);
 $('.eg-modes').hidden=manage();
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
 const incoming=images.filter(r=>manage()||r.player_visible===true).map(r=>pictureRow(r,read));
 // Availability refreshes must preserve a player's choice. Only a live reveal
 // can take over an existing selection, including after a reconnect.
 if(newRoom && incoming.length)selected=incoming[0].id;
 newRoom=false;pendingRoom=false;roomRows=incoming;paintPhotos();
}
function pictureRow(row,read=window.readExplorerImageBlob){
 const source=row.source||'legacy';
 return {id:'room:'+source+':'+row.id,picture:row.id,source,visible:row.player_visible===true,title:row.title||'Platsbild',
  version:(row.storage_bucket||'campaign-location-assets')+'/'+row.storage_path,read:()=>read(row)};
}
const rpc=(method,body)=>dbJson('rpc/'+method,{method:'POST',body:JSON.stringify(body)});
async function recheckPresented(){
 const before=presented,stamp=scope;
 if(!before)return;
 let row;
 try{row=await rpc('read_arcane_gallery_image',{p_campaign:centralCampaignId,p_source:before.source,p_picture:before.picture});}
 catch{row=null;}
 if(stamp!==scope||before!==presented)return;
 if(!row?.player_visible){presented=null;requestedWindow='';
  roomRows=roomRows.filter(r=>r.id!==before.id);paintPhotos();}
}
async function receive(session,event,valid){
 if(!valid()||manage())return;
 sync();
 const stamp=scope,ok=()=>valid()&&stamp===scope&&!manage()&&!!activeUser();
 if(!['refresh','frame','full'].includes(event.mode))return;
 const picture=event.mode==='refresh'?null:await rpc('read_arcane_reveal',{p_session:session,p_command:event.id,p_ref:event.ref});
 if(!ok())return;
 const a=area();
 if(a?.location_id){
  try{await window.refreshExplorerRoomPhotos?.(a);}catch{window.aleaExplorerGallery.roomFailed(a.id);}
 }
 if(!ok())return;
 if(!picture?.player_visible){await recheckPresented();return;}
 presented=pictureRow(picture);selected=presented.id;newRoom=false;
 windowValid=ok;requestedWindow=event.mode==='full'?'full':usable()?'':'frame';
 if(!requestedWindow && dialog.open)dialog.close();
 paintPhotos();void ensureArt();
}
async function command(action){
 const row=roomRows.find(r=>r.id===selected),a=area(),stamp=scope;
 if(!manage()||!row||!a||actionPending)return;
 actionPending=true;$('.eg-result').textContent='';actions(row);
 try{
  const ack=await rpc('command_arcane_reveal',{p_campaign:centralCampaignId,p_source:row.source,p_picture:row.picture,p_action:action,p_command:crypto.randomUUID()});
  if(scope!==stamp)return;
  await window.refreshExplorerRoomPhotos(a);
  if(scope!==stamp||area()?.id!==a.id)return;
  const messages={share:ack?.session&&ack.mode==='full'?'Delad. Helbild skickad till spelmötet.':'Bilden är delad.',revoke:'Delningen är återkallad.',frame:'Visning i bildram skickad till spelmötet.',full:'Helbild skickad till spelmötet.'};
  $('.eg-result').textContent=messages[action];
 }catch(error){if(scope===stamp)$('.eg-result').textContent=error.message||'Bildåtgärden misslyckades. Försök igen.';}
 finally{if(scope===stamp){actionPending=false;paintSelected();}}
}
window.aleaExplorerGallery={sync,room,receive,enabled:()=>!root.hidden,closeViewer:()=>{if(dialog.open)dialog.close();},roomFailed(id){if(!root.hidden&&area()?.id===id){roomRows=[];pendingRoom=false;paintPhotos();}}};
root.onclick=e=>{
 const button=e.target.closest('button');if(!button||button.disabled)return;
 const doWhat=button.dataset.do;
 if(button.dataset.id){requestedWindow='';selected=button.dataset.id;$('.eg-result').textContent='';paintSelected();return;}
 if(['share','revoke','frame','present'].includes(doWhat)){void command(doWhat==='present'?'full':doWhat);return;}
 const items=rows(),idx=items.findIndex(r=>r.id===selected);
 if(doWhat==='prev'||doWhat==='next'){
  requestedWindow='';selected=items[(idx+(doWhat==='next'?1:-1)+items.length)%items.length].id;paintSelected();
 }else if(doWhat==='full'||doWhat==='expand'){
  openPicture();
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
 if(document.hidden||checkingHistory||(!usable()&&!presented))return;
 checkingHistory=true;
 try{await Promise.all([window.refreshExplorerPresentedImages?.(),recheckPresented()]);}finally{checkingHistory=false;}
}
document.addEventListener('visibilitychange',recheckHistory);
window.setInterval(recheckHistory,30000);
const lifecycle=new MutationObserver(sync);
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
   if(['FRAME_SECONDARY','BUTTON_NORMAL'].includes(name))dialog.style.setProperty('--eg-'+name,root.style.getPropertyValue('--eg-'+name));
   if(name==='FRAME_PRIMARY'){frameImage=new Image();frameImage.onload=drawFrame;frameImage.src=src;}
  }
  artReady=keys.every(k=>root.style.getPropertyValue('--eg-'+k.slice(15)));
 }catch(error){console.warn('Kunde inte läsa ARCANE GALLERYs systembilder',error);}
 finally{artLoading=false;artRetry=Date.now()+5000;}
}
new ResizeObserver(drawFrame).observe(root);
sync();
