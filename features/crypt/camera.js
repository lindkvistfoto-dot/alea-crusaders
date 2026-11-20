// Only the visible projection can frame a camera; possessing a GM preparation map is irrelevant.
const roomBounds = new WeakMap();

function roomFrame(proj, hero) {
  if (!hero || !proj.floor?.length) return null;
  const portal = proj.door;
  // The pilot has two rooms. Projected floor strips can span the doorway, so cut the strip
  // at the jamb plane before fitting a room. Memory contributes only the area already observed.
  const signed = portal ? (x,y) => (x-portal.x)*(portal.endY-portal.y) - (y-portal.y)*(portal.endX-portal.x) : () => 0;
  const side = Math.sign(signed(hero.x,hero.y)) || 1;
  let cache=roomBounds.get(proj);
  if(!cache) { cache=new Map();roomBounds.set(proj,cache); }
  if(cache.has(side)) return cache.get(side);
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const include=(x,y)=>{left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);};
  for(const r of proj.floor){
    const corners=[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];
    corners.forEach(([x,y], i) => {
      const d=signed(x,y)*side;
      if(d>=0)include(x,y);
      const [xx,yy]=corners[(i+1)%4],next=signed(xx,yy)*side;
      if(d*next<0){const t=d/(d-next);include(x+t*(xx-x),y+t*(yy-y));}
    });
  }
  const frame=Number.isFinite(left)?{cx:(left+right)/2,cy:(top+bottom)/2,
    spanX:Math.max(6*proj.pixelsPerMeter,right-left+proj.pixelsPerMeter),
    spanY:Math.max(5*proj.pixelsPerMeter,bottom-top+proj.pixelsPerMeter)}:null;
  cache.set(side,frame);return frame;
}

function combatFrame(proj) {
  const roster=proj.battle ? new Set(proj.battle.combatants.filter(c=>c.hp>0).map(c=>c.id)) : null;
  const known=proj.actors.filter(a=>roster?roster.has(a.id):a.hp!==0);
  if(!known.length)return null;
  const xs=known.map(a=>a.x),ys=known.map(a=>a.y),m=proj.pixelsPerMeter;
  const left=Math.min(...xs)-1.5*m,right=Math.max(...xs)+1.5*m;
  const top=Math.min(...ys)-2.5*m,bottom=Math.max(...ys)+1.5*m;
  return {cx:(left+right)/2,cy:(top+bottom)/2,
    spanX:Math.max(7.5*m,right-left),spanY:Math.max(5*m,bottom-top)};
}

export function cameraFor(proj,options,width,height) {
  const heroes=proj.actors.filter(a=>a.kind==='hero'), chosen=heroes.find(a=>a.id===options.selectedHero);
  let cx=proj.width/2,cy=proj.height/2, spanX=proj.width,spanY=proj.height;
  if(options.camera==='person' && chosen){
    cx=chosen.x;cy=chosen.y-proj.pixelsPerMeter*.55;
    spanX=proj.pixelsPerMeter*6;spanY=proj.pixelsPerMeter*5;
  }else if(options.camera==='party' && heroes.length){
    const xs=heroes.map(a=>a.x),ys=heroes.map(a=>a.y);
    cx=(Math.min(...xs)+Math.max(...xs))/2;cy=(Math.min(...ys)+Math.max(...ys))/2-15;
    spanX=Math.max(350,Math.max(...xs)-Math.min(...xs)+180);
    spanY=Math.max(230,Math.max(...ys)-Math.min(...ys)+180);
  }
  const bounded=options.camera==='room' ? roomFrame(proj,chosen??heroes[0]) :
    options.camera==='combat' ? combatFrame(proj) : null;
  if(bounded)({cx,cy,spanX,spanY}=bounded);
  const scale=Math.min(width/spanX,height/spanY);
  return {scale,x:width/2-cx*scale,y:height/2-cy*scale};
}

export function usePortrait(kind, imageHeightPixels, wasPortrait = false) {
  return kind === 'hero' && (imageHeightPixels < 30 || (imageHeightPixels <= 39 && wasPortrait));
}

export function screenToMap(camera, x, y) {
  return [(x - camera.x) / camera.scale, (y - camera.y) / camera.scale];
}
