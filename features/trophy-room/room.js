(function(root){'use strict';const KEY='arcane-trophy-room-v2.2',URL='https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/public/alea-hermes-public/hermes/system-asset/arcane-trophy-room-v2.2/c9e8d5d3807df1ded67669afbe64db33c5098f12082576e56e3a91fa2e05aa55.webp';let scale=1,x=0,y=0,drag=null;const byId=id=>document.getElementById(id);function page(){return byId('trophyRoomPage')||document.querySelector('.trophy-room-page')}function viewport(){return byId('trophyRoomViewport')}function image(){return byId('trophyRoomImage')}function draw(){const v=viewport();if(!v)return;v.style.setProperty('--zoom',String(scale));v.style.setProperty('--pan-x',x+'px');v.style.setProperty('--pan-y',y+'px');const out=byId('trophyRoomZoomValue');if(out)out.value=Math.round(scale*100)+'%'}function reset(){scale=1;x=0;y=0;draw()}function zoom(delta){scale=Math.max(1,Math.min(4,scale+delta));draw()}function availableCharacters(){try{if(typeof root.shopEligibleBuyers==='function')return root.shopEligibleBuyers()||[];if(typeof shopEligibleBuyers==='function')return shopEligibleBuyers()||[]}catch(e){console.warn('Trophy character roster unavailable',e)}return []}
function renderCharacter(){const layer=byId('trophyRoomCharacterLayer'),cutout=byId('trophyRoomCharacterCutout'),picker=byId('trophyRoomCharacter');if(!layer||!cutout||!picker)return;const character=availableCharacters().find(c=>String(c.id)===picker.value);/* Uploaded Rollperson > Bilder > Helfigur (rustning); no synthesized equipment. */const images=character?.figureImages||character?.data?.figureImages;const src=images?.armored||'';const valid=typeof src==='string'&&src.startsWith('data:image/')&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(src);layer.hidden=!valid;if(valid){cutout.src=src;cutout.alt=(character?.identity?.namn||character?.name||'Rollperson')+' i rustning'}else{cutout.removeAttribute('src');cutout.alt=''} }
const MEDAL_BASE='https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/public/alea-hermes-public/';
let medalSequence=0;
function medalUrl(asset){
 const path=asset?.asset_path;
 if(typeof path!=='string'||!/^hermes\/system-asset\/arcane-adventure-medal-[a-z0-9-]+\/[a-f0-9]{64}\.webp$/.test(path))return null;
 return MEDAL_BASE+path;
}
async function renderMedals(){
 const wall=byId('trophyRoomMedalWall'),picker=byId('trophyRoomCharacter');
 if(!wall||!picker)return;
 const seq=++medalSequence;wall.replaceChildren();wall.hidden=true;
 const character=availableCharacters().find(c=>String(c.id)===picker.value);
 const dbId=character?._dbId||character?.dbId||character?.id;
 if(!dbId||typeof root.dbJson!=='function')return;
 try{
  const [grants,definitions,assets]=await Promise.all([
   root.dbJson('honor_grants?select=honor_id,character_id,revoked_at&character_id=eq.'+encodeURIComponent(dbId)+'&revoked_at=is.null'),
   root.dbJson('honor_definitions?select=id,name,image_asset_id,status,visibility&type=eq.adventure'),
   root.dbJson('arcane_system_assets?select=asset_key,asset_path&asset_key=like.arcane-adventure-medal-*')
  ]);
  if(seq!==medalSequence)return;
  const active=new Set((Array.isArray(grants)?grants:[]).map(g=>String(g.honor_id)));
  const assetMap=new Map((Array.isArray(assets)?assets:[]).map(a=>[a.asset_key,a]));
  const awarded=(Array.isArray(definitions)?definitions:[]).filter(d=>active.has(String(d.id))&&d.status==='active'&&d.visibility==='public').map(d=>({name:d.name,url:medalUrl(assetMap.get(d.image_asset_id))})).filter(d=>d.url).slice(0,30);
  // Thirty permanent positions; no placeholder medals masquerading as awards.
  for(let i=0;i<30;i++){
   const slot=document.createElement('span');slot.className='trophy-room-medal-slot';
   const medal=awarded[i];
   if(medal){const img=document.createElement('img');img.src=medal.url;img.alt=medal.name;img.loading='lazy';slot.append(img);slot.title=medal.name}
   wall.append(slot);
  }
  wall.hidden=false;
 }catch(error){
  if(seq!==medalSequence)return;
  console.warn('Trophy medal wall unavailable',error);
  const status=byId('trophyRoomStatus');if(status){status.hidden=false;status.textContent='Medaljerna kunde inte hämtas. Inga testmedaljer visas.'}
 }
}
function syncCharacters(){const target=byId('trophyRoomCharacter');if(!target)return;const previous=target.value;let list=[];try{if(typeof root.shopEligibleBuyers==='function')list=root.shopEligibleBuyers();else if(typeof shopEligibleBuyers==='function')list=shopEligibleBuyers()}catch(e){console.warn('Trophy room character list unavailable',e)}target.replaceChildren(new Option('Välj rollperson',''));if(Array.isArray(list)&&list.length){for(const c of list){if(c?.id!=null)target.add(new Option(c.identity?.namn||c.name||'Namnlös',String(c.id)))}}else{const source=byId('academyCharacter');if(source)for(const option of source.options){if(option.value&&!option.disabled)target.add(new Option(option.textContent,option.value))}}const options=[...target.options];if(previous&&options.some(o=>o.value===previous)){target.value=previous;return}const astrid=options.find(o=>o.value&&/\bastrid\b/i.test(o.textContent||''));if(astrid)target.value=astrid.value}
function open(){const p=page();if(!p)return;document.querySelectorAll('main > section[id]').forEach(s=>s.classList.toggle('hidden',s!==p));root.aleaJournalClose?.(false);document.body.classList.remove('shop-open','inn-open','academy-open');draw();try{syncCharacters();renderCharacter()}catch(error){console.error('Trophy character loading failed',error)}void renderMedals()}function close(){document.querySelectorAll('main > section[id]').forEach(s=>s.classList.toggle('hidden',s.id!=='landing'))}const v=viewport();if(v){v.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?.12:-.12)},{passive:false});v.addEventListener('pointerdown',e=>{drag={x:e.clientX-x,y:e.clientY-y};v.setPointerCapture(e.pointerId)});v.addEventListener('pointermove',e=>{if(!drag)return;x=e.clientX-drag.x;y=e.clientY-drag.y;draw()});for(const name of ['pointerup','pointercancel'])v.addEventListener(name,()=>{drag=null});v.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='+'||e.key==='=')zoom(.15);if(e.key==='-')zoom(-.15);if(e.key==='0')reset()})}const img=image();if(img){img.src=URL;img.addEventListener('load',()=>{const s=byId('trophyRoomStatus');if(s)s.textContent='V2.2 · 1280 × 720 · 16:9';viewport().dataset.ready='true'});img.addEventListener('error',()=>{const s=byId('trophyRoomStatus');if(s)s.textContent='HERMES-publiceringen är inte aktiv ännu.'})}const picker=byId('trophyRoomCharacter');if(picker)picker.addEventListener('change',()=>{renderCharacter();void renderMedals();root.dispatchEvent(new CustomEvent('alea:trophy-character-change',{detail:{characterId:picker.value}}))});function showHonorPreview(detail){
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
root.addEventListener('arcane-honors:preview',event=>showHonorPreview(event.detail||{}));
root.openTrophyRoom=open;root.closeTrophyRoom=close;root.trophyRoomZoom=zoom;root.trophyRoomReset=reset;root.arcaneTrophyRoom=Object.freeze({key:KEY,open,close,zoom,reset})})(window);