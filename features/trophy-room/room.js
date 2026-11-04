(function(root){'use strict';const KEY='arcane-trophy-room-v2.2';let scale=1,x=0,y=0,drag=null;const byId=id=>document.getElementById(id);function page(){return byId('trophyRoomPage')||document.querySelector('.trophy-room-page')}function viewport(){return byId('trophyRoomViewport')}function image(){return byId('trophyRoomImage')}/* JAKOB 3H: one animation clock drives both the wall camera and hero. */
let cameraFrame=0,cameraMotion=null,suppressClick=false;
let heroPose={x:0,y:0,scale:1};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function clampCamera(){const v=viewport();if(!v)return;const maxX=Math.max(0,(scale-1)*v.clientWidth/2),maxY=Math.max(0,(scale-1)*v.clientHeight/2);x=clamp(x,-maxX,maxX);y=clamp(y,-maxY,maxY);if(scale<=1){x=0;y=0}}
function positionMedalWall(v){const wall=byId('trophyRoomMedalWall');if(!wall)return;const left=.4073,top=.2769,width=.1931,height=.3277;wall.style.left=(v.clientWidth*(.5+(left-.5)*scale)+x)+'px';wall.style.top=(v.clientHeight*(.5+(top-.5)*scale)+y)+'px';wall.style.width=(v.clientWidth*width*scale)+'px';wall.style.height=(v.clientHeight*height*scale)+'px'}
/* Right wall is an independent 3x3 badge plane; camera follows the medal wall. */
const BADGE_CAL_KEY='alea:trophy:badge-wall-corners:v1';
// Zeus-approved four corners, recovered verbatim from the original branch preview.
// Normalized to the room viewport; the perspective engine applies zoom and pan.
// Do not override these defaults with browser-local values on page load.
const BADGE_DEFAULT_CORNERS=[
 [0.7870891876614987,0.2888314872875548],
 [0.9175624798126615,0.2015233732524671],
 [0.9159727269056848,0.581491884822734],
 [0.7910635699289406,0.5939644725420322]
];
let badgeCorners=BADGE_DEFAULT_CORNERS.map(p=>p.slice());
function exportBadgeCorners(){
 const output=byId('trophyBadgeExportResult');
 if(!output)return;
 let raw=null;
 try{raw=root.localStorage.getItem(BADGE_CAL_KEY)}catch(_){}
 let corners=null;
 try{corners=raw?JSON.parse(raw):null}catch(_){}
 const valid=Array.isArray(corners)&&corners.length===4&&corners.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1));
 if(!valid){output.value='Inga giltiga lokalt sparade koordinater på denna Cloudflare-adress. Reservvärden exporteras inte.';output.hidden=false;return}
 const value=JSON.stringify({source:'localStorage',key:BADGE_CAL_KEY,origin:root.location.origin,corners});
 output.value=value;output.hidden=false;output.select();
 try{if(root.navigator?.clipboard?.writeText)void root.navigator.clipboard.writeText(value).catch(()=>{})}catch(_){}
}
let badgeCalibration=false;
function solveHomography(corners){
 const src=[[0,0],[1,0],[1,1],[0,1]],a=[];
 for(let i=0;i<4;i++){const [u,v]=src[i],[X,Y]=corners[i];a.push([u,v,1,0,0,0,-u*X,-v*X,X]);a.push([0,0,0,u,v,1,-u*Y,-v*Y,Y])}
 for(let c=0;c<8;c++){let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;if(Math.abs(a[pivot][c])<1e-10)return null;[a[c],a[pivot]]=[a[pivot],a[c]];const d=a[c][c];for(let j=c;j<9;j++)a[c][j]/=d;for(let r=0;r<8;r++)if(r!==c){const k=a[r][c];for(let j=c;j<9;j++)a[r][j]-=k*a[c][j]}}
 return a.map(row=>row[8]);
}
function badgeScreenPoint(p,v){return [v.clientWidth*(.5+(p[0]-.5)*scale)+x,v.clientHeight*(.5+(p[1]-.5)*scale)+y]}
/* ARCANE Perspective: each badge is an independent projective plane.
   The frame and relief share one CSS 3D homography; no full-screen transforms. */
