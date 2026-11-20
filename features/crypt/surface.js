import { heroSwayWeights } from './hero-class.js';

const BACKGROUND = '#161d20';
const GRID_X = 11, GRID_Y = 15;

function deform(mesh, item, time) {
  const geometry = mesh.geometry;
  if (!mesh.poseWeights || mesh.poseWeights.id !== item.hero) {
    const weights = [];
    for (let row = 0; row < GRID_Y; row++) for (let col = 0; col < GRID_X; col++) {
      const u = col / (GRID_X-1), v = row / (GRID_Y-1);
      weights.push({u, v, ...heroSwayWeights(item.hero,u,v)});
    }
    mesh.poseWeights = {id:item.hero, weights};
  }
  const phase = (item.hero === 'lyra' ? .80 : item.hero === 'evalin' ? 1.60 : 1.26) * time;
  const breath=Math.sin(phase), clothA=Math.sin(time*.79+1.2),clothB=Math.sin(time*.94+3.1);
  const width=item.src.width,height=item.src.height;
  const vertices=geometry.positions, weights=mesh.poseWeights.weights;
  for(let i=0;i<weights.length;i++){
    const w=weights[i];
    const waveX=item.still?0:(w.body*(w.u-.5)*breath*.014+w.clothLeft*clothA*.018+w.clothRight*clothB*.015+w.gear*Math.sin(phase+.4)*.003);
    const waveY=item.still?0:(-w.body*breath*.010+w.clothLeft*clothB*.005+w.clothRight*clothA*.004+w.gear*Math.cos(phase)*.003);
    vertices[2*i]=(w.u+waveX)*width;
    vertices[2*i+1]=(w.v+waveY)*height;
  }
  geometry.getBuffer('aPosition').update();
}

async function gpuSurface(host) {
  const {Application,Container,Texture,Sprite,MeshPlane}=await import('pixi.js');
  const app = new Application();
  try {
    await app.init({width:10,height:10,antialias:true,background:BACKGROUND,
      resolution:Math.min(window.devicePixelRatio||1,2),autoDensity:true,autoStart:false,
      sharedTicker:false,preference:'webgl',powerPreference:'low-power'});
    const space=new Container();app.stage.addChild(space);host.append(app.canvas);
    const records=new Map(),textures=new Map();
    const textureFor=src=>{
      let t=textures.get(src);
      if(!t){t=Texture.from(src);textures.set(src,t);}
      return t;
    };
    function draw(items,camera,t){
      space.scale.set(camera.scale);space.position.set(camera.x,camera.y);
      const used=new Set(),sources=new Set();
      for(const [index,item] of items.entries()){
        const {id,src}=item;used.add(id);sources.add(src);
        const tex=textureFor(src);
        let display=records.get(id);
        if(!display){
          display=item.hero ? new MeshPlane({texture:tex,verticesX:GRID_X,verticesY:GRID_Y}) : new Sprite(tex);
          records.set(id,display);space.addChild(display);
        }
        if(display.texture!==tex)display.texture=tex;
        if(space.getChildIndex(display)!==index)space.setChildIndex(display,index);
        display.position.set(item.x,item.y);display.scale.set(item.w/src.width,item.h/src.height);
        display.pivot.set((item.ax||0)*src.width,(item.ay||0)*src.height);
        display.rotation=item.angle||0;display.alpha=item.alpha??1;
        display.blendMode=item.add?'add':'normal';
        if(item.hero)deform(display,item,t);
      }
      for(const [id,d] of records)if(!used.has(id)){
        d.parent?.removeChild(d);
        const geometry=d.poseWeights?d.geometry:null;
        d.destroy();geometry?.destroy();records.delete(id);
      }
      for(const [src,tex] of textures)if(!sources.has(src)){tex.destroy(true);textures.delete(src);}
      app.render();
    }
    return {canvas:app.canvas,draw,kind:'pixi-webgl',
      resize:(w,h)=>app.renderer.resize(w,h),
      destroy(){const geometries=[...records.values()].filter(d=>d.poseWeights).map(d=>d.geometry);records.clear();
        app.destroy({removeView:true},{children:true});for(const g of geometries)g.destroy();
        for(const t of textures.values())t.destroy(true);textures.clear();}};
  }catch(error){
    if(app.renderer)app.destroy({removeView:true},{children:true});
    throw error;
  }
}

function canvasSurface(host) {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Kartan kräver stöd för Canvas.');
  const scale=Math.min(window.devicePixelRatio||1,2);
  host.append(canvas);
  return {canvas,kind:'canvas2d',
    resize(w,h){canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));},
    draw(items,camera,t){
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=BACKGROUND;ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.setTransform(scale*camera.scale,0,0,scale*camera.scale,camera.x*scale,camera.y*scale);
      for(const i of items){
        ctx.save();ctx.translate(i.x,i.y);
        ctx.rotate(i.angle||0);ctx.globalAlpha=i.alpha??1;ctx.globalCompositeOperation=i.add?'lighter':'source-over';
        const breath=i.hero&&!i.still?Math.sin(t*(i.hero==='lyra'?.80:i.hero==='evalin'?1.6:1.26))*.009:0;
        const h=i.h*(1+breath);ctx.drawImage(i.src,-(i.ax||0)*i.w,-(i.ay||0)*h,i.w,h);
        ctx.restore();
      }
    },destroy:()=>canvas.remove()};
}

// Keep the same geometry, movement, light masks and hit tests on devices without WebGL.
export async function createSceneSurface(host) {
  try{return await gpuSurface(host);}
  catch(error){console.info('Kryptans karta använder Canvas 2D.',error);return canvasSurface(host);}
}
