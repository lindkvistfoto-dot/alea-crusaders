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
