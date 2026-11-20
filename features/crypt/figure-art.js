import {contains} from '../map/kartakademin-geometry.js';
import {HERO_PROFILES, heroPlacement} from './hero-class.js';
import {sheet,clipPolygon} from './materials.js';

function guardArt(){
  const s=sheet(128,160),c=s.getContext('2d');
  const metal=c.createLinearGradient(0,0,100,55);
  metal.addColorStop(0,'#212d34');metal.addColorStop(.45,'#9b9c89');metal.addColorStop(.58,'#4d5757');metal.addColorStop(1,'#252d32');
  const cape=c.createLinearGradient(0,40,100,150);
  cape.addColorStop(0,'#6f5140');cape.addColorStop(.55,'#4d4140');cape.addColorStop(.82,'#312e31');cape.addColorStop(1,'#191f24');
  c.lineCap='round';c.lineJoin='round';
  c.strokeStyle='#222225';c.lineWidth=17;
  for(const side of [-1,1]){c.beginPath();c.moveTo(60,103);c.lineTo(61+side*19,137);c.lineTo(65+side*22,148);c.stroke();}
  c.fillStyle=cape;c.strokeStyle='#22292a';c.lineWidth=2;c.beginPath();c.moveTo(44,45);
  c.bezierCurveTo(31,51,39,78,16,123);c.quadraticCurveTo(64,140,104,121);
  c.bezierCurveTo(86,90,101,61,79,44);c.closePath();c.fill();c.stroke();
  for(let i=0;i<6;i++){c.strokeStyle=i%2?'#a17d5b50':'#241f23b0';c.lineWidth=2;
    c.beginPath();c.moveTo(49+i*4,60);c.quadraticCurveTo(51+i*4,89,24+i*13,123);c.stroke();}
  c.fillStyle=metal;c.beginPath();c.ellipse(62,67,19,28,-.1,0,2*Math.PI);c.fill();c.strokeStyle='#383d39';c.stroke();
  for(let j=0;j<3;j++){c.strokeStyle='#aaa28680';c.beginPath();c.moveTo(48,69+j*4);c.lineTo(61,73+j*4);c.lineTo(77,69+j*4);c.stroke();}
  c.fillStyle=metal;c.beginPath();c.ellipse(62,42,16,21,.02,0,2*Math.PI);c.fill();c.strokeStyle='#282d30';c.stroke();
  c.fillStyle='#272c2c';c.fillRect(48,43,27,5);c.fillStyle='#b6ac8c';c.fillRect(60,32,3,21);
  c.strokeStyle='#3b3430';c.lineWidth=4;c.beginPath();c.moveTo(94,148);c.lineTo(112,12);c.stroke();
  c.fillStyle=metal;c.beginPath();c.moveTo(111,0);c.lineTo(117,24);c.lineTo(107,22);c.closePath();c.fill();
  c.fillStyle=metal;c.beginPath();c.ellipse(40,75,16,22,-.23,0,2*Math.PI);c.fill();c.strokeStyle='#a5a089';c.stroke();
  return s;
}

async function cropResolution(profile){
  const image=new Image();image.src=profile.assetUrl;await image.decode();
  // Preserve the approved alpha and margins. Four hundred source pixels suffice at the pilot's closest camera.
  const h=Math.min(image.naturalHeight,420),w=Math.round(h*image.naturalWidth/image.naturalHeight);
  const s=sheet(w,h),c=s.getContext('2d');
  c.imageSmoothingQuality='high';c.drawImage(image,0,0,w,h);
  return s;
}

export async function figureArt(){
  const pairs=await Promise.all(Object.entries(HERO_PROFILES).map(async ([id,p])=>[id,await cropResolution(p)]));
  return new Map([...pairs,['guard',guardArt()]]);
}

function tinted(img,torch,actor,power) {
  const s=sheet(img.width,img.height),c=s.getContext('2d');
  c.drawImage(img,0,0);c.globalCompositeOperation='source-atop';
  c.fillStyle='rgba(18,31,43,.17)';c.fillRect(0,0,s.width,s.height);
  if(power>0){
    const dx=torch.x-actor.x,dy=torch.y-actor.y,dist=Math.max(1,Math.hypot(dx,dy));
    const ux=dx/dist,uy=dy/dist;
    const g=c.createLinearGradient(s.width*(.5+ux*.56),s.height*(.5+uy*.56),s.width*(.5-ux*.56),s.height*(.5-uy*.56));
    g.addColorStop(0,'rgba(251,177,84,'+(.40*power)+')');g.addColorStop(.51,'rgba(194,120,59,'+(.07*power)+')');
    g.addColorStop(1,'rgba(16,30,48,'+(.29*power)+')');
    c.fillStyle=g;c.fillRect(0,0,s.width,s.height);
  }
  return s;
}

