import {sheet} from '../crypt/materials.js';

// Shared presentation geometry. Only the host opens the two complete paint plates.
export const aperture={x:315,y:559,w:91,h:107};
const doorPath = new Path2D('M315 666 L315 604 Q316 572 347 561 Q360 555 375 561 Q405 572 406 604 L406 666 Z');
const stoneFront = new Path2D('M270 583 L296 550 Q361 492 421 549 L450 586 L450 687 L407 687 L407 606 Q407 575 377 564 Q360 556 345 564 Q316 575 314 605 L314 688 L270 688 Z');
const image = async url => {const img=new Image();img.src=url;await img.decode();return img;};

function appendFloor(path,tile) {
  if(!tile.parts){path.rect(tile.x,tile.y,tile.width,tile.height);return;}
  for(const points of tile.parts){
    path.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2)path.lineTo(points[i],points[i+1]);
    path.closePath();
  }
}

function floorPaths(p) {
  const seen=new Path2D(),memory=new Path2D();
  for(const tile of p.floor) {
    if(p.role==='gm'||tile.visibility==='visible')appendFloor(seen,tile);
    else if(tile.visibility==='memory')appendFloor(memory,tile);
  }
  return {seen,memory};
}

// Static raised surfaces borrow their visibility from the nearest accessible facing.
// They contain no actors, status indicators, search results or alternate secret passages.
// Trace the silhouette of each continuous painted surface. The samples lie on
// its accessible side; a remembered surface can never show a live change.
const faces=[
  {at:[[137,271],[174,232]],shape:'M51 239 L48 194 80 177 84 144 123 107 159 85 189 77 202 99 193 181 158 205 147 246 103 277 81 304 47 307 Z'},
  {at:[[214,228],[256,216]],shape:'M142 199 L137 164 142 109 174 92 185 57 209 45 267 64 293 65 297 189 273 208 226 224 180 223 Z'},
  {at:[[256,216],[466,215],[363,189]],shape:'M267 198 L268 91 293 61 313 56 329 29 354 15 373 15 393 33 400 50 432 62 457 64 460 196 429 212 292 212 Z'},
  {at:[[466,215],[500,231]],shape:'M431 204 L435 67 485 62 500 45 522 46 535 75 564 89 582 111 584 176 561 220 529 224 494 231 465 216 Z'},
  {at:[[544,244],[564,269]],shape:'M542 208 L545 106 579 92 602 112 628 128 642 172 663 181 672 219 651 248 617 282 576 278 Z'},
  {at:[[338,291],[419,292]],shape:'M276 282 L278 249 285 242 287 197 434 195 439 241 446 247 446 283 434 287 283 287 Z'},
  {receivesTorch:true,at:[[264,445],[274,465]],shape:'M103 509 L108 404 130 399 131 382 149 374 162 379 173 396 218 387 235 390 261 421 255 448 249 455 250 480 266 485 265 514 110 516 Z'},
  {at:[[164,287],[132,307]],shape:'M78 298 L75 243 102 214 138 192 163 211 163 277 148 291 103 308 Z'},
  {receivesTorch:true,at:[[535,476],[552,459]],shape:'M545 482 L549 452 566 431 581 427 608 439 625 452 621 467 613 495 602 509 577 501 Z'},
  {receivesTorch:true,at:[[121,330],[116,345]],shape:'M74 320 Q73 290 92 286 Q111 284 120 299 L119 319 113 336 Q92 351 78 335 Z'},
  {receivesTorch:true,at:[[566,360],[574,380]],shape:'M571 313 Q569 282 587 278 Q607 269 616 288 L618 313 615 319 Q631 333 623 358 Q622 374 608 380 Q583 383 579 364 L574 341 Z'}
];
function visibleMasks(p) {
  const floor=floorPaths(p);
  const visible=new Path2D(floor.seen), known=new Path2D(floor.memory);
  const light=new Path2D(floor.seen);
  const probe=sheet(1,1).getContext('2d');
  for(const face of faces) {
    const target=p.role==='gm'||face.at.some(point=>probe.isPointInPath(floor.seen,...point)) ? visible
      : face.at.some(point=>probe.isPointInPath(floor.memory,...point)) ? known : null;
    if(target){
      const shape=new Path2D(face.shape);
      target.addPath(shape);
      if(face.receivesTorch && target===visible)light.addPath(shape);
    }
  }
  if(p.door) {
    const target=p.door.visible===false?known:visible;
    target.addPath(stoneFront);
    target.addPath(doorPath);
  }
  return {visible,known,light,...floor};
}

function writeMasked(ctx,img,mask,w,h,opacity=1) {
  ctx.save();ctx.clip(mask);ctx.globalAlpha=opacity;ctx.drawImage(img,0,0,w,h);ctx.restore();
}
export function gridOverlay(p,seen) {
  const s=sheet(p.width,p.height),ctx=s.getContext('2d');
  ctx.clip(seen);
  const geo=globalThis.aleaMapGrid.geometry(p,{academy_map:true,pixels_per_meter:p.pixelsPerMeter,hex_m:1.5});
  ctx.strokeStyle='rgba(236,205,151,.54)';ctx.lineWidth=.8;
  ctx.beginPath();
  for(const {x,y} of globalThis.aleaMapGrid.cells(geo)) {
    for(let k=0;k<=3;k++){
      const a=(-90+60*k)*Math.PI/180;
      const px=x+geo.size*Math.cos(a),py=y+geo.size*Math.sin(a);
      if(k)ctx.lineTo(px,py);else ctx.moveTo(px,py);
    }
  }
  ctx.stroke();return s;
}

