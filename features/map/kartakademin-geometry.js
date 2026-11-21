import { traceFree } from './kartakademin-mask.js';

const EPSILON = 1e-7;

export function segments(points, closed = true) {
  return points.slice(0, closed ? points.length : -1).map((point, i) => [
    point, points[(i + 1) % points.length],
  ]);
}

export function contains(points, [x, y]) {
  let inside = false;
  for (const [[ax, ay], [bx, by]] of segments(points)) {
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function blockers(geometry, property) {
  return geometry.filter(shape => shape[property]).flatMap(shape => segments(shape.points, shape.closed));
}

export function isBlocked(geometry, point, property) {
  return geometry.some(shape => shape.closed && shape[property] && contains(shape.points, point));
}

function intersection(origin, dx, dy, [[ax, ay], [bx, by]], includeCollinear = false) {
  const sx = bx - ax, sy = by - ay;
  const divisor = dx * sy - dy * sx;
  const ox = ax - origin[0], oy = ay - origin[1];
  if (Math.abs(divisor) < EPSILON) {
    if (!includeCollinear || Math.abs(ox * dy - oy * dx) >= EPSILON) return Infinity;
    const a = ox * dx + oy * dy, b = a + sx * dx + sy * dy;
    return Math.max(a, b) < 0 ? Infinity : Math.max(0, Math.min(a, b));
  }
  const distance = (ox * sy - oy * sx) / divisor;
  const along = (ox * dy - oy * dx) / divisor;
  return distance >= 0 && along >= -EPSILON && along <= 1 + EPSILON ? distance : Infinity;
}

// A tactical step/ray stops on contact with the wall, including an endpoint
// or a collinear length of wall. Decorative light keeps its silhouette rules.
export function clearMapSegment(origin, destination, edges, freeSight = null) {
  const vx = destination[0] - origin[0], vy = destination[1] - origin[1];
  const distance = Math.hypot(vx, vy);
  if (!distance) return true;
  const dx = vx / distance, dy = vy / distance;
  return edges.every(edge => intersection(origin, dx, dy, edge, true) > distance + EPSILON) &&
    (!freeSight || traceFree(freeSight, origin, dx, dy, distance) >= distance - EPSILON);
}

export function unobstructedDistance(origin, dx, dy, limit, edges, freeSight) {
  for (const edge of edges) limit = Math.min(limit, intersection(origin, dx, dy, edge));
  return freeSight ? traceFree(freeSight, origin, dx, dy, limit) : limit;
}

export function visibilityPolygon(origin, radius, edges, direction = 0, aperture = 360, freeSight = null, visibleCornersOnly = false) {
  const start = (direction - aperture / 2) * Math.PI / 180;
  const span = aperture * Math.PI / 180;
  const normalize = angle => ((angle - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const angles = Array.from({ length: 129 }, (_, i) => span * i / 128);
  const near = edge => {
    const [[ax, ay], [bx, by]] = edge;
    return !(Math.min(ax, bx) > origin[0] + radius || Math.max(ax, bx) < origin[0] - radius ||
      Math.min(ay, by) > origin[1] + radius || Math.max(ay, by) < origin[1] - radius);
  };
  const nearby = edges.filter(near);
  const seen = new Set();
  for (const edge of [...nearby, ...(freeSight?.edges ?? []).filter(near)]) {
    for (const [x, y] of edge) {
      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      const vx = x - origin[0], vy = y - origin[1];
      if (visibleCornersOnly) {
        // A corner hidden strictly behind an earlier blocker cannot introduce
        // a silhouette. A tangent silhouette is represented by the nearer corner.
        const length = Math.hypot(vx, vy);
        const limit = Math.min(length, radius);
        if (length && unobstructedDistance(origin, vx / length, vy / length, limit, nearby, freeSight) < limit - .00001) continue;
      }
      const angle = Math.atan2(vy, vx);
      for (const offset of [-EPSILON, 0, EPSILON]) {
        const relative = normalize(angle + offset);
        if (relative <= span) angles.push(relative);
      }
    }
  }
  // Adjacent wall segments share corner rays, particularly on painted Solid masks.
  const points = [...new Set(angles)].sort((a, b) => a - b).map(angle => {
    const dx = Math.cos(start + angle), dy = Math.sin(start + angle);
    const distance = unobstructedDistance(origin, dx, dy, radius, nearby, freeSight);
    return [origin[0] + distance * dx, origin[1] + distance * dy];
  });
  return aperture < 360 ? [origin, ...points] : points;
}

// Each strip starts on the same aperture line and terminates at the first
// blocker encountered along the shared direction.
export function parallelBeamQuads(origin, length, width, direction, edges, freeSight) {
  const angle = direction * Math.PI / 180;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const strips = Math.min(256, Math.max(8, Math.ceil(width / Math.min(freeSight.dx, freeSight.dy))));
  const step = width / strips;
  const quads = [];
  for (let i = 0; i < strips; i++) {
    const across = (i + .5) * step - width / 2;
    const start = [origin[0] - dy * across, origin[1] + dx * across];
    let distance = length;
    for (const edge of edges) distance = Math.min(distance, intersection(start, dx, dy, edge));
    distance = traceFree(freeSight, start, dx, dy, distance);
    if (distance <= 0) continue;
    const offsetX = dy * step / 2, offsetY = dx * step / 2;
    const [x, y] = start;
    const endX = x + dx * distance, endY = y + dy * distance;
    quads.push([x + offsetX, y - offsetY, x - offsetX, y + offsetY,
      endX - offsetX, endY + offsetY, endX + offsetX, endY - offsetY]);
  }
  return quads;
}

export function resolveOrigin(light, positions) {
  return light.characterId ? positions.find(p => p.character_id === light.characterId)?.position : light.position;
}

export function roomVisibility(status) {
  if (status === 'explored') return 'sharp';
  if (status === 'unexplored') return 'blur';
  return 'black';
}

// The most restrictive overlapping room wins, matching the discovery masks.
export function pointIsExplored(areas, point) {
  let explored = false;
  for (const { shape_type, shape_data, status } of areas) {
    if (!shape_data) continue;
    const [px, py] = point;
    const { x, y, width, height, points } = shape_data;
    const hit = shape_type === 'rect'
      ? px >= x && py >= y && px < x + width && py < y + height
      : Array.isArray(points) && points.length >= 3 && contains(points, point);
    if (!hit) continue;
    if (status !== 'explored') return false;
    explored = true;
  }
  return explored;
}

export function knownAreas(areas) {
  return areas.filter(area => area.status === 'explored' || area.status === 'unexplored');
}

export function canMove(geometry, origin, destination) {
  if (isBlocked(geometry, destination, 'movement')) return false;
  if (!origin) return true;
  const dx = destination[0] - origin[0], dy = destination[1] - origin[1];
  const distance = Math.hypot(dx, dy);
  return !distance || blockers(geometry, 'movement').every(edge =>
    intersection(origin, dx / distance, dy / distance, edge) > distance);
}

export function directionalReach(light) {
  if (light.type !== 'solljus' && light.type !== 'manljus') return light.range;
  if (!light.height || !light.inclination) return light.range;
  return Math.min(light.range, light.height / Math.tan(light.inclination * Math.PI / 180));
}

export function mapDistanceMeters(start, end, pixelsPerMeter) {
  return Math.hypot(end[0]-start[0], end[1]-start[1]) / pixelsPerMeter;
}
