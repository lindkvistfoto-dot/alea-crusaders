/* Smart Polygon Editor — pure topological helpers (no runtime dependencies). */
const EPS=1e-5;
const eq=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<EPS;
const key=p=>p.map(v=>Number(v).toFixed(5)).join(',');
const edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');
function area(p){return p.reduce((s,a,i)=>{let b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2}
function onSegment(p,a,b){
 const cross=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
 return len>EPS&&Math.abs(cross)/len<EPS&&((p[0]-a[0])*(p[0]-b[0])+(p[1]-a[1])*(p[1]-b[1]))<EPS;
}
function inside(p,poly){
 let v=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if(onSegment(p,a,b)||eq(p,a))return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])v=!v;
 }
 return v;
}
function splitPolygons(polygons){
 const all=polygons.flatMap(p=>p);
 return polygons.map(poly=>{
  const output=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length];
   let extra=all.filter(p=>!eq(p,a)&&!eq(p,b)&&onSegment(p,a,b));
   let points=[a,...extra].sort((p,q)=>(p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1])-((q[0]-a[0])*(b[0]-a[0])+(q[1]-a[1])*(b[1]-a[1])));
   for(let p of points)if(!output.length||!eq(output[output.length-1],p))output.push(p.slice());
  }
  return output;
 });
}
function findHoles(polygons){
 const shapes=splitPolygons(polygons.filter(p=>p.length>=3));
 const edges=new Map(),vertices=new Map();
 for(let poly of shapes)for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];if(eq(a,b))continue;
  edges.set(edgeKey(a,b),[a,b]);vertices.set(key(a),a);vertices.set(key(b),b);
 }
 const outgoing=new Map(),half=[];
 for(let [a,b] of edges.values())for(let [from,to] of [[a,b],[b,a]]){
  let h={from:key(from),to:key(to),seen:false};
  half.push(h);if(!outgoing.has(h.from))outgoing.set(h.from,[]);
  outgoing.get(h.from).push(h);
 }
 for(let hs of outgoing.values())hs.sort((a,b)=>{
  const p=vertices.get(a.from),x=vertices.get(a.to),y=vertices.get(b.to);
  return Math.atan2(x[1]-p[1],x[0]-p[0])-Math.atan2(y[1]-p[1],y[0]-p[0]);
 });
 const holes=[],signatures=new Set();
 for(let h of half){
  if(h.seen)continue;
  const trace=[],visited=new Set();let current=h,closed=false;
  for(let i=0;i<=half.length;i++){
   const id=current.from+'>'+current.to;
   if(visited.has(id)){closed=current===h;break}
   visited.add(id);trace.push(vertices.get(current.from));
   const outs=outgoing.get(current.to)||[];
   const rev=outs.findIndex(x=>x.to===current.from);
   if(rev<0)break;
   current=outs[(rev-1+outs.length)%outs.length];
  }
  for(let id of visited){let entry=half.find(x=>x.from+'>'+x.to===id);if(entry)entry.seen=true}
  if(!closed||trace.length<3||area(trace)<EPS)continue;
  // A point just inside the clockwise face: below a rightward horizontal edge.
  let sample=null;
  for(let i=0;i<trace.length;i++){
   const a=trace[i],b=trace[(i+1)%trace.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
   if(len<EPS)continue;
   const delta=Math.min(.001,len/1000);
   sample=[(a[0]+b[0])/2-(b[1]-a[1])/len*delta,(a[1]+b[1])/2+(b[0]-a[0])/len*delta];
   break;
  }
  if(!sample||shapes.some(poly=>inside(sample,poly)))continue;
  const sig=trace.map(key).sort().join(';');if(signatures.has(sig))continue;
  signatures.add(sig);holes.push({points:trace,area:area(trace)});
 }
 return holes.sort((a,b)=>a.area-b.area);
}
function mergeHole(polygon,hole){
 const [a,b]=splitPolygons([polygon,hole]);
 const edges=new Map();
 for(let poly of [a,b])for(let i=0;i<poly.length;i++){
  const from=poly[i],to=poly[(i+1)%poly.length],id=edgeKey(from,to);
  if(edges.has(id))edges.delete(id);else edges.set(id,{from,to});
 }
 const remaining=[...edges.values()];
 const output=[],used=new Set();let current=remaining[0];
 if(!current)return null;
 const first=key(current.from);
 for(let i=0;i<=remaining.length;i++){
  if(!current||used.has(current))return null;
  used.add(current);output.push(current.from);
  if(key(current.to)===first)break;
  const choices=remaining.filter(e=>!used.has(e)&&eq(e.from,current.to));
  if(choices.length!==1)return null;current=choices[0];
 }
 if(used.size!==remaining.length||output.length<3)return null;
 const result=output.filter((p,i)=>!i||!eq(p,output[i-1]));
 if(Math.abs(area(result)-area(a)-area(b))>Math.max(.01,Math.abs(area(b))*.00001))return null;
 return result;
}
function moveSharedVertex(polygons,origin,destination){
 return polygons.map(poly=>poly.map(p=>eq(p,origin)?destination.slice():p.slice()));
}
export {area,splitPolygons,findHoles,mergeHole,moveSharedVertex};
