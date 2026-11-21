import { unobstructedDistance } from './kartakademin-geometry.js';

// The baseline is an ordinary blocker in map pixels. The far edge is the
// painted top of the wall; its opposite normal points into the room.
export function paintedEdge([a, b], point) {
  const x = b[0] - a[0], y = b[1] - a[1];
  const length = Math.hypot(x, y);
  if (length < 1) return null;
  const nx = -y / length, ny = x / length;
  const depth = (point[0] - a[0]) * nx + (point[1] - a[1]) * ny;
  if (Math.abs(depth) < 1) return null;
  return [a, b].map(([px, py]) => [px + nx * depth, py + ny * depth]);
}

export function replaceWallFoot(previous, points) {
  const strip = wallStrip(previous);
  if (!strip || points.length !== 2) return null;
  const [a,b] = points;
  const length = Math.hypot(b[0]-a[0], b[1]-a[1]);
  if (length < 1) return null;
  return paintedEdge(points,[a[0]-(b[1]-a[1])*strip.depth/length, a[1]+(b[0]-a[0])*strip.depth/length]);
}

export function wallStrip(shape) {
  if (shape.closed || shape.points?.length !== 2 || shape.face?.length !== 2) return null;
  const [a, b] = shape.points;
  if (![a, b, ...shape.face].every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return null;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 1) return null;
  const tx = (b[0] - a[0]) / length, ty = (b[1] - a[1]) / length;
  const depth = (shape.face[0][0] - a[0]) * -ty + (shape.face[0][1] - a[1]) * tx;
  if (Math.abs(depth) < 1) return null;
  return { a, length, tx, ty, depth, nx: ty * Math.sign(depth), ny: -tx * Math.sign(depth) };
}

// Sample only the accessible side of the foot. In player views the blocking
// line is rasterized by the existing RPC and can cover its adjacent cell.
export function wallIllumination(wall, along, source, edges, mask) {
  const { a, tx, ty, nx, ny } = wall;
  const { origin, range, direction, aperture, beam, width, softness } = source;
  const x = a[0] + tx * along, y = a[1] + ty * along;
  const vx = x - origin[0], vy = y - origin[1];
  const facing = -vx * nx - vy * ny;
  const distance = Math.hypot(vx, vy);
  if (facing <= 0 || distance < .001) return 0;
  const forward = vx * direction[0] + vy * direction[1];
  const cross = Math.abs(vy * direction[0] - vx * direction[1]);
  let falloff = 1 - distance / range;
  if (beam === 'parallel' || beam === 'overhead') {
    const edge = beam === 'parallel' ? Math.max(forward / range, 2 * cross / width)
      : Math.hypot(forward / range, 2 * cross / width);
    if (beam === 'parallel' && forward < 0) return 0;
    falloff = Math.min(1, (1 - edge) / Math.max(.015, softness));
  } else if (aperture < 360 && forward / distance < Math.cos(aperture * Math.PI / 360)) return 0;
  if (falloff <= 0) return 0;
  const inset = Math.min(facing * .5, Math.hypot(mask.dx, mask.dy) * 1.5);
  const px = x + nx * inset, py = y + ny * inset;
  // Parallel sunlight starts at the aperture line at this sample's offset.
  let start = origin;
  if (beam === 'parallel') {
    const alongRay = (px-origin[0])*direction[0] + (py-origin[1])*direction[1];
    if (alongRay <= 0 || direction[0]*nx + direction[1]*ny >= 0) return 0;
    start = [px - alongRay*direction[0], py - alongRay*direction[1]];
  }
  const dx = px - start[0], dy = py - start[1], d = Math.hypot(dx, dy);
  if (d > .001 && unobstructedDistance(start, dx/d, dy/d, d, edges, mask) < d - .001) return 0;
  const incidence = beam === 'parallel' ? -(direction[0]*nx + direction[1]*ny) : facing/distance;
  return falloff * Math.sqrt(Math.max(0, incidence));
}

// A small texture in wall-local coordinates. Only a moving light, a changed
// obstacle or a redefined surface needs a new projection; flicker reuses it.
export function bakeWall(wall, source, edges, mask, scale) {
  const dx = source.origin[0]-wall.a[0], dy = source.origin[1]-wall.a[1];
  const reach = source.beam ? Math.hypot(source.range,source.width/2) : source.range;
  const closest = Math.max(0, Math.min(wall.length, dx*wall.tx+dy*wall.ty));
  if (Math.hypot(dx-closest*wall.tx, dy-closest*wall.ty) > reach) return null;
  const cols = Math.max(2, Math.min(1024, Math.ceil(wall.length * scale / 2)));
  const rows = 24;
  const values = new Float32Array(cols);
  for (let i = 0; i < cols; i++) values[i] = wallIllumination(wall, (i+.5)*wall.length/cols, source, edges, mask);
  if (!values.some(v => v > 0)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(cols, rows);
  pixels.data.fill(255);
  for (let x=0; x<cols; x++) {
    const strength = (values[Math.max(0,x-1)] + 2*values[x] + values[Math.min(cols-1,x+1)]) / 4;
    const end = Math.min(1,(x+.5)/2,(cols-x-.5)/2);
    for (let y=0; y<rows; y++) {
      const height = (y+.5)/rows;
      pixels.data[4*(y*cols+x)+3] = 255*strength*end*(1-height*.4)*Math.min(1,(1-height)*9);
    }
  }
  ctx.putImageData(pixels,0,0);
  return canvas;
}
