/* Alea Crusaders v0.35.199 – locked magic-carousel MVP.
 * UI-only selector. The existing Expert preparation, cast and dice code
 * remains authoritative. No spell is cast by clicking a carousel tile. */
const COMBAT_MAGIC_CAROUSEL_MAX=12;
const combatMagicCarouselOffsets=new Map();
const combatMagicCarouselOrders=new Map();
const combatMagicCarouselSelectedKeys=new Map();
let combatMagicCarouselMotion=null;
let combatMagicCancelBusy=false;

function combatMagicCarouselIdentity(actor){
 return String(centralCampaignId||'')+':'+String(actor?.source_type||'')+':'+String(actor?.source_id||actor?.id||'');
}
function combatMagicCarouselUsage(actor){
 try{
  const value=JSON.parse(localStorage.getItem('alea.magic.usage:'+combatMagicCarouselIdentity(actor))||'{}');
  return {counts:value.counts&&typeof value.counts==='object'?value.counts:{},
   seen:value.seen&&typeof value.seen==='object'?value.seen:{}};
 }catch(_){return {counts:{},seen:{}}}
}
function combatMagicCarouselRecordCasts(){
 if(!activeCombat)return;
 const changed=new Map();
 for(const action of combatActions||[]){
  if(action?.status!=='resolved'||action.source_data?.action_key!=='spell_cast'||
     !action.result?.outcome||!action.source_data?.spell_name)continue;
  const actor=combatants.find(row=>String(row.id)===String(action.combatant_id));
  if(!actor)continue;
  const id=combatMagicCarouselIdentity(actor);
  const usage=changed.get(id)||combatMagicCarouselUsage(actor);
  const castId=String(action.id);
  if(usage.seen[castId])continue;
  const spellName=String(action.source_data.spell_name).trim().toLocaleLowerCase('sv-SE');
  usage.seen[castId]=true;
  usage.counts[spellName]=(Number(usage.counts[spellName])||0)+1;
  changed.set(id,usage);
 }
 for(const [id,usage] of changed){
  try{
   const seen=Object.keys(usage.seen);
   if(seen.length>650)usage.seen=Object.fromEntries(seen.slice(-450).map(key=>[key,true]));
   localStorage.setItem('alea.magic.usage:'+id,JSON.stringify(usage));
  }catch(error){console.warn('Magikarusell: användningsstatistik kunde inte sparas',error)}
 }
}
function combatMagicCarouselItems(actor,action){
 const all=combatSpellOptions(actor),battleKey=String(activeCombat?.id||'')+':'+combatMagicCarouselIdentity(actor);
 let order=combatMagicCarouselOrders.get(battleKey);
 if(!order){
  // Freeze the order for the full battle, including after a page reload.
  // It is safe if browser storage is unavailable: use this session's cache.
  const orderStorageKey='alea.magic.order:'+battleKey;
  try{
   const saved=JSON.parse(localStorage.getItem(orderStorageKey)||'null');
   if(Array.isArray(saved)&&saved.length)order=saved;
  }catch(_){}
 }
 if(!order){
  const counts=combatMagicCarouselUsage(actor).counts;
  order=[...all].sort((a,b)=>{
   const count=row=>Number(counts[String(row.name||'').trim().toLocaleLowerCase('sv-SE')])||0;
   // During the prototype, show the two available real icons first when
   // usage counts are tied. Actual cast frequency always outranks artwork.
   const art=row=>combatSpellArtPath(row.icon_path)?2:combatSpellArtPath(row.image_path)?1:0;
   return count(b)-count(a)||art(b)-art(a)||String(a.name||'').localeCompare(String(b.name||''),'sv',{sensitivity:'base'})||
    combatSpellKey(a).localeCompare(combatSpellKey(b),'sv',{sensitivity:'base'})
  }).map(combatSpellKey);
  try{localStorage.setItem('alea.magic.order:'+battleKey,JSON.stringify(order))}catch(_){}
 }
 combatMagicCarouselOrders.set(battleKey,order); // frozen throughout battle
 const byKey=new Map(all.map(spell=>[combatSpellKey(spell),spell]));
 // A spell introduced during an ongoing combat must remain reachable.
 const missing=all.filter(spell=>!order.includes(combatSpellKey(spell)));
 const items=[...order.map(key=>byKey.get(key)).filter(Boolean),...missing].slice(0,COMBAT_MAGIC_CAROUSEL_MAX);
 const selected=byKey.get(String(action?.source_data?.spell_key||''));
 // A spell picked through "Alla" always appears in the visible carousel.
 if(selected&&!items.some(spell=>combatSpellKey(spell)===combatSpellKey(selected))){
  if(items.length===COMBAT_MAGIC_CAROUSEL_MAX)items.pop();
  items.push(selected);
 }
 return {items,total:all.length}
}
/* Expert spell tags live in the master name, or in dedicated rule flags.
 * Only trailing single-letter classifications are removed from tile captions;
 * parenthetical names such as FATA MORGANA (STOR ILLUSION) are preserved. */
