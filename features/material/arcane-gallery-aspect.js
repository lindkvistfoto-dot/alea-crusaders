/* Arcane Gallery · smooth telescopic frame for private pictures.
 * Pure ratio sizing also accepts HTMLVideoElement dimensions for future video.
 * The metal is segmented in CSS: neither images nor brass ornaments stretch.
 */
export function arcaneMediaDimensions(element){
 const w=Number(element?.videoWidth||element?.naturalWidth||0);
 const h=Number(element?.videoHeight||element?.naturalHeight||0);
 return Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0?{width:w,height:h}:null;
}
export function arcaneFrameHeight(frameWidth,mediaWidth,mediaHeight,viewportHeight=0){
 const width=Number(frameWidth),w=Number(mediaWidth),h=Number(mediaHeight);
 if(![width,w,h].every(x=>Number.isFinite(x)&&x>0))return null;
 // The approved brass mask leaves 74.8% of its width for the main picture.
 // The 9-slice geometry positions the visible picture at:
 //   picture height = 80.495% of frame height - 17.86% of frame width.
 const ratio=Math.max(.35,Math.min(4,w/h));
 const desiredPictureHeight=width*.748/ratio;
 const raw=(desiredPictureHeight+width*.1786)/.80495;
 const min=width*.72;
 const visibleHeight=Math.max(0,Number(viewportHeight)||0);
 const max=Math.max(width*1.9,visibleHeight*1.22);
 return Math.round(Math.max(min,Math.min(raw,max)));
}
/** Rotation is derived from extension, never a timer: gears and frame stop together. */
export function arcaneGearRotation(frameHeight,frameWidth){
 const h=Number(frameHeight),w=Number(frameWidth);
 if(!Number.isFinite(h)||!Number.isFinite(w)||h<=0||w<=0)return 0;
 const p=Math.max(0,Math.min(1,(h/w-.72)/(1.95-.72)));
 return Math.round(p*540);
}
export function sizeArcaneFrame(root,media,viewportHeight=0){
 const dimensions=arcaneMediaDimensions(media);
 const machine=root?.querySelector?.('.arcane-gallery-machine');
 const width=Number(machine?.getBoundingClientRect?.().width||machine?.clientWidth||0);
 const target=dimensions&&arcaneFrameHeight(width,dimensions.width,dimensions.height,viewportHeight);
 if(!target||!machine?.style?.setProperty)return null;
 machine.style.setProperty('--arcane-frame-height',target+'px');
 machine.style.setProperty('--arcane-gear-angle',arcaneGearRotation(target,width)+'deg');
 root.classList.add('arcane-gallery-fluid');
 return target;
}
