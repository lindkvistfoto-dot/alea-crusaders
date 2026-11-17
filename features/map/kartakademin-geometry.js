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

function intersection(origin, dx, dy, [[ax, ay], [bx, by]]) {
  const sx = bx - ax, sy = by - ay;
  const divisor = dx * sy - dy * sx;
  if (Math.abs(divisor) < EPSILON) return Infinity;
  const ox = ax - origin[0], oy = ay - origin[1];
  const distance = (ox * sy - oy * sx) / divisor;
  const along = (ox * dy - oy * dx) / divisor;
  return distance >= 0 && along >= -EPSILON && along <= 1 + EPSILON ? distance : Infinity;
}

export function visibilityPolygon(origin, radius, edges, direction = 0, aperture = 360, freeSight = null) {
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
  for (const edge of [...nearby, ...(freeSight?.edges ?? []).filter(near)]) {
    for (const [x, y] of edge) {
      const angle = Math.atan2(y - origin[1], x - origin[0]);
      for (const offset of [-EPSILON, 0, EPSILON]) {
        const relative = normalize(angle + offset);
        if (relative <= span) angles.push(relative);
      }
    }
  }
  const points = angles.sort((a, b) => a - b).map(angle => {
    const dx = Math.cos(start + angle), dy = Math.sin(start + angle);
    let distance = radius;
    for (const edge of nearby) distance = Math.min(distance, intersection(origin, dx, dy, edge));
    if (freeSight) distance = traceFree(freeSight, origin, dx, dy, distance);
    return [origin[0] + distance * dx, origin[1] + distance * dy];
  });
  return aperture < 360 ? [origin, ...points] : points;
}

export function resolveOrigin(light, positions) {
  return light.characterId ? positions.find(p => p.character_id === light.characterId)?.position : light.position;
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
