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
/** HERMES kit geometry: image opening 78% wide, fixed rigid top and bottom. */
export function arcaneKitFrameHeight(frameWidth,mediaWidth,mediaHeight,viewportHeight=0){
 const width=Number(frameWidth),w=Number(mediaWidth),h=Number(mediaHeight);
 if(![width,w,h].every(x=>Number.isFinite(x)&&x>0))return null;
 const ratio=Math.max(.35,Math.min(4,w/h));
 const contentHeight=width*.78/ratio;
 // Match 9cqw upper + 8cqw lower rail inset; both overlap the closed GOOSE gate.
 const desired=contentHeight+width*.17; // carousel detached
 const limit=Math.max(width*2.2,Math.max(0,Number(viewportHeight)||0)*1.22);
 return Math.round(Math.max(width*.65,Math.min(desired,limit)));
}
/** Forget the last campaign's geometry before reusing a private viewer. */
export function resetArcaneFrame(root){
 const machine=root?.querySelector?.('.arcane-gallery-machine');
 machine?.style?.removeProperty?.('--arcane-frame-height');
 machine?.style?.removeProperty?.('--arcane-gear-angle');
 machine?.style?.removeProperty?.('--arcane-extension');
 root?.classList?.remove?.('arcane-gallery-fluid');
}
/** Position of the rigid-art actuator between retracted and extended states. */
export function arcaneExtensionProgress(frameHeight,frameWidth){
 const h=Number(frameHeight),w=Number(frameWidth);
 if(!Number.isFinite(h)||!Number.isFinite(w)||h<=0||w<=0)return 0;
 return Math.max(0,Math.min(1,(h/w-.72)/(1.95-.72)));
}
/** Rotation is derived from extension, never a timer: gears and frame stop together. */
export function arcaneGearRotation(frameHeight,frameWidth){
 return Math.round(arcaneExtensionProgress(frameHeight,frameWidth)*540);
}
export function sizeArcaneFrame(root,media,viewportHeight=0){
 const dimensions=arcaneMediaDimensions(media);
 const machine=root?.querySelector?.('.arcane-gallery-machine');
 const width=Number(machine?.getBoundingClientRect?.().width||machine?.clientWidth||0);
 const fit=root?.classList?.contains?.('arcane-gallery-kit')?arcaneKitFrameHeight:arcaneFrameHeight;
 let target=dimensions&&fit(width,dimensions.width,dimensions.height,viewportHeight);
 // Desktop shared-gallery viewport: portrait pictures are contained inside
 // a height-limited aperture, without distorting the bronze source artwork.
 // Reserve the carousel (about 14.2% of width), navigation and safe margins.
 if(target&&root?.id==='arcaneGallery'&&root?.classList?.contains('arcane-gallery-kit')
    &&typeof window!=='undefined'&&window.innerWidth>=901&&viewportHeight>0){
  const remaining=viewportHeight-125-width*.142-52;
  target=Math.min(target,Math.max(width*.65,remaining));
 }
 if(!target||!machine?.style?.setProperty)return null;
 machine.style.setProperty('--arcane-frame-height',target+'px');
 machine.style.setProperty('--arcane-gear-angle',arcaneGearRotation(target,width)+'deg');
 machine.style.setProperty('--arcane-extension',arcaneExtensionProgress(target,width).toFixed(3));
 root.classList.add('arcane-gallery-fluid');
 return target;
}
