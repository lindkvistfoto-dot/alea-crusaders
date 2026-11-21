// Map coordinates stay in image pixels. Screen distances (selection and snap)
// are CSS pixels, independent of the map's physical scale or device pixel ratio.
import { contains, segments } from './kartakademin-geometry.js';

export function areaPoints(area) {
  const data = area?.shape_data;
  if (area?.shape_type === 'rect' && data) {
    const [x, y, width, height] = [data.x, data.y, data.width, data.height].map(Number);
    if (![x, y, width, height].every(Number.isFinite)) return [];
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  }
  if (!Array.isArray(data?.points) || !data.points.every(p =>
    Array.isArray(p) && p.length === 2 && p.every(v => v != null && Number.isFinite(Number(v))))) return [];
  const points = data.points.map(([x, y]) => [Number(x), Number(y)]);
  // Older maps can store the closing vertex explicitly. SVG and the editor
  // close the ring implicitly; leave the original row intact for undo.
  if (points.length > 3 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  return points;
}

export function mapPointer(event, svg) {
  const inverse = svg.getScreenCTM()?.inverse();
  if (!inverse) return null;
  const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

export function mapScreenScale(svg) {
  const matrix = svg.getScreenCTM();
  return matrix ? { scaleX: Math.hypot(matrix.a, matrix.b), scaleY: Math.hypot(matrix.c, matrix.d) }
    : { scaleX: 1, scaleY: 1 };
}

function precision(a, b) {
  return 8 * Number.EPSILON * Math.max(1, Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1]));
}

export function samePoint(a, b) {
  const epsilon = precision(a, b);
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function side(a, b, p) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const cross = dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
  const error = Math.max(precision(a, b), precision(a, p)) * (Math.abs(dx) + Math.abs(dy));
  return Math.abs(cross) <= error ? 0 : Math.sign(cross);
}

export function onSegment(point, a, b) {
  const epsilon = precision(a, b);
  return point[0] >= Math.min(a[0], b[0]) - epsilon && point[0] <= Math.max(a[0], b[0]) + epsilon &&
    point[1] >= Math.min(a[1], b[1]) - epsilon && point[1] <= Math.max(a[1], b[1]) + epsilon &&
    side(a, b, point) === 0;
}

export function sortedInteriorVertices(a, b, candidates) {
  const interior = candidates.filter(p => !samePoint(p, a) && !samePoint(p, b) && onSegment(p, a, b));
  const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
  interior.sort((p, q) => (p[axis] - q[axis]) * Math.sign(b[axis] - a[axis]));
  return interior.filter((p, index) => index === 0 || !samePoint(p, interior[index - 1]));
}

export function signedArea(points) {
  let twiceArea = 0;
  // Translate to the first vertex before multiplying so a small shape far
  // from the origin retains its area.
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], origin = points[0];
    twiceArea += (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1]);
  }
  return twiceArea / 2;
}

function crosses(a, b, c, d) {
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

export function validPolygon(points) {
  if (!Array.isArray(points) || points.length < 3 ||
      !points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return false;
  const edges = segments(points);
  if (!signedArea(points)) return false;
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i], next = points[(i + 2) % points.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7 || onSegment(next, a, b) || onSegment(a, b, next)) return false;
    for (let j = i + 2; j < edges.length; j++) {
      if (i === 0 && j === edges.length - 1) continue;
      const [c, d] = edges[j];
      if (crosses(a, b, c, d) || onSegment(c, a, b) || onSegment(d, a, b) ||
          onSegment(a, c, d) || onSegment(b, c, d)) return false;
    }
  }
  return true;
}

function bounds(points) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const [x, y] of points) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left, right, top, bottom };
}

function boundaryInside(points, other, otherEdges) {
  const strictInside = p => !otherEdges.some(([a, b]) => onSegment(p, a, b)) && contains(other, p);
  if (points.some(strictInside)) return true;
  for (const [a, b] of segments(points)) {
    // A diagonal between two boundary vertices can run through the interior.
    // A vertex of the other shape can separate several such intervals on one edge.
    const interiorStops = sortedInteriorVertices(a, b, other);
    let previous = a;
    for (const next of [...interiorStops, b]) {
      if (strictInside([(previous[0] + next[0]) / 2, (previous[1] + next[1]) / 2])) return true;
      previous = next;
    }
  }
  return false;
}

