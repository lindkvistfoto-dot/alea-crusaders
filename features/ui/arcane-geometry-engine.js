/* ARCANE GEOMETRY ENGINE V1 — deterministic pointy-top hex grid, no image generation. */
(function(root){
 'use strict';
 const SQRT3=Math.sqrt(3);
 const DEFAULT_CAMERA=Object.freeze({elevationDegrees:55,azimuthDegrees:0,scale:1,wallHeight:0.20});
 const PATTERNS=Object.freeze({'single':[1],'double':[2],'triple-compact':[1,2],'quad-diamond':[1,2,1],'six-wedge':[1,2,3],'six-long':[1,2,2,1],'seven-compact':[2,3,2],'nine-diamond':[1,2,3,2,1]});
 function fromRows(rows,options={}){
  if(!Array.isArray(rows)||!rows.length||rows.length>20||rows.some(n=>!Number.isInteger(n)||n<1||n>20))throw new Error('Invalid hex row pattern');
  const offsets=options.offsets;
  if(offsets!==undefined&&(!Array.isArray(offsets)||offsets.length!==rows.length||offsets.some(n=>!Number.isInteger(n)||Math.abs(n)>40)))throw new Error('Invalid row offsets');
  const cells=[];
  rows.forEach((n,r)=>{const start=-Math.floor((n+r)/2)+(offsets?.[r]||0);for(let i=0;i<n;i++)cells.push({q:start+i,r})});
  return cells;
 }
 function buildRows(rows,options={}){
  const raw=fromRows(rows,options),check=validate(raw);
  return {cells:raw,rows:rows.slice(),offsets:options.offsets?.slice()||rows.map(()=>0),check};
 }
 function autoAlign(rows){
  fromRows(rows);
  const offsets=[0];let previous=fromRows([rows[0]]);
  for(let r=1;r<rows.length;r++){
   let best=null;
   for(let shift=-rows[r]-rows[r-1]-2;shift<=rows[r]+rows[r-1]+2;shift++){
    const candidate=fromRows(rows.slice(0,r+1),{offsets:[...offsets,shift]}).filter(c=>c.r===r);
    const contacts=candidate.reduce((sum,c)=>sum+previous.filter(p=>neighbors(c).some(n=>n.q===p.q&&n.r===p.r)).length,0);
    const center=Math.abs(candidate.reduce((sum,c)=>sum+c.q+c.r/2,0)/candidate.length);
    const score=contacts*100-center;
    if(best===null||score>best.score)best={score,shift,candidate};
   }
   offsets.push(best.shift);previous=best.candidate;
  }
  return buildRows(rows,{offsets});
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
  const cells=transform(fromRows(rows,opts),opts),check=validate(cells);if(!check.valid)throw new Error('Disconnected formation');
  const size=opts.size||1,camera={...DEFAULT_CAMERA,...opts.camera};
  const faces=cells.map(c=>({cell:c,center:project(world(c,size),camera),points:corners(c,size).map(p=>project(p,camera))}));
  const bounds=faces.flatMap(f=>f.points).reduce((a,p)=>({minX:Math.min(a.minX,p.x),maxX:Math.max(a.maxX,p.x),minY:Math.min(a.minY,p.y),maxY:Math.max(a.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  return {cells,faces,bounds,camera,check};
 }
 function audit(rows,opts={}){
  const g=geometry(rows,opts),precision=1e-8,cellSet=new Set(g.cells.map(key));
  const sharedPairs=g.cells.reduce((n,c)=>n+neighbors(c).filter(v=>cellSet.has(key(v))).length,0)/2;
  const outerEdges=6*g.cells.length-2*sharedPairs;
  const dimensions=g.faces.map(f=>({width:Math.max(...f.points.map(p=>p.x))-Math.min(...f.points.map(p=>p.x)),height:Math.max(...f.points.map(p=>p.y))-Math.min(...f.points.map(p=>p.y))}));
  const base=dimensions[0],maxWidthError=Math.max(...dimensions.map(d=>Math.abs(d.width/base.width-1))),maxHeightError=Math.max(...dimensions.map(d=>Math.abs(d.height/base.height-1)));
  const centerDistances=[];
  for(const c of g.cells)for(const n of neighbors(c))if(cellSet.has(key(n))&&key(c)<key(n)){
   const a=world(c,opts.size||1),b=world(n,opts.size||1);
   centerDistances.push(Math.hypot(a.x-b.x,a.y-b.y));
  }
  const target=Math.sqrt(3)*(opts.size||1),maxSpacingError=Math.max(0,...centerDistances.map(d=>Math.abs(d/target-1)));
  return {valid:g.check.valid&&maxWidthError<=.01+precision&&maxHeightError<=.01+precision&&maxSpacingError<=.01+precision,count:g.cells.length,sharedPairs,outerEdges,maxWidthError,maxHeightError,maxSpacingError,projectedHexWidth:base.width,projectedHexHeight:base.height,transparentExport:true};
 }
 function manifest(rows,opts={}){
  const g=geometry(rows,opts),qa=audit(rows,opts);
  if(!qa.valid)throw new Error('Geometry QA failed: asset export blocked');
  const camera={...g.camera};
  return {schema:'arcane-hexagonia-v1',status:'geometry-prototype',formation:rows.join('-'),hex_count:qa.count,
   camera:{projection:'orthographic',elevation_degrees:camera.elevationDegrees,azimuth_degrees:camera.azimuthDegrees,scale:camera.scale,calibrated:false},
   axial_centers:g.cells.map(c=>({q:c.q,r:c.r})),projected_centers:g.faces.map(f=>({x:f.center.x,y:f.center.y})),
   qa:{valid:qa.valid,shared_edges:qa.sharedPairs,outer_edges:qa.outerEdges,max_width_error:qa.maxWidthError,max_height_error:qa.maxHeightError,max_spacing_error:qa.maxSpacingError},
   alpha:{format:'SVG',background:'none',raster_rgba_verified:false},
   release_ready:false};
 }

 function svg(rows,opts={}){
  const g=geometry(rows,opts),size=opts.size||1,camera=g.camera,padding=opts.padding??0.5;
  const elevation=(camera.elevationDegrees??55)*Math.PI/180;
  const height=size*(camera.wallHeight??0.2);
  const cellSet=new Set(g.cells.map(key));
  const allEdges=new Map(),shared=[],outer=[];
  const vertexKey=p=>p.x.toFixed(8)+','+p.y.toFixed(8);
  const edgesFor=(c)=>{const pts=corners(c,size);return pts.map((a,i)=>({a,b:pts[(i+1)%6]}))};
  for(const c of g.cells)for(const e of edgesFor(c)){
   const k=[vertexKey(e.a),vertexKey(e.b)].sort().join('|');
   if(allEdges.has(k))allEdges.get(k).count++;
   else allEdges.set(k,{...e,count:1});
  }
  for(const e of allEdges.values())(e.count===1?outer:shared).push(e);
  const faces=g.faces.map(f=>f.points);
  const projectedOuter=outer.map(e=>({a:project(e.a,camera),b:project(e.b,camera),world:e}));
  const walls=projectedOuter.filter(e=>{
   const dx=e.world.b.x-e.world.a.x,dy=e.world.b.y-e.world.a.y;
   // Only outward-facing edges with normals pointing toward the viewer.
   const mid={x:(e.world.a.x+e.world.b.x)/2,y:(e.world.a.y+e.world.b.y)/2};
   const centroid=g.cells.reduce((a,c)=>{const w=world(c,size);return {x:a.x+w.x/g.cells.length,y:a.y+w.y/g.cells.length}},{x:0,y:0});
   const nx=mid.x-centroid.x,ny=mid.y-centroid.y;
   return ny>1e-8 && Math.abs(dx*ny-dy*nx)>1e-8;
  }).map(e=>{
   const d={x:0,y:height*Math.cos(elevation)*(camera.scale??1)};
   return [e.a,e.b,{x:e.b.x+d.x,y:e.b.y+d.y},{x:e.a.x+d.x,y:e.a.y+d.y}];
  });
  const all=[...faces.flat(),...walls.flat()];
  const bounds=all.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
  const w=bounds.maxX-bounds.minX+2*padding,h=bounds.maxY-bounds.minY+2*padding;
  const xy=p=>[(p.x-bounds.minX+padding).toFixed(5),(p.y-bounds.minY+padding).toFixed(5)].join(',');
  const line=e=>'<path d="M '+xy(e.a).replace(',',' ')+' L '+xy(e.b).replace(',',' ')+'" />';
  const faceArt=g.faces.map(f=>{
   const c=f.center,pts=f.points.map(p=>({x:c.x+(p.x-c.x)*.89,y:c.y+(p.y-c.y)*.89}));
   const rose=Array.from({length:8},(_,i)=>{
    const a=i*Math.PI/4,r=size*.36;
    const tip={x:c.x+Math.sin(a)*r*(camera.scale??1),y:c.y-Math.cos(a)*r*Math.sin(elevation)*(camera.scale??1)};
    const l={x:c.x+Math.sin(a-.22)*r*.22,y:c.y-Math.cos(a-.22)*r*.22*Math.sin(elevation)};
    const rt={x:c.x+Math.sin(a+.22)*r*.22,y:c.y-Math.cos(a+.22)*r*.22*Math.sin(elevation)};
    return '<polygon points="'+[l,tip,rt].map(xy).join(' ')+'" fill="'+(i%2?'#c59a4b':'#8c622e')+'" stroke="#5c3b1b" stroke-width=".012"/>';
   }).join('');
   return '<g><polygon points="'+pts.map(xy).join(' ')+'" fill="#f4ead5" stroke="none"/><ellipse cx="'+(c.x-bounds.minX+padding).toFixed(5)+'" cy="'+(c.y-bounds.minY+padding).toFixed(5)+'" rx="'+(.40*size*(camera.scale??1)).toFixed(5)+'" ry="'+(.40*size*Math.sin(elevation)*(camera.scale??1)).toFixed(5)+'" fill="none" stroke="#b28a49" stroke-width=".024"/>'+rose+'<circle cx="'+(c.x-bounds.minX+padding).toFixed(5)+'" cy="'+(c.y-bounds.minY+padding).toFixed(5)+'" r=".067" fill="#d7ad61" stroke="#6e471f" stroke-width=".018"/></g>';
  }).join('');
  const wallArt=walls.map(p=>'<polygon points="'+p.map(xy).join(' ')+'" fill="#866039" stroke="#543c23" stroke-width=".025"/>').join('');
  const outerArt=projectedOuter.map(e=>'<path d="M '+xy(e.a).replace(',',' ')+' L '+xy(e.b).replace(',',' ')+'" fill="none" stroke="#6a451f" stroke-width=".15" stroke-linecap="round"/><path d="M '+xy(e.a).replace(',',' ')+' L '+xy(e.b).replace(',',' ')+'" fill="none" stroke="#c59a58" stroke-width=".092" stroke-linecap="round"/>').join('');
  const seamArt=shared.map(e=>({a:project(e.a,camera),b:project(e.b,camera)})).map(e=>'<path d="M '+xy(e.a).replace(',',' ')+' L '+xy(e.b).replace(',',' ')+'" stroke="#805c36" stroke-width=".028" fill="none"/>').join('');
  const front=projectedOuter.filter(e=>e.world.a.y+e.world.b.y>0);
  const markers=front.filter((e,i)=>i===0||i===Math.floor(front.length/2)||i===front.length-1).map(e=>{
   const p={x:(e.a.x+e.b.x)/2,y:(e.a.y+e.b.y)/2};
   return '<circle cx="'+(p.x-bounds.minX+padding).toFixed(5)+'" cy="'+(p.y-bounds.minY+padding).toFixed(5)+'" r=".075" fill="#b98a45" stroke="#5b3c1e" stroke-width=".025"/>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w.toFixed(4)+' '+h.toFixed(4)+'" role="img" aria-label="'+rows.join('-')+' integrated hex formation">'+wallArt+faceArt+seamArt+outerArt+markers+'</svg>';
 }

 root.aleaArcaneGeometryEngine=Object.freeze({DEFAULT_CAMERA,PATTERNS,fromRows,buildRows,autoAlign,rotate,reflect,transform,neighbors,validate,world,project,corners,geometry,audit,manifest,svg});
})(globalThis);
