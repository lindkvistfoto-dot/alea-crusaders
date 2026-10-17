import {gooseDoorMechanicsMarkup,gooseSealGearMarkup} from './goose-arcane-mechanics.js?v=08';
/* GOOSE 08 – Sapphire Lock Sequence with arcane channels, gears and bolts.
 * One shared, authenticated Arcane Gallery gate for players and GMs.
 * Pure presentation: no private media access, campaign reads or publication writes.
 * The rotating emblem has four discrete 90-degree ratchets. The real sapphire
 * stones (not extra UI lamps) are the indicators. The seal splits with the doors.
 */
const timings=Object.freeze({quarter:525,detent:105,charge:680,release:420,doors:1780});
const LOCK_ORDER=Object.freeze(['north','east','south','west']);
export function gooseFourByThreeRatio(){return '4 / 3';}
export function gooseAssetManifestValid(assets){
 return Boolean(assets && ['left','right','seal'].every(k=>
  typeof assets[k]==='string' &&
  (assets[k].startsWith('./features/material/')||assets[k].startsWith('/features/material/')) &&
  !assets[k].includes('..') && /\.webp(?:\?[^#]*)?$/.test(assets[k])));
}
/* Fixed angular stops with a hesitant wind-up, a main gear stroke and
 * a short final detent. No elastic, looping or free-spinning rotation. */
export function gooseQuarterKeyframes(start,end){
 const delta=end-start;
 return [
  {transform:'rotate('+start+'deg)',offset:0},
  {transform:'rotate('+(start+delta*.07)+'deg)',offset:.17},
  {transform:'rotate('+(start+delta*.09)+'deg)',offset:.28},
  {transform:'rotate('+(start+delta*.85)+'deg)',offset:.81},
  {transform:'rotate('+(start+delta*.96)+'deg)',offset:.92},
  {transform:'rotate('+end+'deg)',offset:1}
 ];
}
export function createGoosePlayerShutter({
 host,assets,doc=()=>document,win=()=>window,isPlayer=()=>false
}){
 if(!host||!gooseAssetManifestValid(assets))throw Error('GOOSE_ASSETS_NOT_READY');
 const scene=doc().createElement('div');
 scene.className='goose-player-shutter';
 scene.setAttribute('aria-hidden','true');
 scene.innerHTML=
  '<div class="goose-player-door goose-player-door--left"><img alt="">'+
   gooseDoorMechanicsMarkup('left')+
   '<span class="goose-player-seal-half goose-player-seal-half--left">'+gooseSealGearMarkup('left')+'</span>'+ 
   '<span class="goose-player-sapphire goose-player-sapphire--north" aria-hidden="true"></span>'+
   '<span class="goose-player-sapphire goose-player-sapphire--west" aria-hidden="true"></span>'+
   '<span class="goose-player-sapphire goose-player-sapphire--south" aria-hidden="true"></span></div>'+
  '<div class="goose-player-door goose-player-door--right"><img alt="">'+
   gooseDoorMechanicsMarkup('right')+
   '<span class="goose-player-seal-half goose-player-seal-half--right">'+gooseSealGearMarkup('right')+'</span>'+ 
   '<span class="goose-player-sapphire goose-player-sapphire--north" aria-hidden="true"></span>'+
   '<span class="goose-player-sapphire goose-player-sapphire--east" aria-hidden="true"></span>'+
   '<span class="goose-player-sapphire goose-player-sapphire--south" aria-hidden="true"></span></div>'+
  '<div class="goose-player-seal"><img alt="">'+gooseSealGearMarkup()+'</div>';
 const left=scene.querySelector('.goose-player-door--left');
 const right=scene.querySelector('.goose-player-door--right');
 const seal=scene.querySelector('.goose-player-seal');
 const leftHalf=scene.querySelector('.goose-player-seal-half--left');
 const rightHalf=scene.querySelector('.goose-player-seal-half--right');
 // Top and bottom stones straddle the join: their glow is rendered twice,
 // cropped by each moving door so light never stays behind when it opens.
 const sapphires=LOCK_ORDER.map(name=>
  [...scene.querySelectorAll('.goose-player-sapphire--'+name)]);
 left.querySelector('img').src=assets.left;
 right.querySelector('img').src=assets.right;
 seal.querySelector('img').src=assets.seal;
 for(const half of [leftHalf,rightHalf]){
  if(half)half.style.backgroundImage='url("'+assets.seal+'")';
 }
 let phase='closed',epoch=0,active=new Set(),disposed=false;
 const reduced=()=>win().matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 function cancel(){
  epoch++;
  for(const animation of active)animation.cancel();
  active.clear();
 }
 function setLights(count,pulseIndex=-1){
  scene.dataset.unlockedLocks=String(count);
  sapphires.forEach((parts,index)=>parts.forEach(stone=>{
   stone.classList.toggle('is-lit',index<count);
   stone.classList.toggle('is-pulsing',index===pulseIndex);
  }));
 }
 function paintClosed(){
  left.style.transform='translateX(0%)';
  right.style.transform='translateX(0%)';
  seal.style.transform='rotate(0deg)';
  seal.style.opacity='1';
  setLights(0);
  scene.classList.remove('goose-player-shutter--charged');
  scene.classList.remove('goose-player-shutter--energizing');
  scene.classList.remove('goose-player-shutter--unlatched');
  scene.classList.remove('goose-player-shutter--open');
  scene.classList.remove('goose-player-shutter--split');
 }
 function paintOpen(){
  left.style.transform='translateX(-110%)';
  right.style.transform='translateX(110%)';
  seal.style.transform='rotate(360deg)';
  seal.style.opacity='0';
  setLights(4);
  scene.classList.remove('goose-player-shutter--charged');
  scene.classList.add('goose-player-shutter--energizing');
  scene.classList.add('goose-player-shutter--unlatched');
  scene.classList.add('goose-player-shutter--split');
  scene.classList.add('goose-player-shutter--open');
 }
 async function shift(el,from,to,duration,token,frames=null){
  if(token!==epoch||disposed)return false;
  if(reduced()||!el.animate||duration===0){
   Object.assign(el.style,to);return true;
  }
  const animation=el.animate(frames||[from,to],{
   duration,fill:'forwards',easing:frames?'linear':'cubic-bezier(.45,.03,.16,1)'
  });
  active.add(animation);
  try{await animation.finished;}catch{return false;}
  finally{active.delete(animation);}
  if(token!==epoch||disposed){animation.cancel();return false;}
  Object.assign(el.style,to);
  animation.cancel();
  return true;
 }
 async function ratchet(from,to,token){
  return shift(seal,{transform:'rotate('+from+'deg)'},
   {transform:'rotate('+to+'deg)'},timings.quarter,token,gooseQuarterKeyframes(from,to));
 }
 async function detent(angle,token){
  const still={transform:'rotate('+angle+'deg)'};
  return shift(seal,still,still,timings.detent,token);
 }
 function mount(){
  if(disposed)throw Error('GOOSE_DISPOSED');
  if(!isPlayer())return false;
  if(!host.contains(scene))host.append(scene);
  reset();
  return true;
 }
 function reset(){
  cancel();
  phase='closed';
  paintClosed();
 }
 async function open(){
  if(disposed||!isPlayer()||phase!=='closed')return false;
  cancel();const token=epoch;phase='opening';
  for(let index=0;index<4;index++){
   const angle=index*90;
   if(!await ratchet(angle,angle+90,token))return false;
   if(token!==epoch||disposed)return false;
   setLights(index+1,index); // Only the existing sapphire lights at its detent.
   if(index<3&&!await detent(angle+90,token))return false;
  }
  scene.classList.add('goose-player-shutter--charged');
  // Four sapphire detents arm the engraved blue conduits and clockwork.
  // The physical rods retreat only after the energy reaches their housings.
  scene.classList.add('goose-player-shutter--energizing');
  const stopped={transform:'rotate(360deg)'};
  if(!await shift(seal,stopped,stopped,timings.charge,token))return false;
  scene.classList.add('goose-player-shutter--unlatched');
  if(!await shift(seal,stopped,stopped,timings.release,token))return false;
  // Prevent the fourth gem's ignition pulse from restarting at the split.
  setLights(4);
  scene.classList.remove('goose-player-shutter--charged');
  // Exact 360 degrees: the full emblem and its cropped door-mounted halves
  // have precisely the same registration at the moment of the split.
  seal.style.opacity='0';
  scene.classList.add('goose-player-shutter--split');
  const worked=await Promise.all([
   shift(left,{transform:'translateX(0%)'},{transform:'translateX(-110%)'},timings.doors,token),
   shift(right,{transform:'translateX(0%)'},{transform:'translateX(110%)'},timings.doors,token)
  ]);
  if(token!==epoch||!worked.every(Boolean))return false;
  phase='open';
  paintOpen();
  return true;
 }
 async function close({prepareFourByThree=()=>{}}={}){
  if(disposed||!isPlayer()||phase!=='open')return false;
  cancel();const token=epoch;phase='closing';
  scene.classList.remove('goose-player-shutter--open');
  // The picture returns to the four-by-three home aperture before the
  // shutters begin their return; content is still authorization-gated.
  await prepareFourByThree();
  if(token!==epoch||disposed)return false;
  const worked=await Promise.all([
   shift(left,{transform:'translateX(-110%)'},{transform:'translateX(0%)'},timings.doors,token),
   shift(right,{transform:'translateX(110%)'},{transform:'translateX(0%)'},timings.doors,token)
  ]);
  if(token!==epoch||!worked.every(Boolean))return false;
  // Once both door halves meet, restore the whole seal. There is no fade,
  // shrinking, teleport or independently drifting metal piece.
  scene.classList.remove('goose-player-shutter--split');
  seal.style.opacity='1';
  seal.style.transform='rotate(360deg)';
  // After both leaves meet, rods engage before the sapphires extinguish.
  scene.classList.remove('goose-player-shutter--unlatched');
  const stopped={transform:'rotate(360deg)'};
  if(!await shift(seal,stopped,stopped,timings.release,token))return false;
  scene.classList.remove('goose-player-shutter--energizing');
  for(let index=3;index>=0;index--){
   if(!await ratchet((index+1)*90,index*90,token))return false;
   if(token!==epoch||disposed)return false;
   setLights(index);
   if(index>0&&!await detent(index*90,token))return false;
  }
  phase='closed';paintClosed();return true;
 }
 function destroy(){cancel();disposed=true;scene.remove();}
 return {scene,mount,open,close,reset,destroy,get phase(){return phase;}};
}
