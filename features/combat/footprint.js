/* Alea Crusaders · combat footprints use the shared axial formation catalog. */
const COMBAT_FOOTPRINT_LIBRARY_MAP={
 single:{id:'single-standard',anchor:'first'},
 line2:{id:'double-line',anchor:'first'},
 triangle3:{id:'triple-compact',anchor:'first',steps:5},
 line3:{id:'triple-line',anchor:'first'},
 giant7:{id:'seven-standard',anchor:{q:0,r:1}}
};
function combatFootprintLibraryOffsets(definition){
 const library=globalThis.aleaHexFormationLibrary,engine=globalThis.aleaArcaneGeometryEngine;
 if(!library||!engine)throw new Error('Shared hex formation library must load before combat footprints');
 const formation=library.get(definition.id);if(!formation)throw new Error('Unknown combat formation '+definition.id);
 const anchor=definition.anchor==='first'?formation.cells[0]:definition.anchor;
 return formation.cells.map(cell=>{
  const local={q:cell.q-anchor.q,r:cell.r-anchor.r};
  const rotated=engine.rotate(definition.mirror?engine.reflect(local):local,definition.steps||0);
  return [Object.is(rotated.q,-0)?0:rotated.q,Object.is(rotated.r,-0)?0:rotated.r];
 });
}
const COMBAT_FOOTPRINT_OFFSETS=Object.fromEntries(Object.entries(COMBAT_FOOTPRINT_LIBRARY_MAP)
 .map(([shape,definition])=>[shape,combatFootprintLibraryOffsets(definition)]));
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
  return {q:aq+dx,r:ar+dy};
 });
}
function combatFootprintKey(c){return c.q+','+c.r}
function combatFootprintDistance(a,b){
 const A=combatFootprintCells(a),B=combatFootprintCells(b);
 if(!A.length||!B.length)return Infinity;
 let best=Infinity;
 for(const x of A)for(const y of B){const dq=x.q-y.q,dr=x.r-y.r;best=Math.min(best,(Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2)}
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