export async function hostPainting() {
  const [lit,neutral]=await Promise.all([
    image(new URL('../../preview/art-first/chamber.jpg',import.meta.url)),
    image(new URL('../../preview/art-first/unlit.webp',import.meta.url))
  ]);
  let cachedKey='',cachedPlate,previousGrant='';
  let grant=null;
  function plate(p) {
    const key=JSON.stringify(p.lamps);
    if(key===cachedKey && cachedPlate)return cachedPlate;
    const w=p.width,h=p.height,scale=2;
    const art=sheet(w*scale,h*scale),ctx=art.getContext('2d');
    ctx.scale(scale,scale);ctx.drawImage(neutral,0,0,w,h);
    const lamps=p.lamps, active=lamps.filter(l=>l.on);
    if(active.length===8)ctx.drawImage(lit,0,0,w,h);
    else if(active.length) {
      const mask=sheet(181,192),m=mask.getContext('2d'),rgba=m.createImageData(mask.width,mask.height);
      for(let y=0;y<mask.height;y++) for(let x=0;x<mask.width;x++){
        let all=0,on=0;
        for(const lamp of lamps){
          const dx=x*w/mask.width-lamp.x,dy=y*h/mask.height-lamp.y;
          const weight=Math.exp(-(dx*dx+dy*dy)/5300);
          all+=weight;if(lamp.on)on+=weight;
        }
        rgba.data[(y*mask.width+x)*4+3]=Math.round(255*on/Math.max(.08,all));
      }
      m.putImageData(rgba,0,0);
      const warm=sheet(art.width,art.height),wc=warm.getContext('2d');
      wc.drawImage(lit,0,0,warm.width,warm.height);wc.globalCompositeOperation='destination-in';
      wc.drawImage(mask,0,0,warm.width,warm.height);ctx.drawImage(warm,0,0,w,h);
    }
    // The plate always has a clean opening. The actual original timber is added separately.
    ctx.save();ctx.clip(doorPath);ctx.drawImage(neutral,0,0,w,h);ctx.restore();
    const leaves=sheet(aperture.w*2,aperture.h*2),lc=leaves.getContext('2d');
    lc.scale(2,2);lc.translate(-aperture.x,-aperture.y);lc.clip(doorPath);
    const portalLight=lamps.filter(l=>l.id===6||l.id===7);
    const strength=portalLight.filter(l=>l.on).length/2;
    lc.filter='brightness('+(.38+.62*strength)+') saturate('+(.35+.65*strength)+')';
    lc.drawImage(lit,0,0,w,h);
    cachedKey=key;cachedPlate={art,leaves};return cachedPlate;
  }
  function build(p) {
    const {art,leaves}=plate(p);
    const {visible,known,seen,light}=visibleMasks(p);
    if(p.role==='gm')return {terrain:art,leaves,seen,light};
    const s=sheet(p.width*1.35,p.height*1.35),ctx=s.getContext('2d');
    ctx.scale(s.width/p.width,s.height/p.height);ctx.fillStyle='#0a0f12';ctx.fillRect(0,0,p.width,p.height);
    writeMasked(ctx,neutral,known,p.width,p.height,.31);
    writeMasked(ctx,art,visible,p.width,p.height);
    return {terrain:s,leaves:p.door?leaves:null,seen,light};
  }
  function decorate(p) {
    const key=JSON.stringify([p.floor,p.lamps,p.door]);
    if(key!==previousGrant){
      const local=build(p);
      // Lossy codecs can retain adjacent hidden colors. Encode only the opaque, pre-masked surface.
      const thumb=sheet(p.width,p.height),tc=thumb.getContext('2d');
      tc.drawImage(local.terrain,0,0,thumb.width,thumb.height);
      grant={terrain:thumb.toDataURL('image/webp',.68),
        leaves:local.leaves?.toDataURL('image/webp',.78)??null};
      previousGrant=key;
    }
    return {...p,paint:grant};
  }
  return {build,decorate};
}
export async function decodeGrant(p,previous) {
  if(!p?.paint)return null;
  const {seen,light}=visibleMasks(p);
  if(previous?.key===p.paint.terrain && previous?.leafKey===p.paint.leaves)return {...previous,seen,light};
  const [terrain,leaves]=await Promise.all([image(p.paint.terrain),p.paint.leaves?image(p.paint.leaves):null]);
  return {terrain,leaves,seen,light,key:p.paint.terrain,leafKey:p.paint.leaves};
}

export function leafSlices(source) {
  if(!source)return [];
  return [0,1].map(side=>{
    const half=source.width/2, s=sheet(half,source.height);
    s.getContext('2d').drawImage(source,side*half,0,half,source.height,0,0,s.width,s.height);
    return s;
  });
}
export function foreground(p,terrain) {
  const left=270,top=519,w=181,h=170,s=sheet(w*2,h*2),ctx=s.getContext('2d');
  ctx.scale(2,2);ctx.translate(-left,-top);ctx.clip(stoneFront);
  ctx.drawImage(terrain,0,0,p.width,p.height);
  return {src:s,x:left,y:top,w,h};
}
