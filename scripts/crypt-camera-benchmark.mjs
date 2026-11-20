// CPU-only stress case for camera selection on a synthetic village; no production campaign data.
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {cameraFor,usePortrait,screenToMap} from '../features/crypt/camera.js';
import {heroPlacement} from '../features/crypt/hero-class.js';

export function villageCase() {
  const width=1535, height=1024, pixelsPerMeter=width/750;
  const places=Array.from({length:30},(_,i)=>({
    x:width*((i%6)+.5)/6, y:height*(Math.floor(i/6)+.5)/5
  }));
  const meetingPoint=places[14];
  const actors=['astrid','lyra','evalin'].map((id,i)=>({
    id,kind:'hero',x:meetingPoint.x+i*2*pixelsPerMeter,y:meetingPoint.y,
  }));
  return {width,height,pixelsPerMeter,actors,places};
}

export function evaluateVillage(scene, width, height, camera, selectedHero='astrid') {
  const view=cameraFor(scene,{camera,selectedHero},width,height);
  const upperLeft=screenToMap(view,0,0);
  const lowerRight=screenToMap(view,width,height);
  const visible=p=>p.x>=upperLeft[0] && p.x<=lowerRight[0] && p.y>=upperLeft[1] && p.y<=lowerRight[1];
  const heroes=scene.actors.filter(a=>a.kind==='hero' && visible(a)).map(actor=>{
    const placement=heroPlacement(actor.id,{pixelsPerMeter:scene.pixelsPerMeter});
    const imageHeight=placement.height*view.scale;
    return {id:actor.id,imagePixels:Number(imageHeight.toFixed(2)),portrait:usePortrait(actor.kind,imageHeight)};
  });
  return {viewport:[width,height],camera,placesInFrame:scene.places.filter(visible).length,
    heroes,adjacentCentresPixels:Number((1.5*scene.pixelsPerMeter*view.scale).toFixed(2))};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  const scene=villageCase();
  const cases=[[1280,800,'map'],[1280,800,'person'],[390,234,'map'],[390,234,'person']];
  const observations=cases.map(args=>evaluateVillage(scene,...args));
  const iterations=20000,times=[];
  for(let i=0;i<500;i++) evaluateVillage(scene,...cases[i%cases.length]);
  for(let batch=0;batch<100;batch++) {
    const start=performance.now();
    for(let i=0;i<iterations/100;i++) evaluateVillage(scene,...cases[i%cases.length]);
    times.push(1000*(performance.now()-start)/(iterations/100));
  }
  times.sort((a,b)=>a-b);
  console.log(JSON.stringify({synthetic:true,locations:scene.places.length,assumedWidthMetres:750,
    stage:'Camera, visibility of known points and hero representation only; no map rendering, network or grid generation.',
    observations,iterations,meanMicrosecondsPerUpdateP95AcrossBatches:Number(times[94].toFixed(2))},null,2));
}
