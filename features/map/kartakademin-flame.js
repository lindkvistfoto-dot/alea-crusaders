import { unobstructedDistance, visibilityPolygon } from './kartakademin-geometry.js';

// Three projections approximate the visible area of a flame. Their barycentre
// can move by half the sampling radius while the light sprite stays in place.
const axes = [[0, -1], [Math.sqrt(3) / 2, .5], [-Math.sqrt(3) / 2, .5]];
export const flames = {
  fackla: { swing: .05, motion: .18 },
  lykta: { swing: .018, motion: .06 },
  eldstad: { swing: .08, motion: .22 },
};

export function flameWeights(phase, motion, preset) {
  const amount = Math.min(1, Math.max(0, motion / preset.motion));
  const x = .78 * Math.sin(phase * .31) + .22 * Math.sin(phase);
  const y = .78 * Math.cos(phase * .31) + .22 * Math.cos(phase);
  return axes.map(([dx, dy]) => (1 + amount * (dx * x + dy * y)) / 3);
}

export function flameOrigins(origin, pixelsPerMeter, preset, edges, mask) {
  const radius = 2 * preset.swing * pixelsPerMeter;
  return axes.map(([dx, dy]) => {
    // Trace from the fixture as well as from the sample. Even a one-cell wall
    // between two otherwise free points must stop the virtual source.
    const safe = unobstructedDistance(origin, dx, dy, radius, edges, mask);
    const distance = safe < radius ? Math.max(0, safe - 1e-5) : safe;
    return [origin[0] + distance * dx, origin[1] + distance * dy];
  });
}

// Approximate Euclidean distance inside the visible region (3 units per pixel,
// 4 on a diagonal). Outside cells stay zero through both passes.
export function featherVisibility(image, width, height, featherPx) {
  const limit = Math.max(1, Math.min(255, Math.ceil(3 * featherPx)));
  const distance = new Uint8Array(width * height);
  for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i++) {
    const coverage = image[4 * i + 3] / 255;
    if (!coverage) continue;
    let d = coverage < 1 ? Math.round(3 * coverage) : limit;
    if (x) d = Math.min(d, distance[i - 1] + 3);
    if (y) {
      d = Math.min(d, distance[i - width] + 3);
      if (x) d = Math.min(d, distance[i - width - 1] + 4);
      if (x + 1 < width) d = Math.min(d, distance[i - width + 1] + 4);
    }
    distance[i] = d;
  }
  for (let y = height - 1, i = distance.length - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--, i--) {
    let d = distance[i];
    if (!d && !image[4 * i + 3]) continue;
    if (x + 1 < width) d = Math.min(d, distance[i + 1] + 3);
    if (y + 1 < height) {
      d = Math.min(d, distance[i + width] + 3);
      if (x) d = Math.min(d, distance[i + width - 1] + 4);
      if (x + 1 < width) d = Math.min(d, distance[i + width + 1] + 4);
    }
    distance[i] = d;
    const t = Math.min(1, d / limit);
    image[4 * i + 3] *= t * t * (3 - 2 * t);
  }
}

export function bakeFlameSample(sample, origin, range, light, edges, mask, map, scale, falloff, feather) {
  const polygon = visibilityPolygon(sample, range + Math.hypot(sample[0] - origin[0], sample[1] - origin[1]),
    edges, light.direction, light.aperture, mask);
  let left = origin[0], right = left, top = origin[1], bottom = top;
  const path = new Path2D();
  path.moveTo(...polygon[0]);
  for (const [x, y] of polygon) {
    path.lineTo(x, y);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  path.closePath();
  left = Math.max(0, Math.floor(left * scale) - 1);
  top = Math.max(0, Math.floor(top * scale) - 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(Math.ceil(map.width * scale), Math.ceil(right * scale) + 1) - left);
  canvas.height = Math.max(1, Math.min(Math.ceil(map.height * scale), Math.ceil(bottom * scale) + 1) - top);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(scale, 0, 0, scale, -left, -top);
  ctx.fillStyle = '#fff';
  ctx.fill(path);
  const coverage = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // The raster mask is authoritative even at sub-pixel polygon corners.
  for (let y = 0, i = 0; y < canvas.height; y++) {
    const row = Math.floor((top + y + .5) / (scale * mask.dy)) * mask.width;
    for (let x = 0; x < canvas.width; x++, i++) {
      const col = Math.floor((left + x + .5) / (scale * mask.dx));
      if (!mask.cells[row + col]) coverage.data[i * 4 + 3] = 0;
    }
  }
  featherVisibility(coverage.data, canvas.width, canvas.height, feather * scale);
  ctx.resetTransform();
  ctx.putImageData(coverage, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, -left, -top);
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(falloff, origin[0] - range, origin[1] - range, 2 * range, 2 * range);
  return { canvas, x: left / scale, y: top / scale };
}
