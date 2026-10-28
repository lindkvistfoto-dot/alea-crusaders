(function(root){'use strict';const KEY='arcane-trophy-room-v2.2',URL='https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/public/alea-hermes-public/hermes/system-asset/arcane-trophy-room-v2.2/c9e8d5d3807df1ded67669afbe64db33c5098f12082576e56e3a91fa2e05aa55.webp';let scale=1,x=0,y=0,drag=null;const byId=id=>document.getElementById(id);function page(){return byId('trophyRoomPage')||document.querySelector('.trophy-room-page')}function viewport(){return byId('trophyRoomViewport')}function image(){return byId('trophyRoomImage')}/* JAKOB 3H: one animation clock drives both the wall camera and hero. */
let cameraFrame=0,cameraMotion=null,suppressClick=false;
let heroPose={x:0,y:0,scale:1};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function clampCamera(){const v=viewport();if(!v)return;const maxX=Math.max(0,(scale-1)*v.clientWidth/2),maxY=Math.max(0,(scale-1)*v.clientHeight/2);x=clamp(x,-maxX,maxX);y=clamp(y,-maxY,maxY);if(scale<=1){x=0;y=0}}
function positionMedalWall(v){const wall=byId('trophyRoomMedalWall');if(!wall)return;const left=.4073,top=.2769,width=.1931,height=.3277;wall.style.left=(v.clientWidth*(.5+(left-.5)*scale)+x)+'px';wall.style.top=(v.clientHeight*(.5+(top-.5)*scale)+y)+'px';wall.style.width=(v.clientWidth*width*scale)+'px';wall.style.height=(v.clientHeight*height*scale)+'px'}
function medalInteractionReady(){return !cameraMotion&&scale>=2.24}
function updateMedalInteraction(){const ready=medalInteractionReady();const v=viewport();if(v)v.classList.toggle('trophy-room-medals-active',ready);for(const button of document.querySelectorAll('#trophyRoomMedalWall .trophy-room-medal-trigger')){button.disabled=!ready;button.tabIndex=ready?0:-1}}
function draw(){clampCamera();
 const v=viewport();if(!v)return;
 const scene=byId('trophyRoomScene'),hero=byId('trophyRoomCharacterLayer');
 v.style.setProperty('--pan-x',x+'px');v.style.setProperty('--pan-y',y+'px');v.style.setProperty('--zoom',String(scale));
 if(scene)scene.style.transform='translate3d('+x+'px,'+y+'px,0) scale('+scale+')';positionMedalWall(v);
 if(hero){
  const width=v.clientWidth,height=v.clientHeight;
  const heroWidth=width*.30;
  const moveX=-heroWidth*.5+heroPose.x*width;
  const moveY=heroPose.y*height;
  hero.style.transform='translate3d('+moveX+'px,'+moveY+'px,0) scale('+heroPose.scale+')';
 }
 const out=byId('trophyRoomZoomValue');if(out)out.value=Math.round(scale*100)+'%';updateMedalInteraction();
}
function cancelCamera(){if(cameraFrame)cancelAnimationFrame(cameraFrame);cameraFrame=0;cameraMotion=null}
function animateCamera(target,duration=2500,nextHeroPose=null){
 cancelCamera();
 const reduce=root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const heroTarget=nextHeroPose||{x:target.scale<=1?0:-.36,y:target.scale<=1?0:.66,scale:target.scale<=1?1:2.45};
 const heroStart={...heroPose};
 if(reduce||duration<=0){scale=target.scale;x=target.x;y=target.y;heroPose={...heroTarget};draw();updateMedalInteraction();return}
 const start={scale,x,y};const started=performance.now();
 cameraMotion={start,target,started,duration,heroStart,heroTarget};
 function tick(now){
  const t=clamp((now-started)/duration,0,1),k=ease(t);
  scale=start.scale+(target.scale-start.scale)*k;
  x=start.x+(target.x-start.x)*k;
  y=start.y+(target.y-start.y)*k;
  heroPose={x:heroStart.x+(heroTarget.x-heroStart.x)*k,y:heroStart.y+(heroTarget.y-heroStart.y)*k,scale:heroStart.scale+(heroTarget.scale-heroStart.scale)*k};
  draw();
  if(t<1)cameraFrame=requestAnimationFrame(tick);else{cameraFrame=0;cameraMotion=null;updateMedalInteraction()}
 }
 cameraFrame=requestAnimationFrame(tick);
}
function reset(){animateCamera({scale:1,x:0,y:0},2500,{x:0,y:0,scale:1})}
function focusWall(side='center'){
 const v=viewport();if(!v)return;
 const targetScale=2.25;
 const targets={
  center:{x:.4073+.1931/2,y:.2769+.3277/2,hero:{x:-.36,y:.66,scale:2.45}},
  left:{x:.22,y:.50,hero:{x:-.28,y:.66,scale:2.45}},
  right:{x:.78,y:.50,hero:{x:.28,y:.66,scale:2.45}}
 };
 const destination=targets[side]||targets.center;
 animateCamera({scale:targetScale,x:(.5-destination.x)*v.clientWidth*targetScale,y:(.5-destination.y)*v.clientHeight*targetScale},2500,destination.hero);
}
function zoom(delta){if(delta>0&&scale<1.5)focusWall();else if(delta<0&&scale>1.5)reset()}
function availableCharacters(){try{if(typeof root.shopEligibleBuyers==='function')return root.shopEligibleBuyers()||[];if(typeof shopEligibleBuyers==='function')return shopEligibleBuyers()||[]}catch(e){console.warn('Trophy character roster unavailable',e)}return []}
function renderCharacter(){const layer=byId('trophyRoomCharacterLayer'),cutout=byId('trophyRoomCharacterCutout'),picker=byId('trophyRoomCharacter');if(!layer||!cutout||!picker)return;const character=availableCharacters().find(c=>String(c.id)===picker.value);/* Uploaded Rollperson > Bilder > Helfigur (rustning); no synthesized equipment. */const images=character?.figureImages||character?.data?.figureImages;const src=images?.armored||'';const valid=typeof src==='string'&&src.startsWith('data:image/')&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(src);layer.hidden=!valid;if(valid){cutout.src=src;cutout.alt=(character?.identity?.namn||character?.name||'Rollperson')+' i rustning'}else{cutout.removeAttribute('src');cutout.alt=''} }
const MEDAL_BASE='https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/public/alea-hermes-public/';
let medalSequence=0;
function medalUrl(asset){
 if(asset?.asset_key?.startsWith('hermes-alea:'))return root.aleaHermesAleaImages?.resolve(asset)||null;
 const path=asset?.asset_path;
 if(typeof path!=='string'||!/^hermes\/system-asset\/arcane-adventure-medal-[a-z0-9-]+\/[a-f0-9]{64}\.webp$/.test(path))return null;
 return MEDAL_BASE+path;
}

/* JAKOB 4A: the medal stays a separate asset; the display frame is a HERMES system asset. */
const DISPLAY_FRAME_KEY='arcane-medal-display-red'; // Midwall; left=blue, right=green in later wall navigation.
let medalDialog=null,medalDialogReturnFocus=null;
function medalFrameUrl(asset){
 const path=asset?.asset_path;
 if(typeof path!=='string'||!/^hermes\/system-asset\/arcane-medal-display-(?:red|green|blue)\/[a-f0-9]{64}\.webp$/.test(path))return null;
 return MEDAL_BASE+path;
}
function formatGrantDate(value){
 if(!value)return 'Datum saknas';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Datum saknas':new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'long',year:'numeric'}).format(date);
}
function makeElement(tag,className,textValue){
 const el=document.createElement(tag);if(className)el.className=className;
 if(textValue!==undefined)el.textContent=textValue;
 return el;
}
function ensureMedalDialog(){
 if(medalDialog)return medalDialog;
 const dialog=document.createElement('dialog');dialog.id='arcaneMedalDisplay';dialog.className='arcane-medal-dialog';
 dialog.setAttribute('aria-labelledby','arcaneMedalTitle');
 const frame=makeElement('div','arcane-medal-display');
 const cushion=makeElement('section','arcane-medal-display-cushion');
 const medalImg=document.createElement('img');medalImg.id='arcaneMedalLargeImage';medalImg.className='arcane-medal-display-image';medalImg.alt='';cushion.append(medalImg);
 const parchment=makeElement('section','arcane-medal-display-parchment');
 const story=makeElement('div','arcane-medal-display-story');
 story.append(makeElement('h2','arcane-medal-display-title'));story.firstChild.id='arcaneMedalTitle';
 story.append(makeElement('p','arcane-medal-display-type','Äventyrsmedalj'));
 story.append(makeElement('p','arcane-medal-display-description'));
 story.append(makeElement('p','arcane-medal-display-reason'));
 story.append(makeElement('p','arcane-medal-display-date'));
 parchment.append(story);frame.append(cushion,parchment);
 const close=makeElement('button','arcane-medal-display-close','×');
 close.type='button';close.setAttribute('aria-label','Stäng medaljvisning');
 close.addEventListener('click',()=>dialog.close());
 dialog.append(close,frame);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{medalDialogReturnFocus?.focus?.();medalDialogReturnFocus=null});
 document.body.append(dialog);medalDialog=dialog;return dialog;
}
async function showMedalDetail(medal,trigger){
 const dialog=ensureMedalDialog();medalDialogReturnFocus=trigger;
 dialog.querySelector('#arcaneMedalTitle').textContent=medal.name;
 const large=dialog.querySelector('#arcaneMedalLargeImage');large.src=medal.url;large.alt=medal.name;
 dialog.querySelector('.arcane-medal-display-description').textContent=medal.description||'En längre krönika kan skrivas i medaljregistret.';
 const reason=dialog.querySelector('.arcane-medal-display-reason');reason.textContent=medal.reason?'Tilldelningsgrund: '+medal.reason:'';reason.hidden=!medal.reason;
 dialog.querySelector('.arcane-medal-display-date').textContent='Tilldelad: '+formatGrantDate(medal.grantedAt);
 if(!dialog.open)dialog.showModal();
 const frame=dialog.querySelector('.arcane-medal-display');
 frame.style.removeProperty('--medal-frame-image');
 if(typeof root.dbJson!=='function')return;
 try{
  const assets=await root.dbJson('arcane_system_assets?select=asset_key,asset_path&asset_key=eq.'+encodeURIComponent(DISPLAY_FRAME_KEY));
  const url=medalFrameUrl(Array.isArray(assets)?assets.find(a=>a.asset_key===DISPLAY_FRAME_KEY):null);
  if(dialog.open&&url)frame.style.setProperty('--medal-frame-image','url("'+url+'")');
 }catch(error){console.warn('ARCANE MEDAL DISPLAY frame awaiting HERMES',error)}
}
async function renderMedals(){
 const wall=byId('trophyRoomMedalWall'),picker=byId('trophyRoomCharacter');
 if(!wall||!picker)return;
 const seq=++medalSequence;wall.replaceChildren();wall.hidden=true;
 const character=availableCharacters().find(c=>String(c.id)===picker.value);
 const dbId=character?._dbId||character?.dbId||character?.data?.id||character?.id;
 if(!dbId||typeof root.dbJson!=='function')return;
 try{
  const [grants,definitions,assets,managedAssets]=await Promise.all([
   root.dbJson('honor_grants?select=honor_id,character_id,revoked_at,granted_at,reason&character_id=eq.'+encodeURIComponent(dbId)+'&revoked_at=is.null'),
   root.dbJson('honor_definitions?select=id,name,description,image_asset_id,status,visibility&type=eq.adventure'),
   root.dbJson('arcane_system_assets?select=asset_key,asset_path&asset_key=like.arcane-adventure-medal-*'),
   root.aleaHermesAleaImages?.loadAssets?.()||[]
  ]);
  if(seq!==medalSequence)return;
  const active=new Map((Array.isArray(grants)?grants:[]).map(g=>[String(g.honor_id),g]));
  const assetMap=new Map([...(Array.isArray(assets)?assets:[]),...(managedAssets||[])].map(a=>[a.asset_key,a]));
  const awarded=(Array.isArray(definitions)?definitions:[]).filter(d=>active.has(String(d.id))&&d.status==='active'&&d.visibility==='public').sort((a,b)=>String(a.name).localeCompare(String(b.name),'sv')).map(d=>({name:d.name,description:d.description||'',grantedAt:active.get(String(d.id))?.granted_at,reason:active.get(String(d.id))?.reason||'',url:medalUrl(assetMap.get(d.image_asset_id))})).filter(d=>d.url);
  // Only granted medals are rendered; no fixed capacity or empty placeholders.
  wall.style.setProperty('--medal-columns',String(Math.min(6,Math.max(1,awarded.length))));
  for(let i=0;i<awarded.length;i++){
   const slot=document.createElement('span');slot.className='trophy-room-medal-slot';
   const medal=awarded[i];
   if(medal){const trigger=makeElement('button','trophy-room-medal-trigger');trigger.type='button';trigger.setAttribute('aria-label','Visa medaljen '+medal.name);trigger.dataset.name=medal.name;const img=document.createElement('img');img.src=medal.url;img.alt='';img.loading='lazy';trigger.append(img);trigger.disabled=true;trigger.tabIndex=-1;trigger.addEventListener('click',e=>{e.stopPropagation();if(!medalInteractionReady())return;void showMedalDetail(medal,trigger)});slot.append(trigger)}
   wall.append(slot);
  }
  wall.hidden=false;updateMedalInteraction();
 }catch(error){
  if(seq!==medalSequence)return;
  console.warn('Trophy medal wall unavailable',error);
  const status=byId('trophyRoomStatus');if(status){status.hidden=false;status.textContent='Medaljerna kunde inte hämtas. Inga testmedaljer visas.'}
 }
}
function syncCharacters(){const target=byId('trophyRoomCharacter');if(!target)return;const previous=target.value;let list=[];try{if(typeof root.shopEligibleBuyers==='function')list=root.shopEligibleBuyers();else if(typeof shopEligibleBuyers==='function')list=shopEligibleBuyers()}catch(e){console.warn('Trophy room character list unavailable',e)}target.replaceChildren(new Option('Välj rollperson',''));if(Array.isArray(list)&&list.length){for(const c of list){if(c?.id!=null)target.add(new Option(c.identity?.namn||c.name||'Namnlös',String(c.id)))}}else{const source=byId('academyCharacter');if(source)for(const option of source.options){if(option.value&&!option.disabled)target.add(new Option(option.textContent,option.value))}}const options=[...target.options];if(previous&&options.some(o=>o.value===previous)){target.value=previous;return}const astrid=options.find(o=>o.value&&/\bastrid\b/i.test(o.textContent||''));if(astrid)target.value=astrid.value}
function ensureScene(){const v=viewport(),background=image(),wall=byId('trophyRoomMedalWall');if(!v||!background||!wall)return;let scene=byId('trophyRoomScene');if(!scene){scene=document.createElement('div');scene.id='trophyRoomScene';scene.className='trophy-room-scene';background.before(scene)}if(background.parentElement!==scene)scene.append(background);if(wall.parentElement!==v)v.append(wall)}
function open(){const p=page();if(!p)return;ensureScene();document.querySelectorAll('main > section[id]').forEach(s=>s.classList.toggle('hidden',s!==p));root.aleaJournalClose?.(false);document.body.classList.remove('shop-open','inn-open','academy-open');draw();try{syncCharacters();renderCharacter()}catch(error){console.error('Trophy character loading failed',error)}void renderMedals()}function close(){cancelCamera();document.querySelectorAll('main > section[id]').forEach(s=>s.classList.toggle('hidden',s.id!=='landing'))}ensureScene();const v=viewport();if(v){
 v.setAttribute('role','group');v.setAttribute('aria-label','Troférum. Tryck på vänster, mitten eller höger vägg för att åka dit. Välj en medalj för att läsa krönikan. Centrera återgår till helbild.');
 v.addEventListener('click',e=>{if(e.target.closest('button,select,.trophy-room-honor-preview'))return;if(cameraMotion||scale>=1.5)return;const rect=v.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width;focusWall(px<.36?'left':px>.64?'right':'center')});
 v.addEventListener('keydown',e=>{if(e.key==='Escape'&&scale>1.5){e.preventDefault();reset()}else if(e.key==='Escape')close();else if(e.key==='Enter'&&scale<1.5)focusWall();else if(e.key==='ArrowLeft'&&scale<1.5){e.preventDefault();focusWall('left')}else if(e.key==='ArrowRight'&&scale<1.5){e.preventDefault();focusWall('right')}else if(e.key==='0')reset()});
}
window.addEventListener('resize',draw,{passive:true});const img=image();if(img){img.src=URL;img.addEventListener('load',()=>{const s=byId('trophyRoomStatus');if(s)s.textContent='V2.2 · 1280 × 720 · 16:9';viewport().dataset.ready='true'});img.addEventListener('error',()=>{const s=byId('trophyRoomStatus');if(s)s.textContent='HERMES-publiceringen är inte aktiv ännu.'})}const picker=byId('trophyRoomCharacter');if(picker)picker.addEventListener('change',()=>{renderCharacter();void renderMedals();root.dispatchEvent(new CustomEvent('alea:trophy-character-change',{detail:{characterId:picker.value}}))});function showHonorPreview(detail){
 const actor=root.activeUser?.();
 if(!(actor?.admin||actor?.gm||actor?.isGM||actor?.role==='gm'))return;
 open();
 const v=viewport();if(!v)return;
 let layer=byId('trophyRoomHonorPreview');
 if(!layer){layer=document.createElement('aside');layer.id='trophyRoomHonorPreview';layer.className='trophy-room-honor-preview';layer.setAttribute('aria-label','Honors-förhandsvisning');v.append(layer)}
 layer.replaceChildren();
 const title=document.createElement('strong');title.textContent=detail.honorName||'ARCANE HONORS';layer.append(title);
 const art=document.createElement('div');art.className='trophy-room-honor-preview-art';layer.append(art);
 if(detail.frameUrl){const frame=document.createElement('img');frame.className='trophy-room-honor-frame';frame.src=detail.frameUrl;frame.alt='';art.append(frame)}
 if(detail.reliefUrl){const relief=document.createElement('img');relief.className='trophy-room-honor-relief';relief.src=detail.reliefUrl;relief.alt=detail.variantName||'Relief';art.append(relief)}
 else{const label=document.createElement('span');label.className='trophy-room-honor-relief-label';label.textContent=(detail.variantName||'Relief')+' · bild väntar på HERMES';art.append(label)}
 const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='trophy-room-honor-preview-close';closeButton.textContent='Tillbaka till ARCANE HONORS';
 closeButton.addEventListener('click',()=>{layer.hidden=true;root.openArcaneHonorsAdmin?.()});layer.append(closeButton);layer.hidden=false;
}
root.addEventListener('hermes-alea:image-change',()=>{void renderMedals()});
root.addEventListener('arcane-honors:preview',event=>showHonorPreview(event.detail||{}));
root.openTrophyRoom=open;root.closeTrophyRoom=close;root.trophyRoomZoom=zoom;root.trophyRoomReset=reset;root.trophyRoomFocusWall=focusWall;root.arcaneTrophyRoom=Object.freeze({key:KEY,open,close,zoom,reset})})(window);