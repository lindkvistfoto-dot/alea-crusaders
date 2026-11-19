import { blockers, clearMapSegment, isBlocked } from '../map/kartakademin-geometry.js';
import { createMask, isFree } from '../map/kartakademin-mask.js';

// Trace the original, straight ray. Rounding an axial line through hex centres
// can produce a zigzag that touches a nearby wall even when the ray is clear.
export function prepareMapSight(map, config) {
  if (!config) return () => true;
  if (!config.freeSight) return () => false;
  const mask = createMask(map.width, map.height, config.freeSight);
  const shapes = config.geometry.filter(shape => shape.sight);
  const edges = blockers(shapes, 'sight');
  return (from, to) => {
    if (!isFree(mask, from) || !isFree(mask, to) ||
        isBlocked(shapes, from, 'sight') || isBlocked(shapes, to, 'sight')) return false;
    return clearMapSegment(from, to, edges, mask);
  };
}

// A centre can stand in a hex and still be separated from its neighbour by a
// narrow wall. Preserve both facts in the encounter's existing hex grid.
export function projectMapHexes({config,objects=[],sceneHexes=[]}, grid, cells, directions) {
  const shapes = [...(config?.geometry ?? [])];
  for (const object of objects) {
    if (object.movement_blocking) shapes.push({
      movement: true, closed: true, points: object.footprint.map(({x,y}) => [x,y]),
    });
  }
  const movement = blockers(shapes, 'movement');
  // An authored academy map starts Solid until free sight is painted. A map
  // that only has object-library calibration has no sight mask to project.
  const mask = config?.freeSight ? createMask(grid.width, grid.height, config.freeSight) : null;
  const unpainted = !!config && !mask;
  const rows = new Map(sceneHexes.map(row => [row.q+','+row.r, {...row}]));
  const byKey = new Map();
  for (const cell of cells) {
    const point = [cell.x, cell.y];
    byKey.set(cell.key, {
      ...cell, point, move: 0, solid_move: isBlocked(shapes, point, 'movement'),
      solid_sight: unpainted || isBlocked(shapes, point, 'sight') || !!mask && !isFree(mask, point),
    });
  }
  for (const cell of byKey.values()) {
    // Visit each undirected edge once and write both orientations.
    for (let i=0; i<3; i++) {
      const [dq,dr] = directions[i];
      const other = byKey.get((cell.q+dq)+','+(cell.r+dr));
      if (!other) continue;
      if (cell.solid_move || other.solid_move || !clearMapSegment(cell.point, other.point, movement)) {
        cell.move |= 1<<i;
        other.move |= 1<<(i+3);
      }
    }
  }
  for (const cell of byKey.values()) {
    if (!cell.move && !cell.solid_move && !cell.solid_sight) continue;
    const row = rows.get(cell.key) ?? { q: cell.q, r: cell.r, movement_mode:'free', sight_mode:'clear', movement_cost:1, notes:'' };
    if (cell.solid_move) row.movement_mode = 'blocked';
    row.academy_barriers = {move:cell.move, solid_move:cell.solid_move, solid_sight:cell.solid_sight};
    rows.set(cell.key,row);
  }
  return [...rows.values()];
}
