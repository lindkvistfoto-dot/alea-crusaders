import '../combat/footprint.js';
import {cameraFor,usePortrait,screenToMap} from './camera.js';
import {contains} from '../map/kartakademin-geometry.js';
import {flames,flameWeights} from '../map/kartakademin-flame.js';
import {roomMaterials,torchPool,sunShaft,doorLeaf,lightMote,torchHead} from './materials.js';
import {figureArt,figures,castShadows,socket,torchHandle,floorMarker,portraitTokens} from './figure-art.js';
import {createSceneSurface} from './surface.js';
import {HERO_PROFILES} from './hero-class.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const layer=(id,src,x=0,y=0,w=src.width,h=src.height,extra={})=>({id,src,x,y,w,h,...extra});
const FLOOR_PITCH=1.5;

function dustInShaft(proj) {
  if(!proj.sun?.polygon?.length)return [];
  const hull=proj.sun.polygon,xs=hull.map(v=>v[0]),ys=hull.map(v=>v[1]);
  const x0=Math.min(...xs),y0=Math.min(...ys),dx=Math.max(...xs)-x0,dy=Math.max(...ys)-y0;
  const visible=proj.floor.filter(cell=>cell.visibility==='visible');
  const dots=[];
  for(let i=0;i<44;i++){
    const x=x0+dx*((i*.75487767+.13)%1),y=y0+dy*((i*.56984029+.31)%1);
    // The particle never wanders beyond its authorized footprint (+/- 1.2 px).
    const allowed=[[-1.5,-1.5],[1.5,-1.5],[1.5,1.5],[-1.5,1.5]].every(([ox,oy])=>
      contains(hull,[x+ox,y+oy])&&visible.some(r=>x+ox>=r.x&&x+ox<=r.x+r.width&&y+oy>=r.y&&y+oy<=r.y+r.height));
    if(allowed)dots.push({x,y,phase:i*1.7});
  }
  return dots;
}

function floorCell(actor,projection) {
  const grid=globalThis.aleaMapGrid;
  const g=grid.geometry(projection,{academy_map:true,hex_m:FLOOR_PITCH,pixels_per_meter:projection.pixelsPerMeter});
  return grid.center(g,actor.q,actor.r);
}

