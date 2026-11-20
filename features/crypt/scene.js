import '../combat/footprint.js';
import {heroPlacement} from './hero-class.js';
import { clearMapSegment, contains, segments, visibilityPolygon } from '../map/kartakademin-geometry.js';

export const DEFAULT_CRYPT_MAP = {
  width: 1000, height: 600, pixelsPerMeter: 32,
  rooms: [
    { id: 'west', x: 70, y: 90, width: 380, height: 420 },
    { id: 'east', x: 550, y: 110, width: 380, height: 380 }
  ],
  corridor: { x: 450, y: 250, width: 100, height: 100 },
  door: { x: 500, y: 250, endX: 500, endY: 350 },
  table: { id: 'table', x: 175, y: 320, width: 60, height: 29 }
};

const SAMPLE = 10;
const right = r => r.x + r.width;
const bottom = r => r.y + r.height;
const rectPoints = r => [[r.x,r.y], [right(r),r.y], [right(r),bottom(r)], [r.x,bottom(r)]];
const inRect = (r, [x,y], pad = 0) => x >= r.x-pad && x <= right(r)+pad && y >= r.y-pad && y <= bottom(r)+pad;
export const point = a => [a.x, a.y];
export const distance = (a,b) => Math.hypot(b[0]-a[0], b[1]-a[1]);

export function validateMap(map) {
  if (map?.artFirst) return map;
  const pair = map?.rooms;
  if (!Array.isArray(pair) || pair.length !== 2 || !map.corridor || !map.door || !map.table ||
      map.width !== 1000 || map.height !== 600 || !Number.isFinite(map.pixelsPerMeter) ||
      map.pixelsPerMeter < 8 || map.pixelsPerMeter > 80) throw Error('Kartans kalibrering är ogiltig.');
  const [west, east] = pair, gap = map.corridor, door = map.door, box = map.table;
  if (![west,east,gap,box].every(r => [r.x,r.y,r.width,r.height].every(Number.isFinite) &&
      r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && right(r) <= map.width && bottom(r) <= map.height) ||
      right(west) !== gap.x || right(gap) !== east.x || west.id !== 'west' || east.id !== 'east' ||
      gap.y <= Math.max(west.y,east.y) || bottom(gap) >= Math.min(bottom(west),bottom(east)) ||
      door.x <= gap.x || door.x >= right(gap) || door.endX !== door.x || door.y !== gap.y || door.endY !== bottom(gap) ||
      box.id !== 'table' || !rectPoints(box).every(p => inRect(west,p))) throw Error('Rummen, dörren och gången måste mötas i samma öppning.');
  return structuredClone(map);
}

function borders(map) {
  const [a,b] = map.rooms, g = map.corridor;
  // Walk around the connected outer shell. There are no internal walls at the
  // edges of the connector. Different side heights are retained at the jambs.
  return segments([
    [a.x,a.y], [right(a),a.y], [right(a),g.y], [b.x,g.y], [b.x,b.y], [right(b),b.y],
    [right(b),bottom(b)], [b.x,bottom(b)], [b.x,bottom(g)], [right(a),bottom(g)],
    [right(a),bottom(a)], [a.x,bottom(a)]
  ]);
}

function leaf(map, open) {
  if (map.artFirst) {
    const d=map.door;
    return open ? [[d.x,d.y],[d.x,d.y-1]] : [[d.x,d.y],[d.endX,d.endY]];
  }
  const d = map.door;
  return [[d.x,d.y], open ? [d.x + (d.endY-d.y), d.y] : [d.endX,d.endY]];
}

function sunPatch(map) {
  const room = map.rooms[0];
  const a = room.x + room.width * .16, b = a + room.width * .12;
  return [[a,room.y],[b,room.y],[b+room.width*.28,room.y+room.height*.30],[a+room.width*.22,room.y+room.height*.36]];
}