function combatMagicCarouselTags(spell){
 const name=String(spell?.name||'');
 const suffix=/\s*\(([FKR](?:\s*,\s*[FKR])*)\)\s*$/i.exec(name);
 const letters=new Set(suffix?suffix[1].toUpperCase().split(/\s*,\s*/):[]);
 if(spell?.kvick===true)letters.add('K');
 if(spell?.ritual===true)letters.add('R');
 return {
  name:suffix?name.slice(0,suffix.index).trim():name,
  marks:['F','K','R'].filter(letter=>letters.has(letter)).map(code=>({
   code,label:{F:'Fysisk',K:'Kvick',R:'Ritual'}[code],
   css:{F:'physical',K:'quick',R:'ritual'}[code]
  }))
 };
}
function combatMagicCarouselGlyph(value){
 const name=String(value||'').toLocaleLowerCase('sv-SE');
 if(/eld|brand|flam|salamander/.test(name))return '🔥';
 if(/blixt|ås|elektr/.test(name))return '⚡';
 if(/is|frost|köld/.test(name))return '❄';
 if(/skydd|beskydd|antimagi/.test(name))return '🛡';
 if(/jord|sten|klippa/.test(name))return '◆';
 if(/vatten|undin|regn/.test(name))return '💧';
 if(/luft|vind|storm|flyg/.test(name))return '✧';
 if(/mörk|skugg|natt/.test(name))return '☾';
 if(/ljus|sol/.test(name))return '☀';
 if(/hela|läk/.test(name))return '✚';
 return '✦';
}
function combatSpellCarouselHtml(actor,action){
 const {items,total}=combatMagicCarouselItems(actor,action);
 if(!items.length)return '<p class="combat-spell-empty">Inga tillgängliga besvärjelser.</p>';
 const actorId=String(actor.id),chosen=String(action?.source_data?.spell_key||'');
 const key=String(activeCombat?.id||'')+':'+actorId;
 // When the caster picks a new spell, scroll it into the highlighted
 // center slot. Mere arrow/swipe navigation must NOT change the choice.
 if(!combatMagicCarouselOffsets.has(key)||combatMagicCarouselSelectedKeys.get(key)!==chosen){
  const ix=items.findIndex(spell=>combatSpellKey(spell)===chosen);
  combatMagicCarouselOffsets.set(key,ix<0?0:ix);
  combatMagicCarouselSelectedKeys.set(key,chosen);
 }
 const focus=((Number(combatMagicCarouselOffsets.get(key))||0)%items.length+items.length)%items.length;
 // Three or more complete cycles allow a physically continuous strip. The
 // current center sits in the middle copy; the animation quietly rebases
 // by one complete cycle when the user spins past its boundary.
 const repeats=Math.max(3,Math.ceil(11/items.length)|1);
 const cycles=repeats%2===0?repeats+1:repeats;
 const middleStart=Math.floor(cycles/2)*items.length;
 const nameOnPlaque=combatMagicCarouselTags(items[focus]).name;
 const tiles=Array.from({length:items.length*cycles},(_,i)=>{
  const spell=items[i%items.length],spellKey=combatSpellKey(spell),active=chosen===spellKey;
  const classification=combatMagicCarouselTags(spell);
  const marks=classification.marks.map(tag=>'<span class="combat-carousel-spell-mark '+tag.css+
   '" aria-hidden="true">'+tag.code+'</span>').join('');
  const hint=classification.marks.map(tag=>tag.label).join(', ');
  const path=combatSpellArtPath(spell.icon_path||spell.image_path);
  const disabled=spell.item_spell&&(!spell.item_spell.ready||spell.item_spell.cast_mode==='automatic'||!(Number(spell.fv)>0));
  const art=path?'<span class="combat-carousel-spell-art" data-spell-art-path="'+escAttr(path)+
   '" data-focus-x="'+combatSpellArtNumber(spell.icon_focus_x??spell.image_focus_x,50)+
   '" data-focus-y="'+combatSpellArtNumber(spell.icon_focus_y??spell.image_focus_y,50)+
   '" data-zoom="'+combatSpellArtNumber(spell.icon_zoom,120,100,300)+'"><img alt="" hidden></span>':
   '<span class="combat-carousel-spell-glyph" aria-hidden="true">'+combatMagicCarouselGlyph(spell.name)+'</span>';
  return '<button type="button" class="combat-carousel-spell-tile'+
   (i===middleStart+focus?' center':'')+(active?' selected':'')+
   '" data-spell-index="'+(i%items.length)+'" tabindex="-1" aria-hidden="true"'+
   ' title="'+escAttr(spell.name+(hint?' · '+hint:''))+'"'+(disabled?' disabled':'')+
   ' onclick="selectCombatPreparedSpell(\''+escAttr(actorId)+'\',\''+escAttr(spellKey)+'\')">'+
   art+(marks?'<span class="combat-carousel-spell-marks" aria-hidden="true">'+marks+'</span>':'')+
   '<span class="combat-carousel-spell-label">'+escAttr(classification.name)+'</span></button>';
 }).join('');
 return '<div class="combat-magic-carousel cryptex-prototype" data-actor-id="'+escAttr(actorId)+
  '" data-start="'+(middleStart+focus)+'" data-count="'+items.length+'" aria-label="Besvärjelsekarusell">'+
  '<div class="combat-magic-carousel-banner">'+
   '<div class="combat-cryptex-stage">'+
    '<div class="combat-magic-carousel-viewport">'+
     '<div class="combat-magic-carousel-track" role="group" tabindex="0" aria-label="Dra för att snurra besvärjelser, använd piltangenter och Enter">'+tiles+'</div>'+
    '</div>'+
    '<img class="combat-cryptex-housing" src="./features/combat/arcane-cryptex-housing.png?v=0.35.207" alt="" aria-hidden="true" draggable="false">'+
    '<span class="combat-cryptex-nameplate" aria-live="polite" title="'+escAttr(nameOnPlaque)+'">'+
     '<span class="combat-cryptex-nameplate-text">'+escAttr(nameOnPlaque)+'</span></span>'+ 
    '<button type="button" class="combat-cryptex-end-button combat-cryptex-end-button--prev"'+
     ' aria-label="Föregående besvärjelse" title="Föregående besvärjelse"'+
     ' onclick="combatShiftSpellCarousel(\''+escAttr(actorId)+'\',-1)"></button>'+
    '<button type="button" class="combat-cryptex-end-button combat-cryptex-end-button--next"'+
     ' aria-label="Nästa besvärjelse" title="Nästa besvärjelse"'+
     ' onclick="combatShiftSpellCarousel(\''+escAttr(actorId)+'\',1)"></button>'+
   '</div>'+
  '</div>'+
  '<div class="combat-magic-carousel-tools">'+
   (total>COMBAT_MAGIC_CAROUSEL_MAX?
    '<details class="combat-magic-carousel-all"><summary>⌕ Alla besvärjelser ('+total+')</summary>'+
      combatSpellChooserHtml(actor,action)+'</details>':'')+
   (action?.source_data?.spell_prepared&&!action.source_data?.item_magic?
    '<div class="combat-magic-carousel-eg" role="group" aria-label="Effektgrad">'+
     '<button type="button" aria-label="Minska effektgrad" onclick="stepCombatSpellEffect(\''+escAttr(actorId)+'\',-1)"'+
      (Number(action.source_data.effect_grade)<=1?' disabled':'')+'>−</button>'+
     '<strong>EG '+Math.max(1,Number(action.source_data.effect_grade)||1)+'</strong>'+
     '<button type="button" aria-label="Öka effektgrad" onclick="stepCombatSpellEffect(\''+escAttr(actorId)+'\',1)">+</button>'+
    '</div>':'')+
  '</div>'+
 '</div>';
}
/* Smooth, continuous carousel motion: 1:1 finger tracking, velocity-driven
 * coasting with exponential friction, then an eased snap to the closest
 * center. The DOM never re-renders while the wheel is moving. */
