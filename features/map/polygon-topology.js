/* Planar faces in map coordinates. Nothing here changes a stored room. */
import { polygonsOverlap, signedArea as area, sortedInteriorVertices, validPolygon } from './polygon-edit-geometry.js';

const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const key = point => point.join(',');
const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');

function lowerBoundX(points, x) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid][0] < x) low = mid + 1;
    else high = mid;
  }
  return low;
}

// Split T-junctions using the source vertices themselves, including intermediate
// points along a shared wall. A near miss must never close an open passage.
function splitPolygons(polygons) {
  const unique = new Map();
  for (const polygon of polygons) {
    for (const point of polygon) unique.set(key(point), point);
  }
  const vertices = [...unique.values()].sort((a, b) => a[0] - b[0]);
  return polygons.map(polygon => {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      if (eq(a, b)) continue;
      const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
      const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
      const candidates = [];
      for (let j = lowerBoundX(vertices, minX); j < vertices.length && vertices[j][0] <= maxX; j++) {
        const point = vertices[j];
        if (point[1] >= minY && point[1] <= maxY) candidates.push(point);
      }
      result.push(a.slice());
      for (const point of sortedInteriorVertices(a, b, candidates)) result.push(point.slice());
    }
    return result;
  });
}

function buildFaceGraph(polygons) {
  const vertices = new Map();
  const halfEdges = [];
  function vertex(point) {
    const id = key(point);
    if (!vertices.has(id)) vertices.set(id, { point, neighbors: new Map() });
    return vertices.get(id);
  }
  function edge(from, to) {
    if (!from.neighbors.has(to)) {
      const a = { from, to }, b = { from: to, to: from, twin: a };
      a.twin = b;
      from.neighbors.set(to, a);
      to.neighbors.set(from, b);
      halfEdges.push(a, b);
    }
    return from.neighbors.get(to);
  }
  for (const polygon of polygons) {
    const positive = area(polygon) > 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = vertex(polygon[i]), b = vertex(polygon[(i + 1) % polygon.length]);
      if (a !== b) (positive ? edge(a, b) : edge(b, a)).occupied = true;
    }
  }
  for (const node of vertices.values()) {
    const angle = edge => Math.atan2(edge.to.point[1] - node.point[1], edge.to.point[0] - node.point[0]);
    const outgoing = [...node.neighbors.values()].sort((a, b) => angle(a) - angle(b));
    // The predecessor of the incoming twin bounds the face on our left.
    for (let i = 0; i < outgoing.length; i++) {
      outgoing[i].twin.next = outgoing[(i + outgoing.length - 1) % outgoing.length];
    }
  }
  return halfEdges;
}

function findHoles(polygons) {
  const shapes = splitPolygons(polygons.filter(polygon => polygon.length >= 3));
  const halfEdges = buildFaceGraph(shapes);
  const holes = [];
  for (const start of halfEdges) {
    if (start.visited) continue;
    const points = [];
    let occupied = false;
    let edge = start;
    do {
      edge.visited = true;
      points.push(edge.from.point);
      occupied ||= Boolean(edge.occupied);
      edge = edge.next;
    } while (edge !== start);
    if (occupied) continue;
    const faceArea = area(points);
    if (faceArea <= 0 || !validPolygon(points)) continue;
    // A disconnected occupied island has its own edge cycle. Holes in a
    // single room ring are not representable, so never offer that enclosing face.
    if (shapes.some(shape => polygonsOverlap(points, shape))) continue;
    holes.push({ points, area: faceArea });
  }
  return holes.sort((a, b) => a.area - b.area);
}
function mergeHole(polygon,hole){
 if(!polygon||!hole||polygon.length<3||hole.length<3)return null;
 const [a,b]=splitPolygons([area(polygon)<0?[...polygon].reverse():polygon,area(hole)<0?[...hole].reverse():hole]);
 const edges=new Map();
 for(let poly of [a,b])for(let i=0;i<poly.length;i++){
  const from=poly[i],to=poly[(i+1)%poly.length],id=edgeKey(from,to);
  if(edges.has(id))edges.delete(id);else edges.set(id,{from,to});
 }
 const remaining=[...edges.values()];
 const output=[],used=new Set();let current=remaining[0];
 if(!current)return null;
 const first=key(current.from);
 for(let i=0;i<=remaining.length;i++){
  if(!current||used.has(current))return null;
  used.add(current);output.push(current.from);
  if(key(current.to)===first)break;
  const choices=remaining.filter(e=>!used.has(e)&&eq(e.from,current.to));
  if(choices.length!==1)return null;current=choices[0];
 }
 if(used.size!==remaining.length||output.length<3)return null;
 const result=output.filter((p,i)=>!i||!eq(p,output[i-1]));
 if(Math.abs(area(result)-area(a)-area(b))>Math.max(.01,Math.abs(area(b))*.00001))return null;
 return result;
}
function sharedBoundaryLength(polygon,hole){
 const [a,b]=splitPolygons([polygon,hole]);
 const edges=new Set();
 for(let i=0;i<a.length;i++)edges.add(edgeKey(a[i],a[(i+1)%a.length]));
 let total=0;
 for(let i=0;i<b.length;i++){
  const p=b[i],q=b[(i+1)%b.length];
  if(edges.has(edgeKey(p,q)))total+=Math.hypot(q[0]-p[0],q[1]-p[1]);
 }
 return total;
}
function moveSharedVertex(polygons,origin,destination){
 return polygons.map(poly=>poly.map(p=>eq(p,origin)?destination.slice():p.slice()));
}
export {area,splitPolygons,findHoles,mergeHole,sharedBoundaryLength,moveSharedVertex};
