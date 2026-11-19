/* Pixel scale and physical footprint helpers shared by the editor and tests. */
(() => {
 const number=(value)=>Number.isFinite(Number(value))?Number(value):NaN;
 const pixelSize=(definition,pixelsPerMeter)=>{
  const ppm=number(pixelsPerMeter),width=number(definition?.width_m),depth=number(definition?.depth_m);
  if(!(ppm>0&&width>0&&depth>0))return null;
  return {width:width*ppm,depth:depth*ppm};
 };
 const calibrate=(a,b,distanceMeters)=>{
  const meters=number(distanceMeters),dx=number(b?.x)-number(a?.x),dy=number(b?.y)-number(a?.y),distance=Math.hypot(dx,dy);
  if(!(meters>0&&distance>0))return null;
  return distance/meters;
 };
 const footprint=(widthMeters,depthMeters,rotationDegrees=0)=>{
  const w=number(widthMeters),d=number(depthMeters),rad=number(rotationDegrees)*Math.PI/180;
  if(!(w>0&&d>0&&Number.isFinite(rad)))return [];
  return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([x,y])=>({
   x:Number((x*Math.cos(rad)-y*Math.sin(rad)).toFixed(6)),
   y:Number((x*Math.sin(rad)+y*Math.cos(rad)).toFixed(6))
  }));
 };
 window.aleaMapObjectGeometry=Object.freeze({pixelSize,calibrate,footprint});
})();