const geometryCache = new WeakMap();
export function geometry(map) {
  let result = geometryCache.get(map);
  if (result) return result;
  const shape = map.artFirst ? [] : [...map.rooms, map.corridor];
  const outer = map.artFirst ? segments(map.outline) : borders(map);
  const obstacles = map.obstacles ?? [];
  const onFloor = map.artFirst
    ? p => contains(map.outline,p) && !obstacles.some(o=>contains(o.points,p))
    : p => shape.some(r=>inRect(r,p));
  const solidEdges = obstacles.filter(o=>o.sight).flatMap(o=>segments(o.points));
  const tiles = [];
  const cols = Math.ceil(map.width/SAMPLE);
  for(let y=0;y<map.height;y+=SAMPLE) for(let x=0;x<map.width;x+=SAMPLE) {
    const center = [x+SAMPLE/2,y+SAMPLE/2];
    if(onFloor(center)) tiles.push({x,y,center,key:Math.floor(y/SAMPLE)*cols+Math.floor(x/SAMPLE)});
  }
  const grid = globalThis.aleaMapGrid.geometry(map,{academy_map:true,pixels_per_meter:map.pixelsPerMeter,hex_m:1.5});
  result = {outer,shape,tiles,cols,grid,onFloor,solidEdges,sun:map.sun ?? sunPatch(map),
    tableEdges:map.artFirst ? obstacles.flatMap(o=>segments(o.points)) : segments(rectPoints(map.table))};
  geometryCache.set(map,result);
  return result;
}

export const portal = map => [(map.door.x+map.door.endX)/2, (map.door.y+map.door.endY)/2];
export const side = (map,p) => (map.artFirst ? p[1] < map.door.y : p[0] < map.door.x) ? 'west' : 'east';
export function isFloor(map,p,radius=0) {
  if(!Array.isArray(p) || !p.every(Number.isFinite) || !geometry(map).onFloor(p)) return false;
  if(radius<=0) return true;
  return geometry(map).outer.every(([a,b])=>pointSegmentDistance(p,a,b)>=radius);
}
function pointSegmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],square=dx*dx+dy*dy;
  const t=square ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/square)) : 0;
  return distance(p,[a[0]+t*dx,a[1]+t*dy]);
}
export function doorSettlesClear(state,open) {
  const [a,b]=leaf(state.map,open),radius=.24*state.map.pixelsPerMeter;
  return state.actors.every(actor=>pointSegmentDistance(point(actor),a,b)>=radius);
}
export function movementClear(state,a,b,actorId) {
  const {map}=state, g=geometry(map), radius=.24*map.pixelsPerMeter;
  const edges=[...g.outer,leaf(map,state.doorOpen),...g.tableEdges];
  if(!isFloor(map,b,radius) || (!map.artFirst && inRect(map.table,b)) || !clearMapSegment(a,b,edges)) return false;
  // The swept body must clear a jamb even when the centre ray passes.
  if(edges.some(([u,v])=>Math.min(pointSegmentDistance(a,u,v),pointSegmentDistance(b,u,v),
    pointSegmentDistance(u,a,b),pointSegmentDistance(v,a,b)) < radius)) return false;
  return state.actors.filter(v=>v.id!==actorId && v.hp!==0).every(v=>pointSegmentDistance(point(v),a,b) >= radius*2);
}
export function route(state, actor, end) {
  const start=point(actor), p=portal(state.map), cross=side(state.map,start)!==side(state.map,end);
  // If the direct segment reaches the goal there is no intermediate step.
  if(movementClear(state,start,end,actor.id)) return [end];
  if(!cross || !state.doorOpen) return null;
  return movementClear(state,start,p,actor.id) && movementClear(state,p,end,actor.id) ? [p,end] : null;
}

export function knownFloor(state,[x,y]) {
  const g=geometry(state.map);
  return state.memory.includes(Math.floor(y/SAMPLE)*g.cols+Math.floor(x/SAMPLE));
}
export function hexAt(map,p) {return globalThis.aleaMapGrid.pixelToHex(geometry(map).grid,p);}
export function hexCenter(map,p) {const h=hexAt(map,p); return globalThis.aleaMapGrid.center(geometry(map).grid,h.q,h.r);}
export function hexDistance(map,a,b) {return globalThis.aleaMapGrid.distance(hexAt(map,a),hexAt(map,b));}

export function torchSource(state) {
  const host=state.actors.find(a=>a.id==='evalin'), from=point(host);
  const art=heroPlacement('evalin',{pixelsPerMeter:state.map.pixelsPerMeter,heightCm:host.heightCm});
  const tip=[host.x+(art.torchFlame.x-art.anchor.x)*art.width,
    host.y+(art.torchFlame.y-art.anchor.y)*art.height];
  const edges=[...geometry(state.map).outer,...geometry(state.map).solidEdges,leaf(state.map,state.doorOpen)];
  const [x,y]=isFloor(state.map,tip)&&clearMapSegment(from,tip,edges)?tip:from;
  return {x,y,actorId:host.id,footX:host.x,footY:host.y,on:state.torchOn,range:state.map.pixelsPerMeter*7.0};
}

