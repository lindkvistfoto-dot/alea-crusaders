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
  const g=geometry(rows,opts),size=opts.size||1,padding=opts.padding??.42;
  const elevation=(g.camera.elevationDegrees??55)*Math.PI/180;
  const verticalScale=Math.sin(elevation),wallDrop=(g.camera.wallHeight??.2)*Math.cos(elevation)*(g.camera.scale??1);
  const ptKey=p=>Number(p.x.toFixed(5))+','+Number(p.y.toFixed(5)),edgeMap=new Map(),vertexMap=new Map();
  for(let fi=0;fi<g.faces.length;fi++){
   const face=g.faces[fi];
   for(let i=0;i<6;i++){
    const a=face.points[i],b=face.points[(i+1)%6],key=[ptKey(a),ptKey(b)].sort().join('|');
    if(edgeMap.has(key)){const edge=edgeMap.get(key);edge.count++;edge.faces.push(fi)}
    else edgeMap.set(key,{a,b,count:1,faces:[fi]});
    if(!vertexMap.has(ptKey(a)))vertexMap.set(ptKey(a),{point:a,faces:[fi]});
    else vertexMap.get(ptKey(a)).faces.push(fi);
   }
  }
  const edges=[...edgeMap.values()],outerEdges=edges.filter(e=>e.count===1),innerEdges=edges.filter(e=>e.count===2);
  const all=[...g.faces.flatMap(f=>f.points),...outerEdges.flatMap(e=>[e.a,{x:e.a.x,y:e.a.y+wallDrop},{x:e.b.x,y:e.b.y+wallDrop},e.b])];
  const bounds=all.reduce((a,p)=>({minX:Math.min(a.minX,p.x),maxX:Math.max(a.maxX,p.x),minY:Math.min(a.minY,p.y),maxY:Math.max(a.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  const w=bounds.maxX-bounds.minX+padding*2,h=bounds.maxY-bounds.minY+padding*2;
  const tr=p=>({x:p.x-bounds.minX+padding,y:p.y-bounds.minY+padding});
  const fmt=n=>Number(n).toFixed(4),pts=arr=>arr.map(p=>fmt(p.x)+','+fmt(p.y)).join(' ');
  const path=arr=>arr.map((p,i)=>(i?'L':'M')+fmt(p.x)+' '+fmt(p.y)).join(' ')+' Z';
  const prefix=('hex-'+rows.join('-')+'-'+(opts.steps||0)+(opts.mirror?'-m':'')).replace(/[^a-z0-9_-]/gi,'-');
  const id=s=>prefix+'-'+s;
  const projectPoly=(face,dists)=>{
   const p=face.points.map(tr),n=p.length,area=p.reduce((sum,a,i)=>sum+a.x*p[(i+1)%n].y-p[(i+1)%n].x*a.y,0);
   const orientation=area>=0?1:-1,lines=[];
   for(let i=0;i<n;i++){
    const a=p[i],b=p[(i+1)%n],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
    const nx=orientation*(-dy/len),ny=orientation*(dx/len),d=dists[i]*(g.camera.scale??1);
    lines.push({x:a.x+nx*d,y:a.y+ny*d,dx,dy});
   }
   return p.map((original,i)=>{
    const prev=lines[(i+n-1)%n],next=lines[i],det=prev.dx*next.dy-prev.dy*next.dx;
    if(Math.abs(det)<1e-8)return original;
    const t=((next.x-prev.x)*next.dy-(next.y-prev.y)*next.dx)/det;
    return {x:prev.x+t*prev.dx,y:prev.y+t*prev.dy};
   });
  };
  const gradients='<defs>'+
   '<linearGradient id="'+id('bronze')+'" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#f6d58a"/><stop offset=".12" stop-color="#8d511d"/><stop offset=".28" stop-color="#e6ad4a"/><stop offset=".48" stop-color="#48290f"/><stop offset=".68" stop-color="#bb7828"/><stop offset=".88" stop-color="#47270f"/><stop offset="1" stop-color="#d89b3a"/></linearGradient>'+
   '<linearGradient id="'+id('gold')+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff0b6"/><stop offset=".24" stop-color="#f2cc6e"/><stop offset=".55" stop-color="#a66a21"/><stop offset=".76" stop-color="#ffe198"/><stop offset="1" stop-color="#684012"/></linearGradient>'+
   '<linearGradient id="'+id('wall')+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d9973b"/><stop offset=".14" stop-color="#5a310f"/><stop offset=".48" stop-color="#261609"/><stop offset=".78" stop-color="#75451b"/><stop offset="1" stop-color="#1c1008"/></linearGradient>'+
   '<linearGradient id="'+id('ivory')+'" x1=".12" y1="0" x2=".82" y2="1"><stop stop-color="#fffaf0"/><stop offset=".38" stop-color="#efe3c9"/><stop offset=".72" stop-color="#fbf1dd"/><stop offset="1" stop-color="#ddc9a5"/></linearGradient>'+
   '<linearGradient id="'+id('gem')+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff1b4"/><stop offset=".35" stop-color="#f2c65b"/><stop offset=".52" stop-color="#3e2716"/><stop offset=".72" stop-color="#c78228"/><stop offset="1" stop-color="#fff0b3"/></linearGradient>'+
   '<radialGradient id="'+id('medal')+'" cx=".35" cy=".24" r=".82"><stop stop-color="#ffe89c"/><stop offset=".28" stop-color="#bd7c2b"/><stop offset=".55" stop-color="#54300f"/><stop offset=".78" stop-color="#d39436"/><stop offset="1" stop-color="#301a0a"/></radialGradient>'+
   '<filter id="'+id('shadow')+'" x="-.25" y="-.25" width="1.5" height="1.65" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation=".055" result="blur"/><feOffset dy=".075" result="offset"/><feComponentTransfer in="offset"><feFuncA type="linear" slope=".58"/></feComponentTransfer><feMerge><feMergeNode in="offset"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'+
   '<filter id="'+id('stoneNoise')+'" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".44" numOctaves="2" seed="18" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="mono"/><feComponentTransfer in="mono" result="grain"><feFuncA type="table" tableValues="0 .16"/></feComponentTransfer><feBlend in="SourceGraphic" in2="grain" mode="multiply"/></filter>'+
   '<clipPath id="'+id('marbleClip')+'">'+g.faces.map((f,i)=>'<path d="'+path(projectPoly(f,Array(6).fill(.14*size)))+'"/>').join('')+'</clipPath>'+
   '</defs>';
  function braid(edge){
   const a=tr(edge.a),b=tr(edge.b),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   const face=g.faces[edge.faces[0]],center=tr(face.center),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
   let nx=-dy/len,ny=dx/len;
   if((center.x-mid.x)*nx+(center.y-mid.y)*ny<0){nx=-nx;ny=-ny}
   const inset=.072*size*(g.camera.scale??1),start={x:a.x+nx*inset,y:a.y+ny*inset},finish={x:b.x+nx*inset,y:b.y+ny*inset};
   const vx=finish.x-start.x,vy=finish.y-start.y,loopCount=Math.max(3,Math.floor(len/(.13*size)));
   let d1='M '+fmt(start.x)+' '+fmt(start.y),d2='M '+fmt(start.x+nx*.035)+' '+fmt(start.y+ny*.035);
   for(let j=0;j<loopCount;j++){
    const t0=j/loopCount,t1=(j+1)/loopCount,tm=(t0+t1)/2,amp=(j%2===0?1:-1)*.035*size;
    const c1={x:start.x+vx*tm+nx*amp,y:start.y+vy*tm+ny*amp},c2={x:start.x+vx*tm-nx*amp,y:start.y+vy*tm-ny*amp},end={x:start.x+vx*t1,y:start.y+vy*t1};
    d1+=' Q '+fmt(c1.x)+' '+fmt(c1.y)+' '+fmt(end.x)+' '+fmt(end.y);
    d2+=' Q '+fmt(c2.x+nx*.035)+' '+fmt(c2.y+ny*.035)+' '+fmt(end.x+nx*.035)+' '+fmt(end.y+ny*.035);
   }
   return '<g data-component="outer-braid"><path d="'+d1+'" fill="none" stroke="#45290f" stroke-width=".052" stroke-linecap="round"/><path d="'+d1+'" fill="none" stroke="url(#'+id('gold')+')" stroke-width=".022" stroke-linecap="round"/><path d="'+d2+'" fill="none" stroke="#f0c66b" stroke-width=".012" stroke-linecap="round"/></g>';
  }
  function compass(face,index){
   const c=tr(face.center),cx=c.x,cy=c.y,rx=.56*size*(g.camera.scale??1),ry=rx*verticalScale,parts=[];
   parts.push('<g data-component="relief-compass" data-hex="'+index+'"><ellipse cx="'+fmt(cx)+'" cy="'+fmt(cy)+'" rx="'+fmt(rx)+'" ry="'+fmt(ry)+'" fill="none" stroke="#3d2914" stroke-width=".035"/><ellipse cx="'+fmt(cx)+'" cy="'+fmt(cy)+'" rx="'+fmt(rx*.974)+'" ry="'+fmt(ry*.974)+'" fill="none" stroke="url(#'+id('gold')+')" stroke-width=".014"/>');
   for(let t=0;t<32;t++){
    const a=t*Math.PI/16,r1=rx*(t%4===0?.94:.965),r2=rx*.992;
    const p1={x:cx+Math.sin(a)*r1,y:cy-Math.cos(a)*r1*verticalScale},p2={x:cx+Math.sin(a)*r2,y:cy-Math.cos(a)*r2*verticalScale};
    parts.push('<path d="M '+fmt(p1.x)+' '+fmt(p1.y)+' L '+fmt(p2.x)+' '+fmt(p2.y)+'" stroke="'+(t%4===0?'#704717':'#c18b37')+'" stroke-width="'+(t%4===0?'.018':'.009')+'"/>');
   }
   for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,r=i%2===0?.53:.405,spread=i%2===0?.19:.23;
    const at=(rad,ang)=>({x:cx+Math.sin(ang)*rad*size*(g.camera.scale??1),y:cy-Math.cos(ang)*rad*size*verticalScale*(g.camera.scale??1)});
    const tip=at(r,angle),left=at(r*.38,angle-spread),right=at(r*.38,angle+spread),shoulderL=at(.15,angle-spread*1.3),shoulderR=at(.15,angle+spread*1.3),center={x:cx,y:cy};
    const ray='M '+fmt(center.x)+' '+fmt(center.y)+' L '+fmt(shoulderL.x)+' '+fmt(shoulderL.y)+' L '+fmt(left.x)+' '+fmt(left.y)+' L '+fmt(tip.x)+' '+fmt(tip.y)+' L '+fmt(right.x)+' '+fmt(right.y)+' L '+fmt(shoulderR.x)+' '+fmt(shoulderR.y)+' Z';
    parts.push('<path d="'+ray+'" fill="'+(i%2===0?'#392516':'#70471c')+'" stroke="url(#'+id('gold')+')" stroke-width=".018" stroke-linejoin="round"/>');
    const glintA=at(.22,angle),glintB=at(r*.84,angle);
    parts.push('<path d="M '+fmt(glintA.x)+' '+fmt(glintA.y)+' L '+fmt(glintB.x)+' '+fmt(glintB.y)+'" stroke="#f8d67e" stroke-opacity=".82" stroke-width=".011"/>');
   }
   for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=cx+Math.sin(a)*rx*.74,y=cy-Math.cos(a)*rx*.74*verticalScale,s=.035*size;
    parts.push('<path d="M '+fmt(x)+' '+fmt(y-s)+' L '+fmt(x+s)+' '+fmt(y)+' L '+fmt(x)+' '+fmt(y+s)+' L '+fmt(x-s)+' '+fmt(y)+' Z" fill="url(#'+id('gold')+')" stroke="#4b2c0f" stroke-width=".009"/>');
   }
   parts.push('<ellipse cx="'+fmt(cx)+'" cy="'+fmt(cy)+'" rx="'+fmt(rx*.145)+'" ry="'+fmt(ry*.145)+'" fill="#25180d" stroke="#f3cd72" stroke-width=".031"/><ellipse cx="'+fmt(cx)+'" cy="'+fmt(cy)+'" rx="'+fmt(rx*.103)+'" ry="'+fmt(ry*.103)+'" fill="url(#'+id('medal')+')" stroke="#ffe3a0" stroke-width=".014"/>');
   for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x1=cx+Math.sin(a)*rx*.025,y1=cy-Math.cos(a)*ry*.025,x2=cx+Math.sin(a)*rx*.083,y2=cy-Math.cos(a)*ry*.083;
    parts.push('<path d="M '+fmt(x1)+' '+fmt(y1)+' L '+fmt(x2)+' '+fmt(y2)+'" stroke="#4b2e13" stroke-width=".008"/>');
   }
   parts.push('<circle cx="'+fmt(cx)+'" cy="'+fmt(cy)+'" r="'+fmt(rx*.025)+'" fill="#fff0bc" stroke="#8e591e" stroke-width=".009"/></g>');
   return parts.join('');
  }
  function corner(point,index){
   const c=tr(point),rx=.145*size*(g.camera.scale??1),ry=rx*.7;
   const cap=[{x:c.x-rx,y:c.y},{x:c.x-rx*.54,y:c.y-ry},{x:c.x,y:c.y-ry*1.18},{x:c.x+rx*.54,y:c.y-ry},{x:c.x+rx,y:c.y},{x:c.x+rx*.54,y:c.y+ry},{x:c.x,y:c.y+ry*1.18},{x:c.x-rx*.54,y:c.y+ry}];
   const gem=[{x:c.x,y:c.y-ry*.52},{x:c.x+rx*.38,y:c.y},{x:c.x,y:c.y+ry*.52},{x:c.x-rx*.38,y:c.y}];
   return '<g data-component="corner-fitting" data-junction="'+index+'"><path d="'+path(cap)+'" fill="#241609" stroke="#f2cc72" stroke-width=".018"/><path d="'+path(cap.map(p=>({x:c.x+(p.x-c.x)*.78,y:c.y+(p.y-c.y)*.72})))+'" fill="url(#'+id('bronze')+')" stroke="#56330f" stroke-width=".015"/><path d="'+path(gem)+'" fill="url(#'+id('gem')+')" stroke="#fff1b3" stroke-width=".012"/><path d="M '+fmt(c.x)+' '+fmt(c.y-ry*.52)+' L '+fmt(c.x)+' '+fmt(c.y+ry*.52)+'" stroke="#5c3b19" stroke-width=".009"/></g>';
  }
  function lion(point,index){
   const c=tr(point),cx=c.x,cy=c.y+wallDrop*.53,rx=.19*size*(g.camera.scale??1),ry=.235*size*(g.camera.scale??1),mane=[];
   for(let i=0;i<16;i++){
    const a=i*Math.PI/8,x=cx+Math.cos(a)*rx*.72,y=cy+Math.sin(a)*ry*.72;
    mane.push('<ellipse cx="'+fmt(x)+'" cy="'+fmt(y)+'" rx="'+fmt(rx*.19)+'" ry="'+fmt(ry*.14)+'" transform="rotate('+i*22.5+' '+fmt(x)+' '+fmt(y)+')" fill="'+(i%2?'#bd7b2b':'#f1c76c')+'" stroke="#4a2b10" stroke-width=".009"/>');
   }
   const shield='M '+fmt(cx)+' '+fmt(cy-ry)+' Q '+fmt(cx+rx)+' '+fmt(cy-ry*.72)+' '+fmt(cx+rx*.78)+' '+fmt(cy+ry*.05)+' Q '+fmt(cx+rx*.48)+' '+fmt(cy+ry*.82)+' '+fmt(cx)+' '+fmt(cy+ry)+' Q '+fmt(cx-rx*.48)+' '+fmt(cy+ry*.82)+' '+fmt(cx-rx*.78)+' '+fmt(cy+ry*.05)+' Q '+fmt(cx-rx)+' '+fmt(cy-ry*.72)+' '+fmt(cx)+' '+fmt(cy-ry)+' Z';
   const face='M '+fmt(cx)+' '+fmt(cy-ry*.58)+' Q '+fmt(cx+rx*.58)+' '+fmt(cy-ry*.46)+' '+fmt(cx+rx*.42)+' '+fmt(cy+ry*.12)+' Q '+fmt(cx+rx*.3)+' '+fmt(cy+ry*.55)+' '+fmt(cx)+' '+fmt(cy+ry*.69)+' Q '+fmt(cx-rx*.3)+' '+fmt(cy+ry*.55)+' '+fmt(cx-rx*.42)+' '+fmt(cy+ry*.12)+' Q '+fmt(cx-rx*.58)+' '+fmt(cy-ry*.46)+' '+fmt(cx)+' '+fmt(cy-ry*.58)+' Z';
   return '<g data-component="lion-relief" data-front-corner="'+index+'"><path d="'+shield+'" fill="#211307" stroke="#f1c76a" stroke-width=".025"/>'+mane.join('')+'<path d="'+face+'" fill="url(#'+id('gem')+')" stroke="#4b2c10" stroke-width=".015"/><path d="M '+fmt(cx-rx*.28)+' '+fmt(cy-ry*.08)+' Q '+fmt(cx-rx*.12)+' '+fmt(cy-ry*.2)+' '+fmt(cx-rx*.04)+' '+fmt(cy-ry*.04)+' M '+fmt(cx+rx*.28)+' '+fmt(cy-ry*.08)+' Q '+fmt(cx+rx*.12)+' '+fmt(cy-ry*.2)+' '+fmt(cx+rx*.04)+' '+fmt(cy-ry*.04)+'" fill="none" stroke="#38200c" stroke-width=".018"/><ellipse cx="'+fmt(cx)+'" cy="'+fmt(cy+ry*.16)+'" rx="'+fmt(rx*.17)+'" ry="'+fmt(ry*.10)+'" fill="#4d2b10" stroke="#ffe19a" stroke-width=".012"/><path d="M '+fmt(cx)+' '+fmt(cy+ry*.22)+' L '+fmt(cx)+' '+fmt(cy+ry*.43)+' M '+fmt(cx)+' '+fmt(cy+ry*.43)+' Q '+fmt(cx-rx*.15)+' '+fmt(cy+ry*.52)+' '+fmt(cx-rx*.24)+' '+fmt(cy+ry*.42)+' M '+fmt(cx)+' '+fmt(cy+ry*.43)+' Q '+fmt(cx+rx*.15)+' '+fmt(cy+ry*.52)+' '+fmt(cx+rx*.24)+' '+fmt(cy+ry*.42)+'" fill="none" stroke="#41250d" stroke-width=".015"/></g>';
  }
  const walls=outerEdges.map((edge,i)=>{
   const a=tr(edge.a),b=tr(edge.b),poly=[a,b,{x:b.x,y:b.y+wallDrop},{x:a.x,y:a.y+wallDrop}];
   const decoration='<path d="M '+fmt(a.x)+' '+fmt(a.y+wallDrop*.25)+' L '+fmt(b.x)+' '+fmt(b.y+wallDrop*.25)+' M '+fmt(a.x)+' '+fmt(a.y+wallDrop*.76)+' L '+fmt(b.x)+' '+fmt(b.y+wallDrop*.76)+'" stroke="url(#'+id('gold')+')" stroke-width=".017" opacity=".9"/>';
   const studs=[.18,.5,.82].map(t=>{const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t+wallDrop*.51;return '<circle cx="'+fmt(x)+'" cy="'+fmt(y)+'" r=".022" fill="url(#'+id('gold')+')" stroke="#251509" stroke-width=".01"/>'}).join('');
   return '<g data-component="sidewall" data-edge="'+i+'"><path d="'+path(poly)+'" fill="url(#'+id('wall')+')" stroke="#301b0a" stroke-width=".035"/><path d="M '+fmt(a.x)+' '+fmt(a.y+wallDrop*.08)+' L '+fmt(b.x)+' '+fmt(b.y+wallDrop*.08)+'" stroke="#ffe39a" stroke-width=".025" opacity=".84"/>'+decoration+studs+'</g>';
  }).join('');
  const tiles=g.faces.map((face,fi)=>{
   const poly=face.points.map(tr),dists=poly.map((_,i)=>{
    const a=face.points[i],b=face.points[(i+1)%6],key=[ptKey(a),ptKey(b)].sort().join('|');
    return edgeMap.get(key).count===1?.145:.045;
   });
   const inner=projectPoly(face,dists),tileClip=id('tile-'+fi),base=path(poly),inset=path(inner);
   const seed=Math.abs((face.cell.q+17)*73+(face.cell.r+23)*151+fi*31),veins=[];
   for(let v=0;v<10;v++){
    const x1=poly[0].x+(poly[3].x-poly[0].x)*(((seed+v*37)%89)/100+.05),y1=poly[0].y+(poly[3].y-poly[0].y)*(((seed+v*19)%83)/100+.08);
    const x2=poly[1].x+(poly[4].x-poly[1].x)*(((seed+v*23)%87)/100+.06),y2=poly[1].y+(poly[4].y-poly[1].y)*(((seed+v*41)%79)/100+.1);
    const cx=(x1+x2)/2+(((v%3)-1)*.08),cy=(y1+y2)/2+(((v%4)-1.5)*.035);
    veins.push('<path d="M '+fmt(x1)+' '+fmt(y1)+' Q '+fmt(cx)+' '+fmt(cy)+' '+fmt(x2)+' '+fmt(y2)+'" fill="none" stroke="'+(v%3===0?'#b97a39':'#d3a45f')+'" stroke-opacity="'+(v%3===0?'.30':'.19')+'" stroke-width="'+(v%4===0?'.018':'.009')+'"/>');
   }
   const marble='<g data-component="ivory-marble" clip-path="url(#'+tileClip+')"><path d="'+inset+'" fill="url(#'+id('ivory')+')" filter="url(#'+id('stoneNoise')+')"/>'+veins.join('')+'<path d="'+inset+'" fill="none" stroke="#fff9e9" stroke-opacity=".8" stroke-width=".018"/></g>';
   const ring='<path fill-rule="evenodd" d="'+base+' '+inset+'" fill="url(#'+id('bronze')+')" stroke="#47280f" stroke-width=".018"/><path d="'+base+'" fill="none" stroke="url(#'+id('gold')+')" stroke-width=".018"/><path d="'+inset+'" fill="none" stroke="#5d3b18" stroke-width=".014"/>';
   return '<defs><clipPath id="'+tileClip+'"><path d="'+inset+'"/></clipPath></defs><g data-component="hex-tile" data-cell="'+face.cell.q+','+face.cell.r+'"><path d="'+base+'" fill="url(#'+id('bronze')+')" stroke="#40240f" stroke-width=".02"/>'+ring+marble+'</g>';
  }).join('');
  const seams=innerEdges.map((edge,i)=>{
   const a=tr(edge.a),b=tr(edge.b);
   return '<g data-component="single-internal-seam" data-seam="'+i+'"><path d="M '+fmt(a.x)+' '+fmt(a.y)+' L '+fmt(b.x)+' '+fmt(b.y)+'" stroke="#3f2913" stroke-width=".016"/><path d="M '+fmt(a.x)+' '+fmt(a.y)+' L '+fmt(b.x)+' '+fmt(b.y)+'" stroke="#d5a451" stroke-width=".008"/></g>';
  }).join('');
  const braids=outerEdges.map(braid).join(''),compasses=g.faces.map(compass).join('');
  const fittings=[...vertexMap.values()].map((v,i)=>corner(v.point,i)).join('');
  const maxY=Math.max(...[...vertexMap.values()].map(v=>v.point.y));
  const front=[...vertexMap.values()].filter(v=>maxY-v.point.y<.035);
  const lions=front.map((v,i)=>lion(v.point,i)).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+fmt(w)+' '+fmt(h)+'" role="img" aria-label="'+rows.join('-')+' hex formation" data-hex-count="'+g.faces.length+'" data-outer-edge-count="'+outerEdges.length+'" data-internal-seam-count="'+innerEdges.length+'" data-components="marble,compass,bronze,sidewall,binding,lion" style="overflow:visible">'+gradients+'<g filter="url(#'+id('shadow')+')">'+walls+tiles+seams+braids+compasses+fittings+lions+'</g></svg>';
 }

 root.aleaArcaneGeometryEngine=Object.freeze({DEFAULT_CAMERA,PATTERNS,fromRows,buildRows,autoAlign,rotate,reflect,transform,neighbors,validate,world,project,corners,geometry,audit,manifest,svg});
})(globalThis);