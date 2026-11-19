import { unobstructedDistance, visibilityPolygon } from './kartakademin-geometry.js';

// Four adjoining quarters of a finite flame. Changing their contribution
// moves its luminous centre continuously while the fixture stays in place.
const quarters = [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]];
export const flames = {
  fackla: { swing: .05, motion: .18 },
  lykta: { swing: .018, motion: .06 },
  eldstad: { swing: .08, motion: .22 },
};

export function flameWeights(phase, motion, preset) {
  const amount = Math.min(1, Math.max(0, motion / preset.motion));
  const x = .78 * Math.sin(phase * .31) + .22 * Math.sin(phase);
  const y = .78 * Math.cos(phase * .31) + .22 * Math.cos(phase);
  const right = (1 + amount * x) / 2;
  const bottom = (1 + amount * y) / 2;
  return [(1-right)*(1-bottom), right*(1-bottom), (1-right)*bottom, right*bottom];
}

export function flameOrigins(origin, pixelsPerMeter, preset, edges, mask) {
  const halfWidth = 2 * preset.swing * pixelsPerMeter;
  return [-1, 0, 1].flatMap(y => [-1, 0, 1].map(x => {
    const length = Math.hypot(x, y);
    if (!length) return origin;
    const dx = x / length, dy = y / length;
    const radius = halfWidth * length;
    // A virtual origin cannot jump across even a one-cell or open vector wall.
    const safe = unobstructedDistance(origin, dx, dy, radius, edges, mask);
    const distance = safe < radius ? Math.max(0, safe - 1e-5) : safe;
    return [origin[0] + distance * dx, origin[1] + distance * dy];
  }));
}

// Signed distance in thirds of a texture pixel. A boundary sits between
// neighbouring pixel centres. The two chamfer passes also handle concave corners.
function signedDistances(alpha, width, height) {
  const distance = new Int16Array(width * height);
  function visit(i, j, step) {
    const sameSide = (alpha[i] >= 128) === (alpha[j] >= 128);
    return sameSide ? distance[j] + step : step / 2;
  }
  for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i++) {
    const a = alpha[i];
    let d = a === 0 || a === 255 ? 32000 : Math.abs(a / 255 - .5) * 3;
    if (x) d = Math.min(d, visit(i, i - 1, 3));
    if (y) {
      d = Math.min(d, visit(i, i - width, 3));
      if (x) d = Math.min(d, visit(i, i - width - 1, 4));
      if (x + 1 < width) d = Math.min(d, visit(i, i - width + 1, 4));
    }
    distance[i] = Math.round(d);
  }
  for (let y = height - 1, i = distance.length - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--, i--) {
    let d = distance[i];
    if (x + 1 < width) d = Math.min(d, visit(i, i + 1, 3));
    if (y + 1 < height) {
      d = Math.min(d, visit(i, i + width, 3));
      if (x) d = Math.min(d, visit(i, i + width - 1, 4));
      if (x + 1 < width) d = Math.min(d, visit(i, i + width + 1, 4));
    }
    distance[i] = Math.round(d);
  }
  for (let i = 0; i < distance.length; i++) if (alpha[i] < 128) distance[i] *= -1;
  return distance;
}

// A line cutting a triangle leaves a smaller triangle on the odd vertex's
// side. Its area fraction is the product of the two edge fractions.
export function visibleArea(a, b, c) {
  const lit = Number(a > 0) + Number(b > 0) + Number(c > 0);
  if (lit === 0) return 0;
  if (lit === 3) return 1;
  if ((a > 0) === (b > 0)) [a, c] = [c, a];
  else if ((a > 0) === (c > 0)) [a, b] = [b, a];
  if (a === 0) return 1;
  const cap = (a / (a - b)) * (a / (a - c));
  return lit === 1 ? cap : 1 - cap;
}

export function bakeFlameParts(origin, range, light, edges, mask, map, scale, falloff, ppm) {
  const preset = flames[light.type];
  const samples = flameOrigins(origin, ppm, preset, edges, mask);
  let left = origin[0], right = left, top = origin[1], bottom = top;
  const paths = samples.map(sample => {
    const reach = range + Math.hypot(sample[0] - origin[0], sample[1] - origin[1]);
    const polygon = visibilityPolygon(sample, reach, edges, light.direction, light.aperture, mask, true);
    const path = new Path2D();
    path.moveTo(...polygon[0]);
    for (const [x, y] of polygon) {
      path.lineTo(x, y);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    path.closePath();
    return path;
  });
  left = Math.max(0, Math.floor(left * scale) - 1);
  top = Math.max(0, Math.floor(top * scale) - 1);
  const width = Math.max(1, Math.min(Math.ceil(map.width * scale), Math.ceil(right * scale) + 1) - left);
  const height = Math.max(1, Math.min(Math.ceil(map.height * scale), Math.ceil(bottom * scale) + 1) - top);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(scale, 0, 0, scale, -left, -top);
  const distances = paths.map(path => {
    ctx.clearRect(left / scale, top / scale, width / scale, height / scale);
    ctx.fill(path);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (let y = 0, i = 0; y < height; y++) {
      const row = Math.floor((top + y + .5) / (scale * mask.dy)) * mask.width;
      for (let x = 0; x < width; x++, i++) {
        const col = Math.floor((left + x + .5) / (scale * mask.dx));
        if (mask.cells[row + col]) alpha[i] = rgba[4 * i + 3];
      }
    }
    return signedDistances(alpha, width, height);
  });
  // Integrate a finite flame face at each station instead of overlaying
  // sharp silhouettes. No station can illuminate a pixel hidden from all rays.
  const contact = Math.max(1, 3 * scale * Math.min(.015 * range, .65 * preset.swing * ppm));
  return quarters.map(indices => {
    const [nw, ne, se, sw] = indices.map(i => distances[i]);
    const result = document.createElement('canvas');
    result.width = width; result.height = height;
    const out = result.getContext('2d');
    const image = out.createImageData(width, height);
    for (let i = 0; i < nw.length; i++) {
      const a = nw[i], b = ne[i], c = se[i], d = sw[i];
      const farthest = Math.max(a, b, c, d);
      if (farthest <= 0) continue;
      const t = Math.min(1, farthest / contact);
      // Average both triangulations to avoid favouring either diagonal.
      const area = Math.min(a,b,c,d) > 0 ? 1 :
        (visibleArea(a,b,c) + visibleArea(a,c,d) + visibleArea(a,b,d) + visibleArea(b,c,d)) / 4;
      image.data[i * 4 + 3] = 255 * area * t * t * (3 - 2 * t);
    }
    out.putImageData(image, 0, 0);
    out.setTransform(scale, 0, 0, scale, -left, -top);
    out.globalCompositeOperation = 'source-in';
    out.drawImage(falloff, origin[0] - range, origin[1] - range, 2 * range, 2 * range);
    return { canvas: result, x: left / scale, y: top / scale };
  });
}