export async function mountCrypt(host,callbacks={}) {
  const images=await figureArt(),surface=await createSceneSurface(host),canvas=surface.canvas;
  canvas.style.display='block';canvas.style.width='100%';canvas.style.height='100%';canvas.style.touchAction='manipulation';
  canvas.setAttribute('aria-label','Kryptans spelkarta');canvas.dataset.renderer=surface.kind;
  const portraits=portraitTokens(images), compact=new Map();
  const leafArt=doorLeaf(),leafEdge=doorLeaf(true),marker=floorMarker(),mote=lightMote(),flame=torchHead(),handle=torchHandle();
  let projection,materials,imagesForFrame,sceneKey='',camera,width=1,height=1,raf=0,lastFrame=0;
  let doorFrom=null,doorTo=null,doorChanged=0,disposed=false,inView=true;
  let options={camera:'map',wallMode:'low',grid:false,sunlight:true};
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const isStill=()=>options.reducedMotion??media.matches;
  function angleAt(now) {
    const t=clamp((now-doorChanged)/490,0,1);
    return doorFrom+(doorTo-doorFrom)*(t*t*(3-2*t));
  }
  function resize(){
    width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);
    surface.resize(width,height);
    canvas.style.width='100%';canvas.style.height='100%';
    invalidate();
  }
  function clear() {
    if(disposed)return;
    projection=null;imagesForFrame=null;sceneKey='';compact.clear();
    doorFrom=doorTo=null;camera=null;
    cancelAnimationFrame(raf);raf=0;
    surface.draw([], {scale:1,x:0,y:0},0);
  }
  function update(next,nextOptions={}) {
    if(disposed)return;
    if(!next){clear();return;}
    options={...options,...nextOptions};projection=next;
    if(!materials || materials.width!==next.width || materials.height!==next.height){
      materials={...roomMaterials(next.width,next.height),width:next.width,height:next.height};sceneKey='';
    }
    const now=performance.now(),dest=next.door ? next.door.open ? 0 : Math.PI/2 : null;
    if(dest!==doorTo){
      doorFrom=doorTo===null||dest===null?dest:angleAt(now);doorTo=dest;doorChanged=now;
    }
    const key=JSON.stringify([next.floor,next.walls,next.actors,next.objects,next.torch,next.sun,
      next.pixelsPerMeter,options.wallMode,options.grid,options.sunlight]);
    if(key!==sceneKey){
      const land=materials.floor(next,options),cast=figures(next,images);
      imagesForFrame={terrain:land.terrain,cast,shadows:castShadows(next,cast,land.seen),
        lit:torchPool(next.width,next.height,next.torch,land.seen),
        sun:options.sunlight?sunShaft(next.width,next.height,next.sun,land.seen):null,
        dust:options.sunlight?dustInShaft(next):[]};
      sceneKey=key;
    }
    invalidate();
  }

  function paint(now) {
    if(!projection||!imagesForFrame||disposed)return;
    const still=isStill(),t=still?0:now/1000,p=projection,layers=imagesForFrame;
    camera=cameraFor(p,options,width,height);
    const list=[layer('floor',layers.terrain)];
    const weights=flameWeights(t*6.1,still?0:.1,flames.fackla);
    if(layers.sun){
      list.push(layer('sun',layers.sun,0,0,p.width,p.height,{add:true,alpha:.86+.06*Math.sin(t*.45)}));
      for(let i=0;i<layers.dust.length;i++){
        const dot=layers.dust[i],u=dot.phase+t*.33,s=1.6+(i%3)*.55;
        list.push(layer('dust'+i,mote,dot.x+Math.sin(u)*1.1,dot.y+Math.cos(u*.8),s,s,{ax:.5,ay:.5,add:true,alpha:.5+.32*Math.sin(u)}));
      }
    }
    if(layers.lit)list.push(layer('torchlight',layers.lit,0,0,p.width,p.height,{add:true,alpha:.84+.15*weights[0]}));
    list.push(layer('shadows',layers.shadows));
    if(p.door){
      const d=p.door,angle=still?doorTo:angleAt(now),length=Math.hypot(d.endX-d.x,d.endY-d.y);
      const thickness=options.wallMode==='flat'?6:options.wallMode==='high'?13:10;
      list.push(layer('door-edge',leafEdge,d.x,d.y+Math.abs(Math.cos(angle))*thickness*.45+1,length,thickness,
        {ay:.50,angle}));
      list.push(layer('door-leaf',leafArt,d.x,d.y,length,thickness,{ay:.5,angle}));
    }
    const active=layers.cast.find(a=>a.id===options.selectedHero);
    if(active){
      const pitch=FLOOR_PITCH*p.pixelsPerMeter,[x,y]=floorCell(active,p),size=pitch*2/Math.sqrt(3)*128/110;
      list.push(layer('selection',marker,x,y,size,size,{ax:.5,ay:.5}));
    }
    for(const a of layers.cast){
      const {width:w,height:h,anchor}=a.p;
      if(a.hp===0){
        list.push(layer('down-'+a.id,a.src,a.x,a.y,w*.82,h*.82,{ax:anchor.x,ay:anchor.y,angle:Math.PI*.45,alpha:.55}));
        continue;
      }
      const pixels=h*camera.scale;
      let icon=compact.get(a.id);
      const small=usePortrait(a.kind,pixels,icon?.small);
      if(!icon || icon.small!==small){
        icon={small,from:icon?.alpha??Number(small),start:now};compact.set(a.id,icon);
      }
      const fade=still?1:clamp((now-icon.start)/180,0,1);
      icon.alpha=icon.from+(Number(small)-icon.from)*fade;
      if(icon.alpha>0){
        const side=25/camera.scale;
        list.push(layer('portrait-'+a.id,portraits.get(a.id),a.x,a.y,side,side,{ax:.5,ay:.70,alpha:icon.alpha}));
      }
      if(icon.alpha===1)continue;
      const actorStart=list.length;
      list.push(layer('actor-'+a.id,a.src,a.x,a.y,w,h,{ax:anchor.x,ay:anchor.y,hero:HERO_PROFILES[a.id]?a.id:null,still}));
      if(a.id==='evalin'&&p.torch?.on){
        const grip=socket(a,'torchGrip'),fire=socket(a,'torchFlame');
        // The handle terminates in the attachment defined on the original cutout; the fuel burns above it.
        const len=Math.hypot(fire.x-grip.x,fire.y-grip.y),angle=Math.atan2(fire.y-grip.y,fire.x-grip.x);
        list.push(layer('torch-shaft',handle,grip.x,grip.y,len,Math.max(2,len*.25),{ay:.5,angle}));
        list.push(layer('torch-flame',flame,fire.x,fire.y,len*(.55+weights[0]*.11),len*(1.18+weights[1]*.32),
          {ax:.5,ay:.86,angle:.09*Math.sin(t*5.6)}));
        if(!still)for(let i=0;i<4;i++){
          const f=(t*.67+i*.257)%1,xx=fire.x+Math.sin(f*4+i)*f*2.6,yy=fire.y-len*(.33+f*1.3);
          list.push(layer('spark'+i,mote,xx,yy,1.6,2.1,{ax:.5,ay:.5,add:true,alpha:(1-f)*.92}));
        }
      }
      if(icon.alpha>0)for(let i=actorStart;i<list.length;i++)list[i].alpha=(list[i].alpha??1)*(1-icon.alpha);
    }
    surface.draw(list,camera,t);
    globalThis.aleaCryptFrameProbe?.();
  }
  function frame(now){
    raf=0;if(disposed||document.hidden||!inView)return;
    if(now-lastFrame>=1000/42||isStill()){lastFrame=now;paint(now);}
    if(projection&&!isStill())raf=requestAnimationFrame(frame);
  }
  function invalidate(){
    if(disposed||document.hidden||!inView)return;
    if(!raf)raf=requestAnimationFrame(frame);
    // Draw a changed projection before the next animation slot, including under reduced motion.
    lastFrame=-Infinity;
  }
  const watch=new ResizeObserver(resize);watch.observe(host);
  const intersection=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    inView=entries.some(x=>x.isIntersecting);if(inView)invalidate();
  }):null;
  intersection?.observe(host);
  let pressed=null;
  function pointerDown(e){pressed=[e.clientX,e.clientY];}
  function pointerUp(e){
    if(!pressed||!projection||!camera)return;
    const travel=Math.hypot(pressed[0]-e.clientX,pressed[1]-e.clientY);pressed=null;
    if(travel>9)return;
    const r=canvas.getBoundingClientRect();
    const [x,y]=screenToMap(camera,e.clientX-r.left,e.clientY-r.top);
    for(const a of [...imagesForFrame.cast].reverse()){
      const side=25/camera.scale;
      const {width:w,height:h,anchor}=compact.get(a.id)?.small?{width:side,height:side,anchor:{x:.5,y:.70}}:a.p;
      if(x>=a.x-w*anchor.x&&x<=a.x+w*(1-anchor.x)&&y>=a.y-h*anchor.y&&y<=a.y+h*(1-anchor.y)){
        if(a.kind==='hero')callbacks.onHero?.(a.id);else callbacks.onGuard?.(a.id);return;
      }
    }
    const d=projection.door;
    if(d){
      const len=Math.hypot(d.endX-d.x,d.endY-d.y);
      const near=d.open ? x>=d.x-7&&x<=d.x+len+7&&Math.abs(y-d.y)<=11 : Math.abs(x-d.x)<=11&&y>=d.y-7&&y<=d.endY+7;
      if(near){callbacks.onDoor?.();return;}
    }
    if(x>=0&&x<=projection.width&&y>=0&&y<=projection.height)callbacks.onPoint?.([x,y]);
  }
  const onCancel=()=>{pressed=null;};
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',onCancel);
  document.addEventListener('visibilitychange',invalidate);media.addEventListener('change',invalidate);
  resize();
  return {update,clear,destroy(){
    disposed=true;cancelAnimationFrame(raf);watch.disconnect();intersection?.disconnect();
    media.removeEventListener('change',invalidate);document.removeEventListener('visibilitychange',invalidate);
    canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);
    canvas.removeEventListener('pointercancel',onCancel);surface.destroy();images.clear();projection=null;imagesForFrame=null;
  }};
}
