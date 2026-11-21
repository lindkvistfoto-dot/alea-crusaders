// Only the transmission mask is sampled below map resolution. The painting,
// silhouettes and figure textures keep their own independent sampling rates.
import {sheet} from '../crypt/materials.js';
import {visibilityPolygon,clearMapSegment} from '../map/kartakademin-geometry.js';
import {paintedFaces} from './painting.js';

const density=.75;
function polygon(points) {
  const path=new Path2D();
  points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));
  path.closePath();return path;
}

function footprint(source,edges,radius) {
  const [x,y]=source.foot,left=Math.floor(x-radius),top=Math.floor(y-radius);
  const size=Math.ceil(radius*2)+2;
  const stencil=sheet(size*density,size*density),ctx=stencil.getContext('2d');
  ctx.scale(density,density);ctx.translate(-left,-top);
  const hull=visibilityPolygon([x,y],radius,edges);
  ctx.fillStyle='white';ctx.fill(polygon(hull));
  // Painted vertical faces are raised above their floor footprints. Admit a face
  // from its facing side only; its back still blocks the underlying floor rays.
  for(const face of paintedFaces){
    if(face.at.some(at=>Math.hypot(at[0]-x,at[1]-y)<radius && clearMapSegment([x,y],at,edges)))ctx.fill(face.path);
  }
  const mask=sheet(stencil.width,stencil.height),m=mask.getContext('2d');
  // Feather a continuous vector silhouette before radial attenuation. The narrow
  // penumbra has a fixed world-space width, independent of zoom or hex cells.
  m.filter='blur(2.5px)';m.drawImage(stencil,0,0);m.filter='none';
  m.globalCompositeOperation='destination-in';
  const cx=(x-left)*density,cy=(y-top)*density,r=radius*density;
  const fall=m.createRadialGradient(cx,cy,0,cx,cy,r);
  for(const [stop,alpha] of [[0,1],[.16,.98],[.4,.82],[.65,.45],[.86,.12],[1,0]])
    fall.addColorStop(stop,'rgba(0,0,0,'+alpha+')');
  m.fillStyle=fall;m.fillRect(0,0,mask.width,mask.height);
  return {mask,left,top,size};
}

export function createDarkness() {
  const footprints=new Map();
  let edgeKey,wallSource,edges,veil,revision=0,last='',nextFrame=0,lastLand;
  function draw(p,land,options,time,sun) {
    if(p.walls!==wallSource){
      wallSource=p.walls;
      const structure=JSON.stringify([p.walls,p.lightBlockers,p.door]);
      if(structure!==edgeKey){
        edges=p.walls.map(w=>[[w.x1,w.y1],[w.x2,w.y2]]);
        edges.push(...(p.lightBlockers??[]));
        if(p.door && !p.door.open)edges.push([[p.door.x,p.door.y],[p.door.endX,p.door.endY]]);
        edgeKey=structure;footprints.clear();last='';
      }
    }
    if(!veil)veil=sheet(p.width*density,p.height*density);
    const sources=p.lamps.filter(l=>l.on).map(l=>({id:l.id,foot:l.foot,range:l.range}));
    if(p.torch?.on)sources.push({id:8,foot:[p.torch.x,p.torch.y],range:p.torch.range});
    const key=JSON.stringify([options.ambient,options.reach,options.flicker,!!sun,time===0,
      sources.map(s=>[s.id,...s.foot])]);
    if(key!==last || land!==lastLand || (time && sources.length && options.flicker && time>=nextFrame)){
      const c=veil.getContext('2d');
      c.save();c.clearRect(0,0,veil.width,veil.height);
      c.scale(veil.width/p.width,veil.height/p.height);
      if(p.role!=='gm')c.clip(land.visible);
      c.fillStyle='rgba(6,9,14,'+options.ambient+')';c.fillRect(0,0,p.width,p.height);
      c.globalCompositeOperation='destination-out';
      for(const source of sources){
        const radius=source.range*options.reach;
        // Subpixel movement need not retrace every ray. Never quantize the actor itself.
        const at=source.foot.map(v=>Math.round(v/2)*2),signature=[...at,radius].join(',');
        let patch=footprints.get(source.id);
        if(patch?.signature!==signature){
          patch={...footprint({...source,foot:at},edges,radius),signature};
          footprints.set(source.id,patch);
        }
        const phase=source.id*2.39996;
        const wave=(Math.sin(time*6.3+phase)+.48*Math.sin(time*10.7+phase*2)+.23*Math.sin(time*15.1+phase))/1.71;
        c.globalAlpha=time?1-options.flicker*.22*(1-wave):1;
        c.drawImage(patch.mask,patch.left,patch.top,patch.size,patch.size);
      }
      if(sun){c.globalAlpha=.75;c.drawImage(sun,0,0,p.width,p.height);}
      c.restore();revision++;last=key;lastLand=land;nextFrame=time+1/24;
    }
    return {src:veil,revision};
  }
  let portalCanvas,portalKey,portalVersion=0;
  function shadePortal(p,front,leaves){
    // The arch is depth-sorted across the cast. Only reapply the veil over
    // pixels repainted by the front and the two folding timber leaves.
    const key=[revision,leaves[0]?.w??0].join(',');
    if(!portalCanvas)portalCanvas=sheet(front.w,front.h);
    if(key!==portalKey || front.src!==lastFront){
      const c=portalCanvas.getContext('2d');
      c.clearRect(0,0,front.w,front.h);
      c.drawImage(front.src,0,0,front.w,front.h);
      for(const leaf of leaves)c.drawImage(leaf.src,leaf.x-front.x,leaf.y-front.y,leaf.w,leaf.h);
      c.globalCompositeOperation='source-in';
      c.drawImage(veil,-front.x,-front.y,p.width,p.height);
      c.globalCompositeOperation='source-over';
      portalKey=key;lastFront=front.src;portalVersion++;
    }
    return {src:portalCanvas,revision:portalVersion};
  }
  let lastFront;
  return {draw,shadePortal};
}
