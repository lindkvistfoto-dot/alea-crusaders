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
export function gooseSealGearMarkup(){
 const big=gooseDecorativeGearPath(16,18,14.2);
 const small=gooseDecorativeGearPath(12,13.5,10.3);
 return '<span class="goose-player-gear-train" aria-hidden="true">'+
  '<svg viewBox="0 0 112 68" preserveAspectRatio="xMidYMid meet">'+
  '<defs><radialGradient id="goose08-brass" cx=".3" cy=".24" r=".9">'+
  '<stop stop-color="#fff0ba"/><stop offset=".37" stop-color="#c59b56"/>'+
  '<stop offset=".75" stop-color="#78522d"/><stop offset="1" stop-color="#312013"/>'+
  '</radialGradient></defs>'+
  '<ellipse cx="56" cy="34" rx="46" ry="25" fill="#1c160f" fill-opacity=".78" stroke="#a27e43" stroke-width="2"/>'+
  '<g transform="translate(42 34)"><g class="goose-player-gear goose-player-gear--drive">'+
  '<path d="'+big+'" fill="url(#goose08-brass)" stroke="#2d1e12" stroke-width="1.5"/>'+
  '<circle r="11.5" fill="none" stroke="#e7c581" stroke-width="1.6"/>'+
  '<circle r="4.1" fill="#22180f" stroke="#efc577" stroke-width="2.2"/>'+
  '</g></g>'+
  '<g transform="translate(73.5 34)"><g class="goose-player-gear goose-player-gear--idler">'+
  '<path d="'+small+'" fill="url(#goose08-brass)" stroke="#2d1e12" stroke-width="1.5"/>'+
  '<circle r="8.3" fill="none" stroke="#e7c581" stroke-width="1.2"/>'+
  '<circle r="3.1" fill="#22180f" stroke="#efc577" stroke-width="1.8"/>'+
  '</g></g></svg></span>';
}
export function gooseDoorMechanicsMarkup(side){
 if(side!=='left'&&side!=='right')throw Error('INVALID_GOOSE_SIDE');
 const isLeft=side==='left';
 const x=isLeft?35.6:65.8;
 const middle=isLeft?56:45;
 const shoulder=isLeft?79:22;
 const tip=isLeft?89:11;
 const upper='M'+x+' 49.5 C'+middle+' 49.5 '+shoulder+' 37 '+tip+' 14';
 const lower='M'+x+' 49.5 C'+middle+' 49.5 '+shoulder+' 63 '+tip+' 86';
 const paths=[upper,lower];
 const lines=paths.map((d,i)=>'<path d="'+d+'" class="goose-player-energy-engraving" />'+
   '<path d="'+d+'" pathLength="100" class="goose-player-energy-flow goose-player-energy-flow--'+(i?'lower':'upper')+'" />').join('');
 return '<svg class="goose-player-energy goose-player-energy--'+side+
  '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'+
  lines+'</svg>'+
  '<span class="goose-player-piston goose-player-piston--north" aria-hidden="true">'+
  '<span class="goose-player-piston-housing"></span><span class="goose-player-piston-bolt"></span></span>'+
  '<span class="goose-player-piston goose-player-piston--south" aria-hidden="true">'+
  '<span class="goose-player-piston-housing"></span><span class="goose-player-piston-bolt"></span></span>';
}
