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

// Positively orient both rings. Two adjacent interiors run in opposite
// directions along every shared segment, including partial edges after noding.
function jointBoundary(polygon, hole) {
  const [room, gap] = splitPolygons([polygon, hole]).map(ring => area(ring) < 0 ? ring.reverse() : ring);
  const boundary = new Map();
  let sharedLength = 0;
  let opposite = true;
  for (const ring of [room, gap]) {
    for (let i = 0; i < ring.length; i++) {
      const from = ring[i], to = ring[(i + 1) % ring.length];
      const id = edgeKey(from, to), previous = boundary.get(id);
      if (!previous) {
        boundary.set(id, { from, to });
        continue;
      }
      sharedLength += Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (!eq(previous.from, to) || !eq(previous.to, from)) opposite = false;
      boundary.delete(id);
    }
  }
  return { edges: boundary.values(), opposite, sharedLength };
}

function joinedRing(polygon, hole, joint) {
  if (!joint.sharedLength || !joint.opposite) return null;
  const outgoing = new Map();
  for (const edge of joint.edges) {
    const id = key(edge.from);
    if (outgoing.has(id)) return null; // Branch or point contact.
    outgoing.set(id, edge);
  }
  // Keep the edited room's winding and first surviving original corner.
  const start = polygon.find(point => outgoing.has(key(point))) ?? outgoing.values().next().value?.from;
  if (!start) return null;
  const result = [];
  let current = start;
  do {
    const id = key(current), next = outgoing.get(id);
    if (!next) return null;
    outgoing.delete(id);
    result.push(current.slice());
    current = next.to;
  } while (!eq(current, start));
  if (outgoing.size || !validPolygon(result)) return null; // A second boundary needs a multi-ring shape.
  const expected = Math.abs(area(polygon)) + Math.abs(area(hole));
  const tolerance = 32 * Number.EPSILON * result.length * expected;
  if (Math.abs(area(result) - expected) > tolerance) return null;
  return area(polygon) < 0 ? [result[0], ...result.slice(1).reverse()] : result;
}

function mergeHole(polygon, hole) {
  if (!validPolygon(polygon) || !validPolygon(hole) || polygonsOverlap(polygon, hole)) return null;
  return joinedRing(polygon, hole, jointBoundary(polygon, hole));
}

function sharedBoundaryLength(polygon, hole) {
  return jointBoundary(polygon, hole).sharedLength;
}

// The caller supplies a face from findHoles on this map. Each option replaces
// exactly one room's geometry; IDs, place links and the neighboring rings stay intact.
export function gapRepairCandidates(shapes, hole) {
  if (!validPolygon(hole) || shapes.some(shape => polygonsOverlap(shape.points, hole))) return [];
  const choices = [];
  for (const room of shapes) {
    const joint = jointBoundary(room.points, hole);
    if (!joint.sharedLength || !validPolygon(room.points)) continue;
    const points = joinedRing(room.points, hole, joint);
    if (!points || shapes.some(other => other.id !== room.id && polygonsOverlap(points, other.points))) continue;
    choices.push({ id: room.id, points, sharedLength: joint.sharedLength });
  }
  return choices.sort((a, b) => b.sharedLength - a.sharedLength);
}
function moveSharedVertex(polygons,origin,destination){
 return polygons.map(poly=>poly.map(p=>eq(p,origin)?destination.slice():p.slice()));
}
export {area,splitPolygons,findHoles,mergeHole,sharedBoundaryLength,moveSharedVertex};