export function polygonsOverlap(a, b) {
  if (a.length < 3 || b.length < 3) return false;
  const first = bounds(a), second = bounds(b);
  if (first.right <= second.left || second.right <= first.left ||
      first.bottom <= second.top || second.bottom <= first.top) return false;
  const aEdges = segments(a), bEdges = segments(b);
  const winding = Math.sign(signedArea(a) * signedArea(b));
  for (const [p, q] of aEdges) {
    for (const [r, s] of bEdges) {
      if (crosses(p, q, r, s)) return true;
      if (side(p, q, r) !== 0 || side(p, q, s) !== 0) continue;
      const axis = Math.abs(p[0] - q[0]) > Math.abs(p[1] - q[1]) ? 0 : 1;
      const overlap = Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], s[axis])) -
        Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], s[axis]));
      // Shared wall with interiors on the same side, including identical shapes.
      if (overlap > precision(p, q) && (q[axis] - p[axis]) * (s[axis] - r[axis]) * winding > 0) return true;
    }
  }
  return boundaryInside(a, b, bEdges) || boundaryInside(b, a, aEdges);
}

function project(point, a, b, scaleX, scaleY) {
  const dx = (b[0] - a[0]) * scaleX, dy = (b[1] - a[1]) * scaleY;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point[0] - a[0]) * scaleX * dx + (point[1] - a[1]) * scaleY * dy) / lengthSquared)) : 0;
  const target = t === 0 ? a : t === 1 ? b : [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { t, point: target.slice(), distance: Math.hypot((point[0] - target[0]) * scaleX, (point[1] - target[1]) * scaleY) };
}

export function nearestEdge(point, points, { scaleX = 1, scaleY = 1, closed = true, excludePoint } = {}) {
  let nearest = null;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    if (excludePoint && onSegment(excludePoint, a, b)) continue;
    const candidate = project(point, a, b, scaleX, scaleY);
    if (!nearest || candidate.distance < nearest.distance) nearest = { index, ...candidate };
  }
  return nearest;
}

export function snapPoint(point, shapes, { scaleX = 1, scaleY = 1, tolerance = 14, excludePoint, excludeIds } = {}) {
  let best = null;
  for (const shape of shapes) {
    for (let index = 0; index < shape.points.length; index++) {
      const target = shape.points[index];
      if (excludePoint && (!excludeIds || excludeIds.has(shape.id)) && samePoint(target, excludePoint)) continue;
      const distance = Math.hypot((point[0] - target[0]) * scaleX, (point[1] - target[1]) * scaleY);
      if (distance <= tolerance && (!best || distance < best.distance)) {
        best = { kind: 'vertex', id: shape.id, index, point: target.slice(), distance };
      }
    }
  }
  if (best) return best;
  for (const shape of shapes) {
    const edge = nearestEdge(point, shape.points, { scaleX, scaleY, closed: shape.closed !== false,
      excludePoint: !excludeIds || excludeIds.has(shape.id) ? excludePoint : undefined });
    if (edge && edge.distance <= tolerance && (!best || edge.distance < best.distance)) {
      best = { kind: 'edge', id: shape.id, ...edge };
    }
  }
  return best;
}

export function hitPolygons(point, shapes, { scaleX = 1, scaleY = 1, tolerance = 0 } = {}) {
  return shapes.filter(shape => {
    if (shape.closed === false || shape.points.length < 3) return false;
    if (contains(shape.points, point)) return true;
    if (!tolerance) return shape.points.some((a, i) => onSegment(point, a, shape.points[(i + 1) % shape.points.length]));
    return nearestEdge(point, shape.points, { scaleX, scaleY })?.distance <= tolerance;
  }).map(shape => shape.id).reverse();
}

// Insert the exact same coordinate wherever a wall contains it. Only returns
// changed polygons so a caller never rewrites an unrelated legacy row.
export function insertSharedVertex(shapes, point) {
  const changes = [];
  for (const { id, points } of shapes) {
    if (points.some(p => samePoint(p, point))) continue;
    const index = points.findIndex((p, i) => onSegment(point, p, points[(i + 1) % points.length]));
    if (index >= 0) changes.push({ id, points: [...points.slice(0, index + 1), point.slice(), ...points.slice(index + 1)] });
  }
  return changes;
}

export function prepareVertexMove(shapes, origin) {
  const affected = shapes.filter(({ points }) => points.some((a, i) => onSegment(origin, a, points[(i + 1) % points.length])));
  const updated = new Map(insertSharedVertex(affected, origin).map(change => [change.id, change.points]));
  const allVertices = shapes.flatMap(shape => shape.points);
  return affected.map(shape => {
    const points = updated.get(shape.id) || shape.points;
    const result = [];
    for (const [a, b] of segments(points)) {
      result.push(a);
      if (!samePoint(a, origin) && !samePoint(b, origin)) continue;
      // A shared edge can already have intermediate vertices on just one side.
      // When bending that edge, keep those vertices fixed on BOTH sides.
      result.push(...sortedInteriorVertices(a, b, allVertices));
    }
    return { id: shape.id, points: result, index: result.findIndex(p => samePoint(p, origin)) };
  });
}

export function movePreparedVertices(prepared, destination) {
  return prepared.map(({ id, points, index }) => {
    const next = points.slice();
    next[index] = destination.slice();
    return { id, points: next };
  });
}