function positionBadgeWall(v){
 const wall=byId('trophyRoomBadgeWall');if(!wall)return;
 const W=v.clientWidth,H=v.clientHeight;if(!W||!H)return;
 // Optical wall fit V2.2: inset from the left stone edge, retain a slight
 // rightward perspective expansion. Source calibration remains untouched.
 // Pixel-based optical adjustment on the 1280px V2.2 source image.
 // Change this single number to shift all nine badges without altering saved corners.
 const BADGE_WALL_OFFSET_X_PX=10;
 // Extend the right edge toward the red-marked wall boundary while keeping
 // the left edge and existing tapestry mask fixed.
 const BADGE_WALL_RIGHT_EXTENSION_PX=18;
 const BADGE_WALL_DOWN_PX=5;
 const fittedCorners=badgeCorners.map(([px,py],index)=>[
  Math.min(.97,Math.max(.05,px+(index===0||index===3?-.005:-.025)+BADGE_WALL_OFFSET_X_PX/1280+(index===1||index===2?BADGE_WALL_RIGHT_EXTENSION_PX/1280:0))),
  py+(index===0?-.002:index===1?-.004:index===2?.002:0)+BADGE_WALL_DOWN_PX/720
 ]);
 const h=solveHomography(fittedCorners);if(!h)return;
 const project=(u,t)=>{
  const [a,b,c,d,e,f,g,i]=h,den=g*u+i*t+1;
  return Math.abs(den)>1e-7?[(a*u+b*t+c)/den,(d*u+e*t+f)/den]:null;
 };
 wall.style.left='0px';wall.style.top='0px';wall.style.width=W+'px';wall.style.height=H+'px';
 wall.style.transform='none';wall.style.padding='0';wall.style.pointerEvents='none';
 wall.style.removeProperty('display');
 // Clip the badges to the dark masonry plane. The original room image remains
 // visible underneath, so any part crossing the tapestry edge disappears behind it.
 // These boundaries are room-image coordinates and follow camera zoom/pan.
 // Clip only left of the dark wall: a near-vertical edge bends outward toward
 // the lower tapestry, without excluding an entire badge column.
 const maskPolygon=[[.545,0],[1,0],[1,1],[.585,1],[.585,.80],[.573,.66],[.552,.35],[.545,0]];
 const clip=maskPolygon.map(p=>badgeScreenPoint(p,v).map((n,j)=>(n/(j?H:W)*100).toFixed(3)+'%').join(' ')).join(',');
 wall.style.clipPath='polygon('+clip+')';
 const tile=256,margin=.11;
 for(const [n,slot] of [...wall.querySelectorAll('.trophy-room-badge-slot')].entries()){
  const col=n%3,row=Math.floor(n/3);
  const u0=(col+margin)/3,u1=(col+1-margin)/3;
  const v0=(row+margin)/3,v1=(row+1-margin)/3;
  const quad=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,t])=>{
   const p=project(u,t);if(!p)return null;
   return [W*(.5+(p[0]-.5)*scale)+x,H*(.5+(p[1]-.5)*scale)+y];
  });
  if(quad.some(p=>!p))continue;
  // Normalize to viewport pixels before solving the local projective mapping.
  const dest=quad.map(p=>[p[0]/W,p[1]/H]);
  const matrix=solveHomography(dest);if(!matrix)continue;
  const [a,b,c,d,e,f,g,i]=matrix;
  const m=[a*W/tile,d*H/tile,0,g/tile,b*W/tile,e*H/tile,0,i/tile,0,0,1,0,c*W,f*H,0,1];
  if(!m.every(Number.isFinite))continue;
  slot.style.position='absolute';slot.style.left='0px';slot.style.top='0px';
  slot.style.width=tile+'px';slot.style.height=tile+'px';
  slot.style.transformOrigin='0 0';slot.style.transform='matrix3d('+m.join(',')+')';
 }
 const overlay=byId('trophyBadgeCalibration');
 if(overlay&&!overlay.hidden){
  const target=fittedCorners.map(p=>badgeScreenPoint(p,v));
  overlay.setAttribute('viewBox','0 0 '+W+' '+H);
  const polygon=overlay.querySelector('polygon');if(polygon)polygon.setAttribute('points',target.map(p=>p.join(',')).join(' '));
  overlay.querySelectorAll('[data-badge-corner]').forEach((node,j)=>{node.setAttribute('cx',target[j][0]);node.setAttribute('cy',target[j][1])});
 }
}
function enableBadgeCalibration(){
 const actor=root.activeUser?.();if(!(actor?.admin||actor?.is_admin))return;
 const v=viewport();if(!v)return;
 badgeCalibration=!badgeCalibration;
 let overlay=byId('trophyBadgeCalibration');
 if(!overlay){overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.id='trophyBadgeCalibration';overlay.setAttribute('aria-label','Kalibrera badgeväggens fyra hörn');
 const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');poly.setAttribute('fill','#e5bd7630');poly.setAttribute('stroke','#e5bd76');poly.setAttribute('stroke-width','2');overlay.append(poly);
 for(let j=0;j<4;j++){const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('data-badge-corner',String(j));dot.setAttribute('r','12');dot.setAttribute('fill','#e5bd76');dot.setAttribute('stroke','#171410');dot.setAttribute('stroke-width','3');dot.style.touchAction='none';dot.addEventListener('pointerdown',event=>{event.preventDefault();dot.setPointerCapture(event.pointerId)});dot.addEventListener('pointermove',event=>{if(!dot.hasPointerCapture(event.pointerId))return;const rect=v.getBoundingClientRect();const px=event.clientX-rect.left,py=event.clientY-rect.top;badgeCorners[j]=[Math.max(0,Math.min(1,(px-x-v.clientWidth*(1-scale)/2)/(v.clientWidth*scale))),Math.max(0,Math.min(1,(py-y-v.clientHeight*(1-scale)/2)/(v.clientHeight*scale)))];draw()});overlay.append(dot)}
 v.append(overlay)}
 overlay.hidden=!badgeCalibration;
 const button=byId('trophyBadgeCalibrate');if(button)button.textContent=badgeCalibration?'Spara väggperspektiv':'Kalibrera badgevägg';
 if(!badgeCalibration)try{root.localStorage.setItem(BADGE_CAL_KEY,JSON.stringify(badgeCorners))}catch(_){}
 draw();
}

