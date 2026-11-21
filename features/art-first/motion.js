export function followPath(points,elapsed,pitch) {
  const lengths=points.slice(1).map(([x,y],i)=>Math.hypot(x-points[i][0],y-points[i][1]));
  const length=lengths.reduce((a,b)=>a+b,0);
  const duration=Math.max(220,Math.min(1800,320*length/pitch));
  const t=Math.min(1,Math.max(0,elapsed/duration));
  let distance=length*t*t*(3-2*t);
  for(let i=0;i<lengths.length;i++){
    if(distance<=lengths[i] && lengths[i]>0){
      const f=distance/lengths[i],a=points[i],b=points[i+1];
      return {x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,done:t===1};
    }
    distance-=lengths[i];
  }
  const [x,y]=points.at(-1);return {x,y,done:true};
}
