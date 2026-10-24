/* ARCANE GEOMETRY ENGINE V1 — deterministic pointy-top hex grid, no image generation. */
(function(root){
 'use strict';
 const SQRT3=Math.sqrt(3);
 const DEFAULT_CAMERA=Object.freeze({elevationDegrees:55,azimuthDegrees:0,scale:1,wallHeight:0.20});
 const PATTERNS=Object.freeze({'single':[1],'double':[2],'triple-compact':[1,2],'quad-diamond':[1,2,1],'six-wedge':[1,2,3],'six-long':[1,2,2,1],'seven-compact':[2,3,2],'nine-diamond':[1,2,3,2,1]});
 function fromRows(rows){
  if(!Array.isArray(rows)||!rows.length||rows.some(n=>!Number.isInteger(n)||n<1||n>20))throw new Error('Invalid hex row pattern');
  const cells=[];
  rows.forEach((n,r)=>{const start=-Math.floor((n+r)/2);for(let i=0;i<n;i++)cells.push({q:start+i,r})});
  return cells;
 }
 function rotate({q,r},steps=0){let x=q,z=r,y=-x-z;for(let i=0;i<((steps%6)+6)%6;i++){[x,y,z]=[-z,-x,-y]}return {q:x,r:z}}
 function reflect({q,r}){return {q:-q-r,r}}
 function transform(cells,{steps=0,mirror=false}={}){return cells.map(c=>rotate(mirror?reflect(c):c,steps))}
 function key(c){return c.q+','+c.r}
 function neighbors(c){return [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]].map(([q,r])=>({q:c.q+q,r:c.r+r}))}
 function validate(cells){
  const seen=new Set(cells.map(key));if(seen.size!==cells.length||!cells.length)return {valid:false,reason:'duplicate-or-empty'};
  const reached=new Set([key(cells[0])]),queue=[cells[0]];
  while(queue.length){for(const n of neighbors(queue.shift()))if(seen.has(key(n))&&!reached.has(key(n))){reached.add(key(n));queue.push(n)}}
  return {valid:reached.size===cells.length,count:cells.length,connected:reached.size===cells.length};
 }
 function world(c,size=1){return {x:SQRT3*size*(c.q+c.r/2),y:1.5*size*c.r}}
 function project(p,camera=DEFAULT_CAMERA){
  const az=(camera.azimuthDegrees??0)*Math.PI/180,el=(camera.elevationDegrees??55)*Math.PI/180,s=camera.scale??1;
  const x=p.x*Math.cos(az)-p.y*Math.sin(az),y=p.x*Math.sin(az)+p.y*Math.cos(az);
  return {x:x*s,y:(y*Math.sin(el)-(p.z||0)*Math.cos(el))*s};
 }
 function corners(c,size=1){const center=world(c,size);return Array.from({length:6},(_,i)=>{const a=(i*60-90)*Math.PI/180;return {x:center.x+size*Math.cos(a),y:center.y+size*Math.sin(a)}})}
 function geometry(rows,opts={}){
  const cells=transform(fromRows(rows),opts),check=validate(cells);if(!check.valid)throw new Error('Disconnected formation');
  const size=opts.size||1,camera={...DEFAULT_CAMERA,...opts.camera};
  const faces=cells.map(c=>({cell:c,center:project(world(c,size),camera),points:corners(c,size).map(p=>project(p,camera))}));
  const bounds=faces.flatMap(f=>f.points).reduce((a,p)=>({minX:Math.min(a.minX,p.x),maxX:Math.max(a.maxX,p.x),minY:Math.min(a.minY,p.y),maxY:Math.max(a.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  return {cells,faces,bounds,camera,check};
 }
 function svg(rows,opts={}){
  const g=geometry(rows,opts),padding=opts.padding??0.5,wallHeight=(opts.size||1)*(g.camera.wallHeight??0.2);
  const edges=new Map();
  const ptKey=p=>p.x.toFixed(6)+','+p.y.toFixed(6);
  for(const f of g.faces){for(let i=0;i<6;i++){
   const a=f.points[i],b=f.points[(i+1)%6],keys=[ptKey(a),ptKey(b)].sort(),k=keys.join('|');
   if(edges.has(k))edges.get(k).count++;else edges.set(k,{a,b,count:1});
  }}
  const walls=[];
  for(const edge of edges.values())if(edge.count===1){
   const offset=wallHeight*Math.cos((g.camera.elevationDegrees??55)*Math.PI/180)*(g.camera.scale??1);
   walls.push([edge.a,edge.b,{x:edge.b.x,y:edge.b.y+offset},{x:edge.a.x,y:edge.a.y+offset}]);
  }
  const all=[...g.faces.flatMap(f=>f.points),...walls.flat()];
  const bounds=all.reduce((a,p)=>({minX:Math.min(a.minX,p.x),maxX:Math.max(a.maxX,p.x),minY:Math.min(a.minY,p.y),maxY:Math.max(a.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  const w=bounds.maxX-bounds.minX+padding*2,h=bounds.maxY-bounds.minY+padding*2;
  const points=pts=>pts.map(p=>(p.x-bounds.minX+padding).toFixed(4)+','+(p.y-bounds.minY+padding).toFixed(4)).join(' ');
  const wallArt=walls.map((p,i)=>'<polygon points="'+points(p)+'" fill="'+(i%2?'#806039':'#9d7845')+'" stroke="#694827" stroke-width="0.025"/>').join('');
  const faces=g.faces.map(f=>{const x=f.center.x-bounds.minX+padding,y=f.center.y-bounds.minY+padding;
   return '<g><polygon points="'+points(f.points)+'" fill="#eee0bd" stroke="#89602e" stroke-width="0.055"/><circle cx="'+x.toFixed(4)+'" cy="'+y.toFixed(4)+'" r="0.22" fill="none" stroke="#a57a3c" stroke-width="0.035"/><path d="M '+x.toFixed(4)+' '+(y-.17).toFixed(4)+' L '+(x+.06).toFixed(4)+' '+y.toFixed(4)+' L '+x.toFixed(4)+' '+(y+.17).toFixed(4)+' L '+(x-.06).toFixed(4)+' '+y.toFixed(4)+' Z" fill="#ad8242"/></g>'}).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w.toFixed(4)+' '+h.toFixed(4)+'" role="img" aria-label="'+rows.join('-')+' hex formation">'+wallArt+faces+'</svg>';
 }

 root.aleaArcaneGeometryEngine=Object.freeze({DEFAULT_CAMERA,PATTERNS,fromRows,rotate,reflect,transform,neighbors,validate,world,project,corners,geometry,svg});
})(globalThis);