function combatShiftSpellCarousel(actorId,direction){
 const motion=combatMagicCarouselMotion;
 if(motion?.actorId===String(actorId)&&motion.root.isConnected){
  motion.nudge(Math.sign(direction)||1);
  return;
 }
 const actor=combatants.find(row=>String(row.id)===String(actorId)),action=combatChosenAction(actor);
 if(!actor||action?.source_data?.casting_spell)return;
 const {items}=combatMagicCarouselItems(actor,action);
 if(!items.length)return;
 const key=String(activeCombat?.id||'')+':'+actorId;
 const old=Number(combatMagicCarouselOffsets.get(key))||0;
 combatMagicCarouselOffsets.set(key,((old+direction)%items.length+items.length)%items.length);
 renderCombat();
}
function combatBindSpellCarousel(root){
 combatMagicCarouselMotion?.destroy?.();
 combatMagicCarouselMotion=null;
 const viewport=root?.querySelector('.combat-magic-carousel-viewport');
 const track=viewport?.querySelector('.combat-magic-carousel-track');
 const container=viewport?.closest('.combat-magic-carousel');
 if(!viewport||!track||!container)return;
 const nameplate=container.querySelector('.combat-cryptex-nameplate');
 let nameplateText=nameplate?.querySelector('.combat-cryptex-nameplate-text');
 const actorId=String(container.dataset.actorId);
 const count=Number(container.dataset.count)||1;
 const base=Math.floor(track.children.length/count/2)*count;
 const key=String(activeCombat?.id||'')+':'+actorId;
 const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 const positionStart=Number(container.dataset.start)||base;
 let position=positionStart,pitch=1,tileWidth=1,lastCenter=null,raf=0,drag=null;
 let vx=0,lastFrame=0,snap=null,suppressClickUntil=0,wheelEndTimer=null;
 const mod=(num,n)=>((num%n)+n)%n;
 const clamp=(num,a,b)=>Math.max(a,Math.min(b,num));
 const time=()=>performance.now();
 const live=()=>viewport.isConnected;
 const stop=()=>{
  if(raf)cancelAnimationFrame(raf);
  raf=0;lastFrame=0;snap=null;vx=0;
 };
 // Measure the *rendered* name rather than guessing by character count.
 // Short names stay centered; long names travel just far enough to show the ending.
 function measureNameplate(){
  if(!nameplate||!nameplateText)return;
  const style=getComputedStyle(nameplate);
  const available=nameplate.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
  const overflow=nameplateText.scrollWidth-available;
  const scrolling=available>0&&overflow>2;
  nameplate.classList.toggle('is-scrolling',scrolling);
  if(scrolling){
   nameplate.style.setProperty('--cryptex-scroll-distance',Math.ceil(overflow+2)+'px');
   nameplate.style.setProperty('--cryptex-scroll-duration',Math.max(7,Math.min(18,6+overflow/22)).toFixed(1)+'s');
  }else{
   nameplate.style.removeProperty('--cryptex-scroll-distance');
   nameplate.style.removeProperty('--cryptex-scroll-duration');
  }
 }
 function normalize(){
  // Every tile has identical copies. Swapping the index by a full cycle
  // keeps the same pixels at the same screen position without a visible jump.
  const low=base-.45,high=base+count-.45;
  while(position<low)position+=count;
  while(position>=high)position-=count;
 }
 function sync(){
  if(!live())return;
  normalize();
  const offset=(viewport.clientWidth-tileWidth)/2-position*pitch;
  track.style.transform='translate3d('+offset.toFixed(2)+'px,0,0)';
  const center=clamp(Math.round(position),0,track.children.length-1);
  if(center!==lastCenter){
   if(lastCenter!==null)track.children[lastCenter]?.classList.remove('center');
   track.children[center]?.classList.add('center');
   lastCenter=center;
  }
  // Perspective follows the continuous fractional position; fixed bronze frame stays still.
  if(container.classList.contains('cryptex-prototype')){
   for(let i=0;i<track.children.length;i++){
    const tile=track.children[i],distance=i-position;
    if(Math.abs(distance)>2.2){
     if(tile.style.transform)tile.style.transform='';
     if(tile.style.opacity)tile.style.opacity='';
     continue;
    }
    // The current tile fills the big square; neighbours shrink into the two smaller squares.
    const displacement=Math.min(1,Math.abs(distance));
    const angle=clamp(-distance*18,-48,48);
    const scale=1-displacement*.37;
    const sideRise=-viewport.clientHeight*.01*displacement;
    tile.style.transform='translateY('+sideRise.toFixed(2)+'px) perspective(700px) rotateY('+angle.toFixed(1)+'deg) scale('+scale.toFixed(3)+')';
    tile.style.opacity=String(1-Math.min(1,Math.abs(distance))*.20);
   }
  }
  const shown=track.children[center]?.querySelector('.combat-carousel-spell-label')?.textContent||'';
  if(nameplateText&&nameplateText.textContent!==shown){
   // Replace the inner span so every newly focused spell starts at its first letter.
   const next=nameplateText.cloneNode(false);
   next.textContent=shown;
   nameplateText.replaceWith(next);
   nameplateText=next;
   nameplate.title=shown;
   measureNameplate();
  }
  track.setAttribute('aria-label','Besvärjelse i mitten: '+shown+'. Piltangenter bläddrar, Enter väljer.');
  combatMagicCarouselOffsets.set(key,mod(Math.round(position),count));
 }
 function measure(){
  if(!live())return;
  const isMobile=typeof matchMedia==='function'?matchMedia('(max-width:760px)').matches:window.innerWidth<=760;
  const cryptex=container.classList.contains('cryptex-prototype');
  const visible=isMobile?3:5,gap=isMobile?6:9;
  // Squared Arcane Gold v2 openings: centres at 22.1%, 50%, 77.9%.
  // Middle tile is full size; side tiles are scaled down by sync() to fit their windows.
  tileWidth=cryptex?Math.max(48,viewport.clientWidth*.232):
   Math.max(42,(viewport.clientWidth-gap*(visible-1)-8)/visible);
  pitch=cryptex?viewport.clientWidth*.279:tileWidth+gap;
  const finalGap=cryptex?Math.max(0,pitch-tileWidth):gap;
  track.style.setProperty('--combat-carousel-tile-width',tileWidth+'px');
  track.style.setProperty('--combat-carousel-gap',finalGap+'px');
  sync();
  measureNameplate(); // Also adapt on window resize and orientation change.
 }
 function settle(){
  if(reduce){
   stop();position=Math.round(position);sync();return;
  }
  snap={from:position,to:Math.round(position),started:time(),duration:230};
  vx=0;lastFrame=0;
  if(!raf)raf=requestAnimationFrame(tick);
 }
 function tick(stamp){
  raf=0;
  if(!live())return;
  const dt=lastFrame?clamp(stamp-lastFrame,1,50):16;
  lastFrame=stamp;
  if(snap){
   const t=clamp((stamp-snap.started)/snap.duration,0,1);
   const ease=1-Math.pow(1-t,3);
   position=snap.from+(snap.to-snap.from)*ease;
   sync();
   if(t>=1){position=Math.round(position);snap=null;sync();lastFrame=0;return}
  }else{
   position+=vx*dt;
   vx*=Math.exp(-dt/420);
   sync();
   if(Math.abs(vx)<.00035){settle();return}
  }
  raf=requestAnimationFrame(tick);
 }
 function coast(v){
  stop();
  if(reduce||Math.abs(v)<.00065){settle();return}
  vx=clamp(v,-.024,.024);
  raf=requestAnimationFrame(tick);
 }
 function nudge(direction){
  if(drag)return;
  stop();
  const from=position,to=Math.round(position)+direction;
  if(reduce){position=to;sync();return}
  snap={from,to,started:time(),duration:300};
  raf=requestAnimationFrame(tick);
 }
 function onDown(event){
  if(event.pointerType==='mouse'&&event.button!==0)return;
  if(wheelEndTimer){clearTimeout(wheelEndTimer);wheelEndTimer=null}
  stop();
  const now=time();
  drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,
   previousX:event.clientX,lastAt:now,lastMoveAt:now,velocity:0,moved:false};
 }
 function onMove(event){
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  if(!drag.moved){
   if(Math.abs(dx)<5)return;
   if(Math.abs(dx)<Math.abs(dy)*1.15)return;
   drag.moved=true;
   try{viewport.setPointerCapture(event.pointerId)}catch(_){}
  }
  event.preventDefault();
  const now=time(),dt=clamp(now-drag.lastAt,1,65);
  const deltaX=event.clientX-drag.previousX;
  position-=deltaX/pitch;
  const instant=clamp(-deltaX/pitch/dt,-.035,.035);
  drag.velocity=drag.velocity*.35+instant*.65;
  drag.previousX=event.clientX;drag.lastAt=now;drag.lastMoveAt=now;
  sync();
 }
 function finish(event){
  if(!drag||drag.id!==event.pointerId)return;
  const last=drag;drag=null;
  if(!last.moved){
   // Tapping the spinning belt stops it without leaving a half-centered icon.
   if(Math.abs(position-Math.round(position))>.001)settle();
   return;
  }
  suppressClickUntil=time()+460;
  event.preventDefault();event.stopPropagation();
  try{if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId)}catch(_){}
  // Include the final finger travel between the last move event and release.
  const now=time(),tail=event.clientX-last.previousX;
  const age=now-last.lastMoveAt;
  if(Math.abs(tail)>.5){
   position-=tail/pitch;
   if(age<90){
    const dt=clamp(now-last.lastAt,1,65);
    last.velocity=last.velocity*.35+clamp(-tail/pitch/dt,-.035,.035)*.65;
   }
   sync();
  }
  coast(last.velocity*(age>85?.12:1));
 }
 function onCancel(event){
  if(!drag||drag.id!==event.pointerId)return;
  const moved=drag.moved;drag=null;
  if(moved){suppressClickUntil=time()+400;settle()}
 }
 function onClick(event){
  if(time()<=suppressClickUntil){
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  if(container.classList.contains('cryptex-prototype')&&
     event.target.closest('.combat-carousel-spell-tile')){
   const rect=viewport.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,
    y=(event.clientY-rect.top)/rect.height;
   const inWindow=(x>=.18&&x<=.30)||(x>=.394&&x<=.606)||(x>=.70&&x<=.82);
   if(!inWindow||y<.25||y>.75){
    event.preventDefault();event.stopImmediatePropagation();
   }
  }
 }
 function onWheel(event){
  const x=event.deltaX||(event.shiftKey?event.deltaY:0);
  if(!x)return;
  event.preventDefault();
  stop();
  position+=x/pitch;sync();
  if(wheelEndTimer)clearTimeout(wheelEndTimer);
  wheelEndTimer=setTimeout(()=>{wheelEndTimer=null;settle()},110);
 }
 function onKey(event){
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
   event.preventDefault();
   nudge(event.key==='ArrowRight'?1:-1);
  }else if(event.key==='Enter'||event.key===' '){
   event.preventDefault();
   track.children[clamp(Math.round(position),0,track.children.length-1)]?.click();
  }
 }
 const resize=()=>measure();
 viewport.addEventListener('pointerdown',onDown);
 viewport.addEventListener('pointermove',onMove);
 viewport.addEventListener('pointerup',finish);
 viewport.addEventListener('pointercancel',onCancel);
 viewport.addEventListener('click',onClick,true);
 viewport.addEventListener('wheel',onWheel,{passive:false});
 track.addEventListener('keydown',onKey);
 window.addEventListener('resize',resize,{passive:true});
 measure();
 combatMagicCarouselMotion={actorId,root:container,nudge,destroy(){
  stop();
  if(wheelEndTimer)clearTimeout(wheelEndTimer);
  window.removeEventListener('resize',resize);
  viewport.removeEventListener('pointerdown',onDown);
  viewport.removeEventListener('pointermove',onMove);
  viewport.removeEventListener('pointerup',finish);
  viewport.removeEventListener('pointercancel',onCancel);
  viewport.removeEventListener('click',onClick,true);
  viewport.removeEventListener('wheel',onWheel);
  track.removeEventListener('keydown',onKey);
 }};
}
async function combatCancelPreparedSpell(actorId){
 const actor=combatants.find(row=>String(row.id)===String(actorId)),action=combatChosenAction(actor);
 if(!actor||!combatCanChoosePrimaryAction(actor)||action?.status!=='planned'||
    action.source_data?.action_key!=='spell_cast'||action.source_data?.casting_spell!==true||combatMagicCancelBusy)return;
 combatMagicCancelBusy=true;
 try{
  // Cancel old prepared action, then reuse the current SR's ONE primary
  // action slot. Nothing is cast and no new extra action is awarded.
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id)+'&status=eq.planned',{
   method:'PATCH',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({status:'cancelled',updated_at:new Date().toISOString()})
  });
  combatSelectedTargetId=null;combatMobileMagicTargetPickerOpen=false;
  combatCloseRowActionMenu();
  await loadActiveCombat(null,{preserveSelectedTarget:false});
  const current=combatants.find(row=>String(row.id)===String(actorId));
  if(combatCanChoosePrimaryAction(current))await chooseCombatPrimaryAction(actorId,'spell_cast');
  combatActionMenuId=String(actorId);combatActionMenuKind='magic';
  renderCombat();
 }catch(error){
  console.error('Kunde inte avbryta besvärjelsen',error);
  alert('Kunde inte avbryta besvärjelsen: '+(error?.message||error));
  await loadActiveCombat(null,{preserveSelectedTarget:false});
 }finally{combatMagicCancelBusy=false}
}