export function perception(state) {
  const map=state.map, g=geometry(map), edges=[...g.outer,...g.solidEdges, leaf(map,state.doorOpen)];
  const torch=torchSource(state), source=point(torch), living=state.actors.filter(a=>a.kind==='hero' && a.hp!==0);
  const lights=(map.lamps ?? []).filter(lamp=>state.lamps?.[lamp.id]);
  const illuminated = p => contains(g.sun,p) || lights.some(lamp=>distance(lamp.foot,p)<lamp.range &&
    clearMapSegment(lamp.foot,p,edges)) || (torch.on && distance(source,p)<=torch.range && clearMapSegment(source,p,edges));
  const detects = (actor,p,light) => {
    if(!actor || actor.hp===0 || !clearMapSegment(point(actor),p,edges)) return false;
    const d=distance(point(actor),p)/map.pixelsPerMeter;
    return d<=.65 || (d<=14 && light) || (actor.darkvisionMeters>0 && d<=actor.darkvisionMeters);
  };
  const seenBy=p=>{const light=illuminated(p);return living.filter(a=>detects(a,p,light)).map(a=>a.id);};
  const current = new Set();
  for(const tile of g.tiles) {
    const light=illuminated(tile.center);
    if(living.some(a=>detects(a,tile.center,light))) current.add(tile.key);
  }
  // Sample the near frame rather than the opaque door plane.
  const [px,py]=portal(map);
  const doorSeen=[-2,2].some(offset=>seenBy(map.artFirst ? [px,py+offset] : [px+offset,py]).length>0);
  return {current,seenBy,doorSeen,edges,torch, individual:(actor,p)=>detects(actor,p,illuminated(p))};
}

function knownEdgeParts(map, known) {
  const g=geometry(map),parts=[];
  const adjacent=([x,y])=>[-3,3].some(dx=>[-3,3].some(dy=>known.has(Math.floor((y+dy)/SAMPLE)*g.cols+Math.floor((x+dx)/SAMPLE))));
  for(const [a,b] of [...g.outer,...g.solidEdges]) {
    const count=Math.ceil(distance(a,b)/SAMPLE), step=i=>[a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count];
    let start=null;
    for(let i=0;i<=count;i++) {
      const knownHere=i<count && adjacent(step(i+.5));
      if(knownHere && start===null) start=step(i);
      if(!knownHere && start!==null) {parts.push([start,step(i)]);start=null;}
    }
  }
  return parts;
}

// The beam is convex. The hull of actually perceived, illuminated samples
// describes only information already available to the party; the renderer
// additionally clips it to currently visible floor strips.
function sunHull(points) {
  if(points.length<3) return null;
  const sorted=points.slice().sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=values=>{
    const hull=[];
    for(const p of values) {
      while(hull.length>=2 && cross(hull.at(-2),hull.at(-1),p)<=0) hull.pop();
      hull.push(p);
    }
    hull.pop();return hull;
  };
  const polygon=[...half(sorted),...half(sorted.slice().reverse())];
  return polygon.length>=3?{polygon}:null;
}

export function renderGeometry(state, info, gm) {
  const map=state.map, g=geometry(map), known=new Set(state.memory), floor=[];
  let last;
  for(const {x,y,key} of g.tiles) {
    const visibility=info.current.has(key)?'visible':known.has(key)?'memory':gm?'hidden':null;
    if(!visibility) continue;
    if(last && last.y===y && last.x+last.width===x && last.visibility===visibility) last.width+=SAMPLE;
    else {last={x,y,width:SAMPLE,height:SAMPLE,visibility};floor.push(last);}
  }
  const wallParts = gm ? [...g.outer,...g.solidEdges] : knownEdgeParts(map,known);
  const walls = wallParts.map(([[x1,y1],[x2,y2]])=>({x1,y1,x2,y2}));
  const door = gm || state.rememberedDoor!==null ? {...map.door,...(map.artFirst?{visible:gm||info.doorSeen}:{}), open:gm || info.doorSeen?state.doorOpen:state.rememberedDoor} : null;
  const torch = {...info.torch};
  // Only previously observed wall fragments can reach a member via effect geometry.
  const lightEdges = gm ? info.edges : [...wallParts,...(door ? [leaf(map,door.open)] : [])];
  torch.polygon = torch.on ? visibilityPolygon(point(torch),torch.range,lightEdges) : [];
  const sun = gm ? {polygon:g.sun.map(p=>p.slice())} :
    sunHull(g.tiles.filter(t=>info.current.has(t.key) && contains(g.sun,t.center)).map(t=>t.center));
  return {width:map.width,height:map.height,pixelsPerMeter:map.pixelsPerMeter,floor,walls,door,torch,sun};
}

