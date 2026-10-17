/* GOOSE 08 - non-destructive, independently animated arcane machinery.
 * Decorative SVG layers are attached to the existing HERMES door halves and
 * seal. No new bitmap copies, external media reads, or authorization paths.
 */
export function gooseDecorativeGearPath(teeth,outerRadius,rootRadius){
 if(!Number.isInteger(teeth)||teeth<8||teeth>24||outerRadius<=rootRadius||rootRadius<=0)
  throw Error('INVALID_GOOSE_GEAR');
 const points=[];
 for(let i=0;i<teeth*4;i++){
  const angle=-Math.PI/2+2*Math.PI*i/(teeth*4);
  const radius=i%4===1||i%4===2?outerRadius:rootRadius;
  points.push((i?'L':'M')+(Math.cos(angle)*radius).toFixed(2)+','+
   (Math.sin(angle)*radius).toFixed(2));
 }
 return points.join(' ')+' Z';
}
// The center seal's sword and laurels are NEVER replaced. Two small, nested
// brass cogwheels are added near the lower center, with proper 16:12 gearing.
export function gooseSealGearMarkup(part='center'){
 if(!['center','left','right'].includes(part))throw Error('INVALID_GOOSE_GEAR_PART');
 const big=gooseDecorativeGearPath(16,18,14.2);
 const small=gooseDecorativeGearPath(12,13.5,10.3);
 return '<span class="goose-player-gear-train goose-player-gear-train--'+part+'" aria-hidden="true">'+
  '<svg viewBox="0 0 112 68" preserveAspectRatio="xMidYMid meet">'+
  '<defs><radialGradient id="goose08-brass-'+part+'" cx=".3" cy=".24" r=".9">'+
  '<stop stop-color="#fff0ba"/><stop offset=".37" stop-color="#c59b56"/>'+
  '<stop offset=".75" stop-color="#78522d"/><stop offset="1" stop-color="#312013"/>'+
  '</radialGradient></defs>'+
  '<ellipse cx="56" cy="34" rx="46" ry="25" fill="#1c160f" fill-opacity=".78" stroke="#a27e43" stroke-width="2"/>'+
  '<g transform="translate(42 34)"><g class="goose-player-gear goose-player-gear--drive">'+
  '<path d="'+big+'" fill="url(#goose08-brass-'+part+')" stroke="#2d1e12" stroke-width="1.5"/>'+
  '<circle r="11.5" fill="none" stroke="#e7c581" stroke-width="1.6"/>'+
  '<circle r="4.1" fill="#22180f" stroke="#efc577" stroke-width="2.2"/>'+
  '</g></g>'+
  '<g transform="translate(73.5 34)"><g class="goose-player-gear goose-player-gear--idler">'+
  '<path d="'+small+'" fill="url(#goose08-brass-'+part+')" stroke="#2d1e12" stroke-width="1.5"/>'+
  '<circle r="8.3" fill="none" stroke="#e7c581" stroke-width="1.2"/>'+
  '<circle r="3.1" fill="#22180f" stroke="#efc577" stroke-width="1.8"/>'+
  '</g></g></svg></span>';
}
/* GOOSE09 – original-plate luminescence: no hand-drawn channel paths.
 * The canvas contains *only* selected cyan pixels from the original,
 * so when the light expands it precisely follows existing blue engravings.
 */
export function gooseDoorMechanicsMarkup(side){
 if(side!=='left'&&side!=='right')throw Error('INVALID_GOOSE_SIDE');
 return '<canvas class="goose-player-blue-ink goose-player-blue-ink--'+side+
  '" aria-hidden="true"></canvas>'+
  '<span class="goose-player-piston-source goose-player-piston-source--north" aria-hidden="true"><img alt=""></span>'+
  '<span class="goose-player-piston-source goose-player-piston-source--south" aria-hidden="true"><img alt=""></span>';
}
export function gooseOriginalBlueInk(source,canvas){
 if(!source||!canvas?.getContext||!source.naturalWidth||!source.naturalHeight)return false;
 const width=source.naturalWidth,height=source.naturalHeight;
 const scratch=source.ownerDocument?.createElement?.('canvas');
 if(!scratch?.getContext)return false;
 scratch.width=width;scratch.height=height;
 try{
  const ctx=scratch.getContext('2d',{willReadFrequently:true});
  if(!ctx)return false;
  ctx.drawImage(source,0,0,width,height);
  const image=ctx.getImageData(0,0,width,height);
  const bytes=image.data;
  for(let k=0;k<bytes.length;k+=4){
   const r=bytes[k],g=bytes[k+1],b=bytes[k+2],a=bytes[k+3];
   // Bronze/gold is warm and stays fully transparent. Real cyan inlays
   // remain, matching all twists in the physically painted metal paths.
   const blue=Math.max(0,Math.min(255,(b-r-6)*3,(b-g-3)*5));
   bytes[k]=72;bytes[k+1]=192;bytes[k+2]=255;
   bytes[k+3]=a>40&&b>52?Math.round(blue*a/255):0;
  }
  canvas.width=width;canvas.height=height;
  canvas.getContext('2d')?.putImageData(image,0,0);
  return true;
 }catch{return false;} // Browser may forbid reading an external image; never crash.
}
