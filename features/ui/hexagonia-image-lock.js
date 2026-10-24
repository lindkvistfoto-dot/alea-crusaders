/* HEXAGONIA IMAGE LOCK V1: deterministic geometry anchors and image QA gates. */
(function(root){
 'use strict';
 const engine=root.aleaArcaneGeometryEngine;
 if(!engine)throw new Error('HEXAGONIA geometry engine must load first');
 const key=p=>p.x.toFixed(6)+','+p.y.toFixed(6);
 function anchors(rows,options={}){
  const g=engine.geometry(rows,options),qa=engine.audit(rows,options);
  if(!qa.valid)throw new Error('HEXAGONIA: invalid geometry');
  const corners=g.faces.map(f=>f.points.map(p=>({x:p.x,y:p.y})));
  const edges=new Map();
  corners.forEach((poly,tile)=>poly.forEach((a,i)=>{
   const b=poly[(i+1)%6],id=[key(a),key(b)].sort().join('|');
   const entry=edges.get(id)||{a,b,tiles:[]};entry.tiles.push(tile);edges.set(id,entry);
  }));
  const shared=[...edges.values()].filter(e=>e.tiles.length===2);
  const outer=[...edges.values()].filter(e=>e.tiles.length===1);
  if(shared.length!==qa.sharedPairs||outer.length!==qa.outerEdges||[...edges.values()].some(e=>e.tiles.length>2))throw new Error('HEXAGONIA: edge topology mismatch');
  return {schema:'hexagonia-image-lock-v1',rows:rows.slice(),camera:{...g.camera,projection:'orthographic'},tiles:g.faces.map((f,i)=>({axial:{...f.cell},center:{...f.center},corners:corners[i]})),sharedEdges:shared,outerEdges:outer,qa};
 }
 function validatePoints(reference,observed,{tolerance=0.01}={}){
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>0.05)throw new Error('Invalid tolerance');
  if(!Array.isArray(observed)||observed.length!==reference.tiles.length)return {valid:false,reason:'tile-count'};
  const ref=reference.tiles.flatMap(t=>t.corners),actual=observed.flatMap(t=>t.corners||[]);
  if(actual.length!==ref.length)return {valid:false,reason:'corner-count'};
  const extent=Math.max(...ref.map(p=>p.x))-Math.min(...ref.map(p=>p.x));
  if(!(extent>0))return {valid:false,reason:'reference-extent'};
  let maxDeviation=0;
  for(let i=0;i<ref.length;i++){
   const p=actual[i],q=ref[i];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return {valid:false,reason:'invalid-coordinate'};
   maxDeviation=Math.max(maxDeviation,Math.hypot(p.x-q.x,p.y-q.y)/extent);
  }
  return {valid:maxDeviation<=tolerance,maxDeviation,tolerance,reason:maxDeviation<=tolerance?'ok':'geometry-drift'};
 }
 function releaseGate({reference,observed,alphaVerified=false,visualApproved=false}={}){
  if(!reference||!observed)return {approved:false,reason:'missing-reference-or-measurement'};
  const geometry=validatePoints(reference,observed);
  return {approved:geometry.valid&&alphaVerified===true&&visualApproved===true,geometry,alphaVerified:alphaVerified===true,visualApproved:visualApproved===true};
 }
 root.aleaHexagoniaImageLock=Object.freeze({anchors,validatePoints,releaseGate});
})(globalThis);
