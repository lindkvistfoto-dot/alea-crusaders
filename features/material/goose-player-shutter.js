/* GOOSE 04 – player-only ceremonial shutter (not enabled by default).
 * A rendering controller only: no auth/session, campaigns, Storage or publication writes.
 * The caller must verify player permissions and load the approved HERMES sprites.
 */
const unchanged = Object.freeze({ transform: 'translateX(0%)' });
const settings = Object.freeze({ unlock: 190, retreat: 330, open: 610, close: 600, seal: 360 });
export function gooseFourByThreeRatio(){ return '4 / 3'; }
export function gooseAssetManifestValid(assets) {
 return Boolean(assets && ['left','right','seal'].every(k => typeof assets[k] === 'string' &&
   (assets[k].startsWith('./features/material/') || assets[k].startsWith('/features/material/'))));
}
export function createGoosePlayerShutter({
 host, assets, doc=()=>document, win=()=>window, isPlayer=()=>false
}) {
 if (!host || !gooseAssetManifestValid(assets)) throw Error('GOOSE_ASSETS_NOT_READY');
 const scene = doc().createElement('div');
 scene.className='goose-player-shutter';
 scene.setAttribute('aria-hidden','true');
 scene.innerHTML='<div class="goose-player-door goose-player-door--left"><img alt=""></div>'+
   '<div class="goose-player-door goose-player-door--right"><img alt=""></div>'+
   '<div class="goose-player-seal"><img alt=""></div>'+
   '<div class="goose-player-energy"></div>';
 const left=scene.querySelector('.goose-player-door--left');
 const right=scene.querySelector('.goose-player-door--right');
 const seal=scene.querySelector('.goose-player-seal');
 const energy=scene.querySelector('.goose-player-energy');
 left.querySelector('img').src=assets.left;
 right.querySelector('img').src=assets.right;
 seal.querySelector('img').src=assets.seal;
 let phase='closed',epoch=0,active=new Set(),disposed=false;
 const reduced=()=>win().matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 const delay=ms=>new Promise(resolve=>win().setTimeout(resolve,ms));
 function cancel(){
  epoch++;
  for(const animation of active)animation.cancel();
  active.clear();
 }
 function paintClosed(){
  left.style.transform='translateX(0%)';
  right.style.transform='translateX(0%)';
  seal.style.transform='scale(1) rotate(0deg)';
  seal.style.opacity='1';
  energy.style.opacity='0';
  scene.classList.remove('goose-player-shutter--open');
 }
 function paintOpen(){
  left.style.transform='translateX(-110%)';
  right.style.transform='translateX(110%)';
  seal.style.transform='scale(.24) rotate(18deg)';
  seal.style.opacity='0';
  energy.style.opacity='0';
  scene.classList.add('goose-player-shutter--open');
 }
 async function shift(el,from,to,duration,localEpoch){
  if (localEpoch!==epoch || disposed)return false;
  if (reduced() || !el.animate || duration===0) { Object.assign(el.style,to); return true; }
  const animation=el.animate([from,to],{duration,fill:'forwards',easing:'cubic-bezier(.32,.05,.16,1)'});
  active.add(animation);
  try{await animation.finished;}catch{return false;}
  finally{active.delete(animation);}
  if (localEpoch!==epoch || disposed){ animation.cancel();return false; }
  Object.assign(el.style,to);
  animation.cancel();
  return true;
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
  if(disposed||!isPlayer()||phase==='opening'||phase==='open')return false;
  cancel();const token=epoch;
  phase='opening';
  // Full gate opening happens at fixed 4:3. Morph the frame AFTER this resolves.
  if(!await shift(energy,{opacity:'0'},{opacity:'.95'},settings.unlock,token))return false;
  if(!await shift(seal,{transform:'scale(1) rotate(0deg)',opacity:'1'},
   {transform:'scale(.24) rotate(18deg)',opacity:'0'},settings.retreat,token))return false;
  const worked=await Promise.all([
   shift(left,unchanged,{transform:'translateX(-110%)'},settings.open,token),
   shift(right,unchanged,{transform:'translateX(110%)'},settings.open,token),
   shift(energy,{opacity:'.95'},{opacity:'0'},settings.open,token)
  ]);
  if(token!==epoch||!worked.every(Boolean))return false;
  phase='open';scene.classList.add('goose-player-shutter--open');
  return true;
 }
 async function close({prepareFourByThree=()=>{}}={}){
  if(disposed||!isPlayer()||phase!=='open')return false;
  cancel();const token=epoch;
  phase='closing';
  // The parent reverts the framed picture to 4:3 before the shutters move.
  await prepareFourByThree();
  if(token!==epoch||disposed)return false;
  const worked=await Promise.all([
   shift(left,{transform:'translateX(-110%)'},unchanged,settings.close,token),
   shift(right,{transform:'translateX(110%)'},unchanged,settings.close,token)
  ]);
  if(!worked.every(Boolean)||token!==epoch)return false;
  if(!await shift(seal,{transform:'scale(.24) rotate(18deg)',opacity:'0'},
   {transform:'scale(1) rotate(0deg)',opacity:'1'},settings.seal,token))return false;
  phase='closed';scene.classList.remove('goose-player-shutter--open');return true;
 }
 function destroy(){
  cancel();disposed=true;scene.remove();
 }
 return {scene,mount,open,close,reset,destroy,get phase(){return phase;}};
}
