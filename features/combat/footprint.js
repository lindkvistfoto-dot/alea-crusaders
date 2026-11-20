/* Alea Crusaders · shared hex-footprint geometry, loaded before scene editor and combat runtime. */
const COMBAT_FOOTPRINT_OFFSETS={
 single:[[0,0]],
 line2:[[0,0],[1,0]],
 triangle3:[[0,0],[1,0],[0,1]],
 line3:[[0,0],[1,0],[2,0]],
 giant7:[[0,0],[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]]
};
const COMBAT_FOOTPRINT_LABELS={single:'1 hex',line2:'2 hex · avlång',triangle3:'3 hex · triangel',line3:'3 hex · avlång',giant7:'7 hex · stor'};
function combatFootprintDefaultShape(name){
 const text=String(name||'').toLocaleLowerCase('sv-SE');
 if(/rese|jätterese/.test(text))return 'triangle3';
 if(/krokodil/.test(text))return 'line3';
 if(/häst|horse|åsna|donkey|lejon|tiger/.test(text))return 'line2';
 return 'single';
}
function combatFootprintShape(actor){
 const stored=actor?.state?.footprint?.shape??actor?.footprint?.shape;
 return Object.hasOwn(COMBAT_FOOTPRINT_OFFSETS,stored)?stored:combatFootprintDefaultShape(actor?.name_snapshot||actor?.name);
}
function combatFootprintFacing(actor){
 const n=Number(actor?.state?.footprint?.facing??actor?.footprint?.facing??0);
 return Number.isInteger(n)?((n%6)+6)%6:0;
}
function combatFootprintCells(actor,q=actor?.q,r=actor?.r,facing=combatFootprintFacing(actor)){
 const aq=Number(q),ar=Number(r);
 if(!Number.isInteger(aq)||!Number.isInteger(ar))return [];
 const turns=((Number(facing)%6)+6)%6;
 return COMBAT_FOOTPRINT_OFFSETS[combatFootprintShape(actor)].map(([dx,dy])=>{
  for(let i=0;i<turns;i++){const next=-dy;dy=dx+dy;dx=next}
  return {q:aq+dx,r:ar+dy}
 });
}
function combatFootprintKey(c){return c.q+','+c.r}
function combatFootprintDistance(a,b){
 const A=combatFootprintCells(a),B=combatFootprintCells(b);
 if(!A.length||!B.length)return Infinity;
 let best=Infinity;
 for(const x of A)for(const y of B){
  const dq=x.q-y.q,dr=x.r-y.r;
  best=Math.min(best,(Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2)
 }
 return best;
}
function combatFootprintOverlaps(a,b){
 const set=new Set(combatFootprintCells(a).map(combatFootprintKey));
 return combatFootprintCells(b).some(c=>set.has(combatFootprintKey(c)));
}
function combatFootprintIntersectsRadius(actor,center,radius){
 const q=Number(center?.q),r=Number(center?.r);
 return combatFootprintCells(actor).some(c=>(Math.abs(c.q-q)+Math.abs(c.r-r)+Math.abs(c.q-q+c.r-r))/2<=radius);
}

// The classic scene editor and combat runtime share HEXAGONIA's point-up axial basis.
// A calibrated hex is measured between adjacent centres, equally on all six axes.
function combatMapHexGeometry(meta,settings={}){
 const width=Math.max(1,Number(meta?.width)||1600),height=Math.max(1,Number(meta?.height)||1000);
 const offsetX=Number(settings.offset_x)||0,offsetY=Number(settings.offset_y)||0;
 if(settings.academy_map===true){
  const pixelsPerMeter=Number(settings.pixels_per_meter);
  if(!Number.isFinite(pixelsPerMeter)||pixelsPerMeter<=0)return null;
  const xPitch=pixelsPerMeter*(Number(settings.hex_m)||1.5);
  if(!Number.isFinite(xPitch)||xPitch<=0)return null;
  const size=xPitch/Math.sqrt(3),rowPitch=xPitch*Math.sqrt(3)/2;
  return {width,height,size,xPitch,rowPitch,offsetX,offsetY,pixelsPerMeter,rows:height/rowPitch}
 }
 const rows=Math.max(2,Number(settings.rows)||Math.round((Number(settings.map_height_m)||45)/(Number(settings.hex_m)||1.5))||30);
 const scale=Math.max(.5,Math.min(1.5,Number(settings.hex_scale)||1));
 const rowPitch=height/rows*scale,size=rowPitch/1.5;
 return {width,height,rows,size,xPitch:Math.sqrt(3)*size,rowPitch,offsetX,offsetY}
}
function combatMapHexCenter(g,q,r){
 return [g.offsetX+g.xPitch*(q+r/2),g.offsetY+g.rowPitch*r]
}
function combatCubeRound(x,y,z){
 let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);
 const dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);
 if(dx>dy&&dx>dz)rx=-ry-rz;
 else if(dy>dz)ry=-rx-rz;
 else rz=-rx-ry;
 return{q:rx,r:rz}
}
function combatMapPixelToHex(g,[x,y]){
 const r=(y-g.offsetY)/g.rowPitch,q=(x-g.offsetX)/g.xPitch-r/2;
 return combatCubeRound(q,-q-r,r)
}
function* combatMapGridCells(g){
 // Legacy scenes display partial hexes outside the image. Calibrated boards
 // accept a hex only if its centre belongs to the intrinsic image.
 const border=g.pixelsPerMeter?0:g.size;
 const rMin=Math.ceil((-border-g.offsetY)/g.rowPitch),rMax=Math.floor((g.height+border-g.offsetY)/g.rowPitch);
 for(let r=rMin;r<=rMax;r++){
  const qMin=Math.ceil((-border-g.offsetX)/g.xPitch-r/2),qMax=Math.floor((g.width+border-g.offsetX)/g.xPitch-r/2);
  for(let q=qMin;q<=qMax;q++){
   const [x,y]=combatMapHexCenter(g,q,r);
   if(g.pixelsPerMeter&&(x>=g.width||y>=g.height))continue;
   yield {q,r,x,y,key:q+','+r}
  }
 }
}
// Neighbour-bit order is also used by private.academy_edge_bit in PostgreSQL.
const COMBAT_MAP_DIRECTIONS=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
function combatMapEdgeBlocked(terrain,a,b,ignoreGround=false){
 const barrier=terrain.get(combatFootprintKey(a))?.academy_barriers;
 const edges=ignoreGround?barrier?.wall:barrier?.move;
 if(!edges)return false;
 const direction=COMBAT_MAP_DIRECTIONS.findIndex(([dq,dr])=>b.q-a.q===dq&&b.r-a.r===dr);
 return direction>=0&&(edges&(1<<direction))!==0
}
async function combatProjectMapHexes(input){
 const {projectMapHexes}=await import('./map-hex-projection.js');
 const g=combatMapHexGeometry(input.map,input.settings);
 if(!g?.pixelsPerMeter)throw new Error('Kartans måttskala saknas.');
 return projectMapHexes(input,g,combatMapGridCells(g),COMBAT_MAP_DIRECTIONS)
}

// The isolated adventure host imports this classic script as a side-effect module.
// Keep a single calibrated basis for both adventure anchors and the battle engine.
globalThis.aleaMapGrid = Object.freeze({
 geometry: combatMapHexGeometry, center: combatMapHexCenter, pixelToHex: combatMapPixelToHex,
 cells: combatMapGridCells, distance: combatFootprintDistance, footprint: combatFootprintCells
});
