import {sheet} from '../crypt/materials.js';

// Shared presentation geometry. Only the host opens the two complete paint plates.
export const aperture={x:315,y:559,w:91,h:107};
const doorPath = new Path2D('M315 666 L315 604 Q316 572 347 561 Q360 555 375 561 Q405 572 406 604 L406 666 Z');
const stoneFront = new Path2D('M270 583 L296 550 Q361 492 421 549 L450 586 L450 687 L407 687 L407 606 Q407 575 377 564 Q360 556 345 564 Q316 575 314 605 L314 688 L270 688 Z');
const image = async url => {const img=new Image();img.src=url;await img.decode();return img;};

function floorPaths(p) {
  const seen=new Path2D(),memory=new Path2D();
  for(const tile of p.floor) {
    if(tile.visibility==='visible')seen.rect(tile.x,tile.y,tile.width,tile.height);
    if(tile.visibility==='memory')memory.rect(tile.x,tile.y,tile.width,tile.height);
  }
  return {seen,memory};
}

// Static raised surfaces borrow their visibility from the nearest accessible facing.
// They contain no actors, status indicators, search results or alternate secret passages.
const faces=[
  {at:[215,229],box:[160,65,125,161]}, {at:[496,231],box:[451,66,124,161]},
  {at:[366,192],box:[284,13,160,184]}, {at:[355,293],box:[275,194,174,93]},
  {at:[269,445],box:[120,374,145,135]}, {at:[160,295],box:[80,198,87,110]},
  {at:[536,475],box:[542,425,87,86]}, {at:[112,342],box:[79,287,40,53]},
  {at:[576,380],box:[574,274,51,99]}
];
function visibleMasks(p) {
  const floor=floorPaths(p);
  const visible=new Path2D(floor.seen), known=new Path2D(floor.memory);
  const probe=sheet(1,1).getContext('2d');
  for(const {at,box} of faces) {
    if(probe.isPointInPath(floor.seen,...at))visible.rect(...box);
    else if(probe.isPointInPath(floor.memory,...at))known.rect(...box);
  }
  if(p.door) {
    const target=p.door.visible===false?known:visible;
    target.addPath(stoneFront);
    target.addPath(doorPath);
  }
  return {visible,known,...floor};
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
    const {visible,known,seen}=visibleMasks(p);
    if(p.role==='gm')return {terrain:art,leaves,seen:walkPath(p)};
    const s=sheet(p.width*1.35,p.height*1.35),ctx=s.getContext('2d');
    ctx.scale(s.width/p.width,s.height/p.height);ctx.fillStyle='#0a0f12';ctx.fillRect(0,0,p.width,p.height);
    writeMasked(ctx,neutral,known,p.width,p.height,.31);
    writeMasked(ctx,art,visible,p.width,p.height);
    return {terrain:s,leaves:p.door?leaves:null,seen};
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
function walkPath(p) {
  const path=new Path2D();
  for(const cell of p.floor)path.rect(cell.x,cell.y,cell.width,cell.height);
  return path;
}
export async function decodeGrant(p,previous) {
  if(!p?.paint)return null;
  if(previous?.key===p.paint.terrain && previous?.leafKey===p.paint.leaves)return {...previous,seen:floorPaths(p).seen};
  const [terrain,leaves]=await Promise.all([image(p.paint.terrain),p.paint.leaves?image(p.paint.leaves):null]);
  return {terrain,leaves,seen:floorPaths(p).seen,key:p.paint.terrain,leafKey:p.paint.leaves};
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
