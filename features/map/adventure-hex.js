import { isBlocked } from './kartakademin-geometry.js';
import { createMask, isFree } from './kartakademin-mask.js';

export function adventureGrid(map, config) {
  const ppm = Number(config?.pixelsPerMeter) || Number(map.pixels_per_meter);
  // Combat's point-up axial grid uses a 1.5 m row pitch and origin (0, 0).
  const pitch = ppm > 0 ? 1.5 * ppm : map.height / 30;
  return { pitch, size: pitch / 1.5, width: Math.sqrt(3) * pitch / 1.5,
    movement: (config?.geometry || []).filter(shape => shape.movement),
    mask: config?.freeSight?.runs?.length ? createMask(map.width, map.height, config.freeSight) : null };
}

export function hexCenter(grid, q, r) {
  return [grid.width * (q + r / 2), grid.pitch * r];
}

export function adventureCell(map, grid, point, rows, movingId) {
  if (!point || !grid) return null;
  const r = point[1] / grid.pitch, q = point[0] / grid.width - r / 2, s = -q-r;
  let col = Math.round(q), row = Math.round(r);
  const third = Math.round(s), dq = Math.abs(col-q), dr = Math.abs(row-r), ds = Math.abs(third-s);
  if (dq > dr && dq > ds) col = -row-third;
  else if (dr > ds) row = -col-third;
  const center = hexCenter(grid, col, row);
  const [x,y] = center;
  if (x-grid.width/2 < 0 || x+grid.width/2 > map.width || y-grid.size < 0 || y+grid.size > map.height ||
      isBlocked(grid.movement, center, 'movement') || (grid.mask && !isFree(grid.mask, center)) ||
      rows.some(item => item.id !== movingId && item.q === col && item.r === row)) return null;
  return { q: col || 0, r: row || 0, x, y };
}
