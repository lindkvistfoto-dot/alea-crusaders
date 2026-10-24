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
  const palette={ivory:'#f4ead5',marble:'#e8dcc1',bronze:'#99713c',gold:'#d7ad61',engraving:'#78552e',dark:'#543c23'};
  const wallArt=walls.map((p,i)=>'<polygon points="'+points(p)+'" fill="'+(i%2?'#806039':'#a47b43')+'" stroke="'+palette.dark+'" stroke-width="0.035"/>').join('');
  const faces=g.faces.map(f=>{
   const cx=f.center.x-bounds.minX+padding,cy=f.center.y-bounds.minY+padding;
   const poly=f.points.map(p=>({x:p.x-bounds.minX+padding,y:p.y-bounds.minY+padding}));
   const inner=poly.map(p=>({x:cx+(p.x-cx)*.81,y:cy+(p.y-cy)*.81}));
   const ring=poly.map(p=>({x:cx+(p.x-cx)*.91,y:cy+(p.y-cy)*.91}));
   const path=(pts)=>pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(4)+' '+p.y.toFixed(4)).join(' ')+' Z';
   const petals=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4,b=a+Math.PI/8,r=.35*(opts.size||1),r2=.12*(opts.size||1);return '<path d="M '+cx.toFixed(4)+' '+cy.toFixed(4)+' L '+(cx+Math.sin(a)*r).toFixed(4)+' '+(cy-Math.cos(a)*r*Math.sin((g.camera.elevationDegrees??55)*Math.PI/180)).toFixed(4)+' L '+(cx+Math.sin(b)*r2).toFixed(4)+' '+(cy-Math.cos(b)*r2).toFixed(4)+' Z" fill="'+(i%2?palette.gold:palette.engraving)+'"/>'}).join('');
   const rivets=poly.map(p=>'<circle cx="'+(cx+(p.x-cx)*.94).toFixed(4)+'" cy="'+(cy+(p.y-cy)*.94).toFixed(4)+'" r=".052" fill="'+palette.gold+'" stroke="'+palette.dark+'" stroke-width=".013"/>').join('');
   return '<g><path d="'+path(poly)+'" fill="'+palette.bronze+'" stroke="'+palette.dark+'" stroke-width=".055"/><path d="'+path(ring)+'" fill="'+palette.gold+'" stroke="'+palette.engraving+'" stroke-width=".024"/><path d="'+path(inner)+'" fill="'+palette.ivory+'" stroke="'+palette.bronze+'" stroke-width=".035"/><ellipse cx="'+cx.toFixed(4)+'" cy="'+cy.toFixed(4)+'" rx=".39" ry="'+(.39*Math.sin((g.camera.elevationDegrees??55)*Math.PI/180)).toFixed(4)+'" fill="none" stroke="'+palette.engraving+'" stroke-width=".027"/>'+petals+'<circle cx="'+cx.toFixed(4)+'" cy="'+cy.toFixed(4)+'" r=".067" fill="'+palette.gold+'" stroke="'+palette.dark+'" stroke-width=".018"/>'+rivets+'</g>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w.toFixed(4)+' '+h.toFixed(4)+'" role="img" aria-label="'+rows.join('-')+' hex formation">'+wallArt+faces+'</svg>';
 }

 root.aleaArcaneGeometryEngine=Object.freeze({DEFAULT_CAMERA,PATTERNS,fromRows,buildRows,autoAlign,rotate,reflect,transform,neighbors,validate,world,project,corners,geometry,audit,manifest,svg});
})(globalThis);