let badgeSequence=0;
async function renderBadges(){
 const wall=byId('trophyRoomBadgeWall'),picker=byId('trophyRoomCharacter');if(!wall||!picker)return;
 const seq=++badgeSequence;wall.replaceChildren();wall.hidden=true;
 const character=availableCharacters().find(c=>String(c.id)===picker.value);
 const dbId=character?._dbId||character?.dbId||character?.data?.id||character?.id;
 if(!dbId||typeof root.dbJson!=='function')return;
 try{
  const [grants,definitions,variants,assets]=await Promise.all([
   root.dbJson('honor_grants?select=honor_id,character_id,revoked_at&character_id=eq.'+encodeURIComponent(dbId)+'&revoked_at=is.null'),
   root.dbJson('honor_definitions?select=id,name,description,category,status,published_variant_id,preview_variant_id,image_asset_id,badge_frame_assets,tier_criteria&category=eq.badge'),
   root.dbJson('honor_relief_variants?select=id,honor_id,status,allow_overhang,image_asset_id'),
   root.dbJson('arcane_system_assets?select=asset_key,asset_path&asset_key=like.arcane-*')
  ]);
  if(seq!==badgeSequence)return;
  const active=new Set((grants||[]).map(g=>String(g.honor_id)));
  const assetMap=new Map((assets||[]).map(a=>[a.asset_key,a]));
  const variantsById=new Map((variants||[]).map(v=>[String(v.id),v]));
  const awarded=(definitions||[]).filter(d=>active.has(String(d.id))&&d.category==='badge').sort((a,b)=>String(a.name).localeCompare(String(b.name),'sv')).slice(0,9);
  // Reserve nine positions; render each awarded badge only once.
  for(let index=0;index<9;index++){
   const d=awarded[index];
   const slot=document.createElement('div');slot.className='trophy-room-badge-slot';
   if(!d){slot.classList.add('trophy-room-badge-empty');slot.setAttribute('aria-hidden','true');wall.append(slot);continue}
   slot.title=d.name;
   const selected=d.published_variant_id||d.preview_variant_id||(variants||[]).find(v=>String(v.honor_id)===String(d.id)&&v.image_asset_id)?.id;
   const variant=variantsById.get(String(selected));
   const frameKey=d.badge_frame_assets?.[selected];
   const relief=assetMap.get(variant?.image_asset_id||d.image_asset_id);
   const frame=assetMap.get(frameKey);
   const art=document.createElement('div');art.className='trophy-room-badge-art'+(variant?.allow_overhang?' is-overhanging':'');
   const reliefUrl=relief?.asset_path?systemAssetUrl(relief.asset_path):null;
   const frameUrl=frame?.asset_path?systemAssetUrl(frame.asset_path):null;
   if(reliefUrl){const img=document.createElement('img');img.className='trophy-room-badge-relief';img.src=reliefUrl;img.alt=d.name;art.append(img)}
   else{const fallback=document.createElement('span');fallback.className='trophy-room-badge-label';fallback.textContent=d.name;art.append(fallback)}
   if(frameUrl){const img=document.createElement('img');img.className='trophy-room-badge-frame';img.src=frameUrl;img.alt='';art.append(img)}
   slot.append(art);
   const stars=Math.max(0,Math.min(3,Number(d.tier_criteria?.gold_stars||0)));
   if(stars){const marker=document.createElement('span');marker.className='trophy-room-badge-stars';marker.textContent='★'.repeat(stars);marker.setAttribute('aria-label',stars+' guldstjärnor');slot.append(marker)}
   wall.append(slot);
  }
  wall.hidden=awarded.length===0;draw();
 }catch(error){if(seq!==badgeSequence)return;console.warn('Trophy badge wall unavailable',error)}
}
function medalInteractionReady(){return !cameraMotion&&scale>=2.24}
function updateMedalInteraction(){const ready=medalInteractionReady();const v=viewport();if(v)v.classList.toggle('trophy-room-medals-active',ready);for(const button of document.querySelectorAll('#trophyRoomMedalWall .trophy-room-medal-trigger')){button.disabled=!ready;button.tabIndex=ready?0:-1}}
function draw(){clampCamera();
 const v=viewport();if(!v)return;
 const scene=byId('trophyRoomScene'),hero=byId('trophyRoomCharacterLayer');
 v.style.setProperty('--pan-x',x+'px');v.style.setProperty('--pan-y',y+'px');v.style.setProperty('--zoom',String(scale));
 if(scene)scene.style.transform='translate3d('+x+'px,'+y+'px,0) scale('+scale+')';positionMedalWall(v);positionBadgeWall(v);
 if(hero){
  const width=v.clientWidth,height=v.clientHeight;
  const heroWidth=hero.offsetWidth||width*.30;
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
 const mobile=v.clientWidth<700;
 const targetScale=mobile&&side==='right'?1.85:2.25;
 const targets={
  center:{x:.4073+.1931/2,y:.2769+.3277/2,hero:{x:-.36,y:.66,scale:2.45}},
  left:{x:.22,y:.42,hero:{x:.32,y:.66,scale:2.45}},
  right:{x:.75,y:.44,hero:{x:-.32,y:mobile?.46:.66,scale:mobile?2.0:2.45}}
 };
 const destination=targets[side]||targets.center;
 animateCamera({scale:targetScale,x:(.5-destination.x)*v.clientWidth*targetScale,y:(.5-destination.y)*v.clientHeight*targetScale},2500,destination.hero);
}
function zoom(delta){if(delta>0&&scale<1.5)focusWall();else if(delta<0&&scale>1.5)reset()}
function availableCharacters(){try{if(typeof root.shopEligibleBuyers==='function')return root.shopEligibleBuyers()||[];if(typeof shopEligibleBuyers==='function')return shopEligibleBuyers()||[]}catch(e){console.warn('Trophy character roster unavailable',e)}return []}
function renderCharacter(){const layer=byId('trophyRoomCharacterLayer'),cutout=byId('trophyRoomCharacterCutout'),picker=byId('trophyRoomCharacter');if(!layer||!cutout||!picker)return;const character=availableCharacters().find(c=>String(c.id)===picker.value);/* Uploaded Rollperson > Bilder > Helfigur (rustning); no synthesized equipment. */const images=character?.figureImages||character?.data?.figureImages;const src=images?.armored||'';const valid=typeof src==='string'&&src.startsWith('data:image/')&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(src);layer.hidden=!valid;if(valid){cutout.src=src;cutout.alt=(character?.identity?.namn||character?.name||'Rollperson')+' i rustning'}else{cutout.removeAttribute('src');cutout.alt=''} }
let medalSequence=0;
function systemAssetUrl(path){
 if(typeof path!=='string'||!/^hermes\/system-asset\/[a-z0-9][a-z0-9_.-]*\/[a-f0-9]{64}\.webp$/.test(path)||typeof SUPABASE_URL!=='string'||!SUPABASE_URL)return null;
 return SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/public/alea-hermes-public/'+path.split('/').map(encodeURIComponent).join('/');
}
function medalUrl(asset){
 if(asset?.asset_key?.startsWith('hermes-alea:'))return root.aleaHermesAleaImages?.resolve(asset)||null;
 const path=asset?.asset_path;
 if(typeof path!=='string'||!/^hermes\/system-asset\/arcane-adventure-medal-[a-z0-9-]+\/[a-f0-9]{64}\.webp$/.test(path))return null;
 return systemAssetUrl(path);
}

/* JAKOB 4A: the medal stays a separate asset; the display frame is a HERMES system asset. */
const DISPLAY_FRAME_KEY='arcane-badge-frame-velvet-red'; // Published red velvet display for adventure medals.
let medalDialog=null,medalDialogReturnFocus=null;
function medalFrameUrl(asset){
 const path=asset?.asset_path;
 if(typeof path!=='string'||!/^hermes\/system-asset\/arcane-badge-frame-velvet-(?:red|green|blue)\/[a-f0-9]{64}\.webp$/.test(path))return null;
 return systemAssetUrl(path);
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
 frame.style.removeProperty('--medal-frame-ratio');
 if(typeof root.dbJson!=='function')return;
 try{
  const assets=await root.dbJson('arcane_system_assets?select=asset_key,asset_path&asset_key=eq.'+encodeURIComponent(DISPLAY_FRAME_KEY));
  const url=medalFrameUrl(Array.isArray(assets)?assets.find(a=>a.asset_key===DISPLAY_FRAME_KEY):null);
  if(dialog.open&&url){
   const background='url("'+url+'")';
   frame.style.setProperty('--medal-frame-image',background);
   const ratioProbe=new Image();
   ratioProbe.onload=()=>{
    if(dialog.open&&frame.style.getPropertyValue('--medal-frame-image')===background&&ratioProbe.naturalWidth&&ratioProbe.naturalHeight){
     frame.style.setProperty('--medal-frame-ratio',ratioProbe.naturalWidth+' / '+ratioProbe.naturalHeight);
    }
   };
   ratioProbe.src=url;
  }
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
function ensureScene(){const v=viewport(),background=image(),wall=byId('trophyRoomMedalWall');if(!v||!background||!wall)return;let scene=byId('trophyRoomScene');if(!scene){scene=document.createElement('div');scene.id='trophyRoomScene';scene.className='trophy-room-scene';background.before(scene)}if(background.parentElement!==scene)scene.append(background);if(wall.parentElement!==v)v.append(wall);const badgeWall=byId('trophyRoomBadgeWall');if(badgeWall&&badgeWall.parentElement!==v)v.append(badgeWall)}
function open(){const p=page();if(!p)return;ensureScene();const admin=root.activeUser?.();const calibrate=byId('trophyBadgeCalibrate');if(calibrate)calibrate.hidden=!(admin?.admin||admin?.is_admin);document.querySelectorAll('main > section[id]').forEach(s=>s.classList.toggle('hidden',s!==p));root.aleaJournalClose?.(false);document.body.classList.remove('shop-open','inn-open','academy-open');draw();try{syncCharacters();renderCharacter()}catch(error){console.error('Trophy character loading failed',error)}void renderMedals();void renderBadges()}function close(){cancelCamera();document.querySelectorAll('main > section[id]').forEach(s=>s.classList.toggle('hidden',s.id!=='landing'))}ensureScene();const v=viewport();if(v){
 v.setAttribute('role','group');v.setAttribute('aria-label','Troférum. Tryck på vänster, mitten eller höger vägg för att åka dit. Välj en medalj för att läsa krönikan. Centrera återgår till helbild.');
 v.addEventListener('click',e=>{if(e.target.closest('button,select,.trophy-room-honor-preview'))return;if(cameraMotion||scale>=1.5)return;const rect=v.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width;focusWall(px<.36?'left':px>.64?'right':'center')});
 v.addEventListener('keydown',e=>{if(e.key==='Escape'&&scale>1.5){e.preventDefault();reset()}else if(e.key==='Escape')close();else if(e.key==='Enter'&&scale<1.5)focusWall();else if(e.key==='ArrowLeft'&&scale<1.5){e.preventDefault();focusWall('left')}else if(e.key==='ArrowRight'&&scale<1.5){e.preventDefault();focusWall('right')}else if(e.key==='0')reset()});
}
window.addEventListener('resize',draw,{passive:true});const img=image();if(img){img.addEventListener('load',()=>{const s=byId('trophyRoomStatus');if(s)s.textContent='V2.2 · 1280 × 720 · 16:9';viewport().dataset.ready='true'});img.addEventListener('error',()=>{const s=byId('trophyRoomStatus');if(s)s.textContent='HERMES-publiceringen är inte aktiv ännu.'});void(async()=>{try{if(typeof root.dbJson!=='function'){await new Promise(resolve=>setTimeout(resolve,700));if(typeof root.dbJson!=='function')throw Error('HERMES-registret är inte tillgängligt');}const assets=await root.dbJson('arcane_system_assets?select=asset_key,asset_path&asset_key=eq.'+encodeURIComponent(KEY));const asset=Array.isArray(assets)?assets.find(row=>row.asset_key===KEY):null;const path=asset?.asset_path;if(typeof path!=='string'||!/^hermes\/system-asset\/arcane-trophy-room-v2\.2\/[a-f0-9]{64}\.webp$/.test(path))throw Error('Troférummets HERMES-bild saknas i aktuellt miljöregister');const url=systemAssetUrl(path);if(!url)throw Error('Supabase-miljön kunde inte bestämmas');img.src=url}catch(error){console.warn('Trophy room HERMES image unavailable',error);const s=byId('trophyRoomStatus');if(s)s.textContent='HERMES-publiceringen är inte aktiv ännu.'}})()}const picker=byId('trophyRoomCharacter');if(picker)picker.addEventListener('change',()=>{renderCharacter();void renderMedals();void renderBadges();root.dispatchEvent(new CustomEvent('alea:trophy-character-change',{detail:{characterId:picker.value}}))});function showHonorPreview(detail){
 const actor=root.activeUser?.();
 if(!(actor?.admin||actor?.gm||actor?.isGM||actor?.role==='gm'))return;
 open();
 const v=viewport();if(!v)return;
 let layer=byId('trophyRoomHonorPreview');
 if(!layer){layer=document.createElement('aside');layer.id='trophyRoomHonorPreview';layer.className='trophy-room-honor-preview';layer.setAttribute('aria-label','Honors-förhandsvisning');v.append(layer)}
 layer.replaceChildren();
 const title=document.createElement('strong');title.textContent=detail.honorName||'ARCANE HONORS';layer.append(title);
 const previewGrid=document.createElement('div');previewGrid.className='trophy-room-honor-preview-grid';layer.append(previewGrid);
 const tiers=[['bronze','Brons'],['silver','Silver'],['gold','Guld']];
 for(const [key,labelText] of tiers){
  const card=document.createElement('div');card.className='trophy-room-honor-preview-tier';
  const label=document.createElement('span');label.textContent=labelText;card.append(label);
  const art=document.createElement('div');art.className='trophy-room-honor-preview-art'+(detail.allowOverhang?' is-overhanging':'');card.append(art);
  const frameUrl=detail.frameUrls?.[key]||(key==='bronze'?detail.frameUrl:null);
  if(frameUrl){const frame=document.createElement('img');frame.className='trophy-room-honor-frame';frame.src=frameUrl;frame.alt='';art.append(frame)}
  if(detail.reliefUrl){const relief=document.createElement('img');relief.className='trophy-room-honor-relief';relief.src=detail.reliefUrl;relief.alt=detail.variantName||'Relief';art.append(relief)}
  else{const empty=document.createElement('span');empty.className='trophy-room-honor-relief-label';empty.textContent=(detail.variantName||'Relief')+' · bild väntar på HERMES';art.append(empty)}
  previewGrid.append(card);
 }
 const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='trophy-room-honor-preview-close';closeButton.textContent='Tillbaka till ARCANE HONORS';
 closeButton.addEventListener('click',()=>{layer.hidden=true;root.openArcaneHonorsAdmin?.()});layer.append(closeButton);layer.hidden=false;
}
root.addEventListener('hermes-alea:image-change',()=>{void renderMedals();void renderBadges()});
root.addEventListener('arcane-honors:preview',event=>showHonorPreview(event.detail||{}));
root.openTrophyRoom=open;root.closeTrophyRoom=close;root.trophyRoomZoom=zoom;root.trophyRoomReset=reset;root.trophyBadgeCalibrate=enableBadgeCalibration;root.trophyBadgeExport=exportBadgeCorners;root.trophyRoomFocusWall=focusWall;root.arcaneTrophyRoom=Object.freeze({key:KEY,open,close,zoom,reset});/* Deep links are handled after authentication and route restoration in enterApp. */})(window);
