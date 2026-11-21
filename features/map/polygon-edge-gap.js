import { polygonsOverlap, signedArea, validPolygon } from './polygon-edit-geometry.js';

const MIN_ALIGNMENT = Math.cos(Math.PI / 6);

function selectedEdge(shapes, selection) {
  const shape = shapes.find(room => room.id === selection?.id);
  const index = selection?.index;
  if (!shape || !Number.isInteger(index) || index < 0 || index >= shape.points.length || !validPolygon(shape.points)) return null;
  const a = shape.points[index], b = shape.points[(index + 1) % shape.points.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
  const winding = Math.sign(signedArea(shape.points));
  return {
    shape, a, b, index, length, dx, dy,
    along: p => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy,
    outward: p => winding * ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx),
  };
}

function atStation(edge, station, start, end, epsilon) {
  // Keep a stored endpoint bit-for-bit when no clipping is necessary.
  if (Math.abs(station - start) <= epsilon) return edge.a;
  if (Math.abs(station - end) <= epsilon) return edge.b;
  const t = (station - start) / (end - start);
  return [edge.a[0] + t * (edge.b[0] - edge.a[0]), edge.a[1] + t * (edge.b[1] - edge.a[1])];
}

function ring(points) {
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const output = points.filter((p, i) => !i || !same(points[i - 1], p));
  if (output.length > 1 && same(output[0], output.at(-1))) output.pop();
  return output;
}

// Propose a strip only between two explicitly picked facing wall segments.
// Slice both walls at the same two perpendicular stations on the source axis.
// The target and unselected edges keep their original coordinates and order.
export function edgeGapRepair(shapes, source, target) {
  if (source?.id === target?.id) return null;
  const from = selectedEdge(shapes, source), to = selectedEdge(shapes, target);
  if (!from || !to || Math.abs(from.dx * to.dx + from.dy * to.dy) < MIN_ALIGNMENT) return null;
  const start = from.along(to.a), end = from.along(to.b);
  const lo = Math.max(0, Math.min(start, end)), hi = Math.min(from.length, Math.max(start, end));
  if (hi <= lo) return null;
  const epsilon = 16 * Number.EPSILON * Math.max(1, from.length, to.length,
    ...[...from.a, ...from.b, ...to.a, ...to.b].map(Math.abs));
  const a = atStation(from, lo, 0, from.length, epsilon), b = atStation(from, hi, 0, from.length, epsilon);
  const c = atStation(to, lo, start, end, epsilon), d = atStation(to, hi, start, end, epsilon);
  const depths = [from.outward(c), from.outward(d)];
  if (Math.min(...depths, to.outward(a), to.outward(b)) < -epsilon) return null;
  // At least a 2:1 length-to-depth ratio distinguishes a seam from a broad
  // open area. Wider or more oblique selections need an explicitly drawn outline.
  if (Math.max(...depths) * 2 > hi - lo + epsilon) return null;

  const patch = ring([a, c, d, b]);
  if (!validPolygon(patch) || shapes.some(shape => polygonsOverlap(patch, shape.points))) return null;
  const original = from.shape.points;
  const points = ring([...original.slice(0, from.index + 1), ...patch, ...original.slice(from.index + 1)]);
  if (!validPolygon(points) || shapes.some(shape => shape.id !== source.id && polygonsOverlap(points, shape.points))) return null;
  return { id: from.shape.id, points, patch, targetId: to.shape.id };
}