export function figures(proj,images){
  return proj.actors.map(a=>{
    const src=images.get(a.id)??images.get('guard');
    const p=HERO_PROFILES[a.id]?heroPlacement(a.id,{heightCm:a.heightCm,pixelsPerMeter:proj.pixelsPerMeter}):
      {width:proj.pixelsPerMeter*1.52,height:proj.pixelsPerMeter*1.9,anchor:{x:.51,y:.91}};
    const t=proj.torch;
    const dist=t?Math.hypot(t.x-a.x,t.y-a.y):Infinity;
    const power=t?.on && (a.id===t.actorId || contains(t.polygon??[],[a.x,a.y])) ? Math.max(0,1-dist/t.range) : 0;
    return {...a,p,power,src:tinted(src,t,a,power),original:src};
  }).sort((a,b)=>a.y-b.y);
}

export function castShadows(proj,cast,seen){
  const s=sheet(proj.width,proj.height),c=s.getContext('2d'),torch=proj.torch;
  for(const a of cast){
    const {width:w,height:h,anchor}=a.p;
    c.save();c.clip(seen);
    if(torch?.on && a.power>0 && a.id!==torch.actorId){
      c.save();clipPolygon(c,torch.polygon);
      const vx=a.x-torch.x,vy=a.y-torch.y,dist=Math.max(1,Math.hypot(vx,vy));
      const length=h*(.53+Math.min(1.15,dist/torch.range));
      const silhouette=sheet(a.original.width,a.original.height),pen=silhouette.getContext('2d');
      pen.drawImage(a.original,0,0);pen.globalCompositeOperation='source-in';pen.fillStyle='#0a0d16';pen.fillRect(0,0,silhouette.width,silhouette.height);
      // Project the actual silhouette along the source-to-foot direction. Foreshorten its height on the floor.
      c.translate(a.x,a.y);c.transform(1,0,-vx/dist*length/h,-vy/dist*length/h+.05,0,0);
      c.globalAlpha=.31+.39*a.power;c.filter='blur(1.25px)';
      c.drawImage(silhouette,-w*anchor.x,-h*anchor.y,w,h);c.restore();
    }
    const glow=c.createRadialGradient(a.x,a.y,0,a.x,a.y,w*.30);
    glow.addColorStop(0,'#08090db5');glow.addColorStop(1,'#08090d00');
    c.translate(0,a.y);c.scale(1,.38);c.translate(0,-a.y);
    c.fillStyle=glow;c.fillRect(a.x-w*.32,a.y-w*.32,w*.64,w*.64);c.restore();
  }
  return s;
}

export function socket(actor,key) {
  const n=actor.p[key];
  return {x:actor.x+(n.x-actor.p.anchor.x)*actor.p.width,y:actor.y+(n.y-actor.p.anchor.y)*actor.p.height};
}

export function torchHandle(){
  const s=sheet(52,12),c=s.getContext('2d');
  c.fillStyle='#463423';c.fillRect(0,3,42,6);c.fillStyle='#ab8454';c.fillRect(0,3,42,1.4);
  c.fillStyle='#64554b';c.fillRect(37,1,13,10);c.fillStyle='#b09e81';c.fillRect(38,1,2,9);
  c.fillStyle='#8e6540';c.fillRect(45,1,3,10);return s;
}

export function floorMarker(){
  const s=sheet(128,128),c=s.getContext('2d');
  const points=Array.from({length:6},(_,i)=>{const angle=(i*60-90)*Math.PI/180;return[64+55*Math.cos(angle),64+55*Math.sin(angle)];});
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.lineWidth=2;
  c.strokeStyle='#f4cf81b5';c.fillStyle='#d7aa541c';c.fill();c.stroke();
  c.strokeStyle='#ffe7aa';c.lineWidth=4;
  for(let i=0;i<6;i++){
    const cur=points[i],a=points[(i+5)%6],b=points[(i+1)%6];
    c.beginPath();c.moveTo(cur[0]+.16*(a[0]-cur[0]),cur[1]+.16*(a[1]-cur[1]));
    c.lineTo(...cur);c.lineTo(cur[0]+.16*(b[0]-cur[0]),cur[1]+.16*(b[1]-cur[1]));c.stroke();
  }
  return s;
}

export function portraitTokens(images) {
  const tokens=new Map();
  for(const [id,profile] of Object.entries(HERO_PROFILES)){
    const original=images.get(id),s=sheet(96,96),c=s.getContext('2d');
    const {x,y,width}=profile.face,side=width*original.width;
    c.beginPath();c.arc(48,48,45,0,Math.PI*2);c.fillStyle='#22292b';c.fill();
    c.save();c.clip();c.drawImage(original,x*original.width-side/2,y*original.height-side/2,side,side,2,2,92,92);c.restore();
    c.lineWidth=3;c.strokeStyle='#c5ac80';c.stroke();
    tokens.set(id,s);
  }
  return tokens;
}
