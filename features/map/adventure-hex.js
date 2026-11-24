import { isBlocked, blockers, unobstructedDistance } from './kartakademin-geometry.js';
import { createMask, isFree } from './kartakademin-mask.js';

export function adventureGrid(map, config) {
  const ppm = Number(config?.pixelsPerMeter) || Number(map.pixels_per_meter);
  // Combat's point-up axial grid uses a 1.5 m row pitch and origin (0, 0).
  const pitch = ppm > 0 ? 1.5 * ppm : map.height / 30;
  const movement=(config?.geometry || []).filter(shape => shape.movement);
  return { pitch, size: pitch / 1.5, width: Math.sqrt(3) * pitch / 1.5,
    movement, edges:blockers(movement,'movement'),
    mask: config?.freeSight?.runs?.length ? createMask(map.width, map.height, config.freeSight) : null };
}

export function hexCenter(grid, q, r) {
  return [grid.width * (q + r / 2), grid.pitch * r];
}

export function nearestHex(grid, point) {
  if (!point || !grid) return null;
  const r = point[1] / grid.pitch, q = point[0] / grid.width - r / 2, s = -q-r;
  let col = Math.round(q), row = Math.round(r);
  const third = Math.round(s), dq = Math.abs(col-q), dr = Math.abs(row-r), ds = Math.abs(third-s);
  if (dq > dr && dq > ds) col = -row-third;
  else if (dr > ds) row = -col-third;
  return {q:col||0,r:row||0};
}

export function adventureCell(map,grid,point,rows,movingId){
  const cell=nearestHex(grid,point);
  if(!cell)return null;
  const {q:col,r:row}=cell;
  const center=hexCenter(grid,col,row);
  const [x,y] = center;
  if (x-grid.width/2 < 0 || x+grid.width/2 > map.width || y-grid.size < 0 || y+grid.size > map.height ||
      isBlocked(grid.movement, center, 'movement') || (grid.mask && !isFree(grid.mask, center)) ||
      rows.some(item => item.id !== movingId && item.q === col && item.r === row)) return null;
  return { q: col || 0, r: row || 0, x, y };
}


// A* expands only hexes that can still reach the destination within the movement allowance.
// Yield periodically so the pointer can supersede a long search on a large or partitioned map.
export function* adventureRoute(map,grid,start,end,occupied,obstacles,budget,neighbors,distance){
  const key=(q,r)=>q+','+r;
  const goal=key(end.q,end.r),origin=key(start.q,start.r);
  if(goal===origin)return [];
  const buckets=new Map(),best=new Map([[origin,0]]),parents=new Map();
  let minimum=distance(start,end),queued=0,expanded=0;
  function push(node,priority){
    if(!buckets.has(priority))buckets.set(priority,[]);
    buckets.get(priority).push(node);minimum=Math.min(minimum,priority);queued++;
  }
  const [x,y]=hexCenter(grid,start.q,start.r);
  push({...start,x,y,cost:0},minimum);
  while(queued){
    while(!buckets.get(minimum)?.length)minimum++;
    const cur=buckets.get(minimum).pop();queued--;
    const id=key(cur.q,cur.r);
    if(cur.cost!==best.get(id))continue;
    if(id===goal){
      const path=[];
      for(let step=cur;step.cost;step=parents.get(key(step.q,step.r)))path.push(step);
      return path.reverse();
    }
    if(++expanded%48===0)yield;
    for(const [q,r] of neighbors(cur.q,cur.r)){
      const id=key(q,r),cost=cur.cost+1,priority=cost+distance({q,r},end);
      if(priority>budget||cost>=(best.get(id)??Infinity)||occupied.has(id))continue;
      const point=hexCenter(grid,q,r);
      if(!adventureCell(map,grid,point,[],null))continue;
      const dx=point[0]-cur.x,dy=point[1]-cur.y,len=Math.hypot(dx,dy);
      if(unobstructedDistance([cur.x,cur.y],dx/len,dy/len,len,grid.edges,grid.mask)<len-1e-7||
         obstacles([cur.x,cur.y],point))continue;
      best.set(id,cost);parents.set(id,cur);push({q,r,x:point[0],y:point[1],cost},priority);
    }
  }
  return null;
}
