const MAX_SIDE = 1536;

export function createMask(mapWidth, mapHeight, saved) {
  const scale = Math.min(1, MAX_SIDE / Math.max(mapWidth, mapHeight));
  const width = saved?.width ?? Math.max(1, Math.round(mapWidth * scale));
  const height = saved?.height ?? Math.max(1, Math.round(mapHeight * scale));
  const cells = new Uint8Array(width * height);
  for (const [start, length] of saved?.runs ?? []) cells.fill(1, start, start + length);
  return { width, height, cells, dx: mapWidth / width, dy: mapHeight / height };
}

export function serializeMask({ width, height, cells }) {
  const runs = [];
  let index = 0;
  while (index < cells.length) {
    if (!cells[index]) { index++; continue; }
    const start = index++;
    while (cells[index]) index++;
    runs.push([start, index - start]);
  }
  return { width, height, runs };
}

export function floodMask(mask, rgba, point, tolerance) {
  const { width, height, cells, dx, dy } = mask;
  const x = Math.floor(point[0] / dx), y = Math.floor(point[1] / dy);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const start = y * width + x;
  const visited = new Uint8Array(cells.length);
  const queue = new Int32Array(cells.length);
  let cursor = 0, end = 0;
  const limit = 3 * (255 * tolerance / 100) ** 2;
  function enqueue(index) {
    if (visited[index]) return;
    visited[index] = 1;
    const a = start * 4, b = index * 4;
    if (rgba[b + 3] === 0 || (rgba[a] - rgba[b]) ** 2 + (rgba[a + 1] - rgba[b + 1]) ** 2 +
      (rgba[a + 2] - rgba[b + 2]) ** 2 > limit) return;
    queue[end++] = index;
  }
  enqueue(start);
  while (cursor < end) {
    const index = queue[cursor++];
    cells[index] = 1;
    const col = index % width;
    if (col > 0) enqueue(index - 1);
    if (col + 1 < width) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < cells.length) enqueue(index + width);
  }
}

export function paintMask(mask, from, to, radius, value) {
  const { width, height, cells, dx, dy } = mask;
  const vx = to[0] - from[0], vy = to[1] - from[1], length = vx * vx + vy * vy;
  const x0 = Math.max(0, Math.floor((Math.min(from[0], to[0]) - radius) / dx));
  const y0 = Math.max(0, Math.floor((Math.min(from[1], to[1]) - radius) / dy));
  const x1 = Math.min(width - 1, Math.floor((Math.max(from[0], to[0]) + radius) / dx));
  const y1 = Math.min(height - 1, Math.floor((Math.max(from[1], to[1]) + radius) / dy));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = (x + .5) * dx - from[0], py = (y + .5) * dy - from[1];
    const t = length ? Math.max(0, Math.min(1, (px * vx + py * vy) / length)) : 0;
    if ((px - vx * t) ** 2 + (py - vy * t) ** 2 <= radius ** 2) cells[y * width + x] = value;
  }
}

export function polygonMask({ width, height, cells, dx, dy }, points, value) {
  const ys = points.map(p => p[1]);
  const first = Math.max(0, Math.ceil(Math.min(...ys) / dy - .5));
  const last = Math.min(height, Math.ceil(Math.max(...ys) / dy - .5));
  for (let y = first; y < last; y++) {
    const line = (y + .5) * dy;
    const crossings = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
      if ((ay > line) !== (by > line)) crossings.push(ax + (line - ay) * (bx - ax) / (by - ay));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = Math.max(0, Math.ceil(crossings[i] / dx - .5));
      const right = Math.min(width, Math.ceil(crossings[i + 1] / dx - .5));
      cells.fill(value, y * width + left, y * width + right);
    }
  }
}

export function isFree(mask, point) {
  const x = Math.floor(point[0] / mask.dx), y = Math.floor(point[1] / mask.dy);
  return x >= 0 && y >= 0 && x < mask.width && y < mask.height && !!mask.cells[y * mask.width + x];
}

export function maskEdges({ width, height, cells, dx, dy }) {
  const edges = [];
  function sweep(lines, length, sampled, point) {
    for (let line = 0; line <= lines; line++) {
      let start = 0, side = 0;
      for (let i = 0; i <= length; i++) {
        const next = i < length ? sampled(line, i) : 0;
        if (next === side) continue;
        if (side) edges.push([point(start, line), point(i, line)]);
        start = i;
        side = next;
      }
    }
  }
  sweep(height, width, (y, x) => (y < height ? cells[y * width + x] : 0) - (y ? cells[(y - 1) * width + x] : 0),
    (x, y) => [x * dx, y * dy]);
  sweep(width, height, (x, y) => (x < width ? cells[y * width + x] : 0) - (x ? cells[y * width + x - 1] : 0),
    (y, x) => [x * dx, y * dy]);
  return edges;
}

export function maskHistory(cells, limit = 20) {
  const undo = [], redo = [];
  const move = (from, to) => {
    if (!from.length) return false;
    to.push(cells.slice());
    cells.set(from.pop());
    return true;
  };
  return {
    record(before) {
      if (!before.some((cell, index) => cell !== cells[index])) return;
      undo.push(before);
      if (undo.length > limit) undo.shift();
      redo.length = 0;
    },
    undo: () => move(undo, redo),
    redo: () => move(redo, undo),
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
  };
}

const prepared = new WeakMap();
export function prepareFreeSight(mapWidth, mapHeight, saved) {
  if (!saved) return null;
  let mask = prepared.get(saved);
  if (!mask || mask.width * mask.dx !== mapWidth || mask.height * mask.dy !== mapHeight) {
    mask = createMask(mapWidth, mapHeight, saved);
    mask.edges = maskEdges(mask);
    prepared.set(saved, mask);
  }
  return mask;
}

export function traceFree(mask, origin, rayX, rayY, limit) {
  const { width, height, cells, dx, dy } = mask;
  let x = Math.floor(origin[0] / dx), y = Math.floor(origin[1] / dy);
  const stepX = Math.sign(rayX), stepY = Math.sign(rayY);
  const deltaX = rayX ? Math.abs(dx / rayX) : Infinity;
  const deltaY = rayY ? Math.abs(dy / rayY) : Infinity;
  let nextX = rayX ? ((x + (stepX > 0 ? 1 : 0)) * dx - origin[0]) / rayX : Infinity;
  let nextY = rayY ? ((y + (stepY > 0 ? 1 : 0)) * dy - origin[1]) / rayY : Infinity;
  const free = (col, row) => col >= 0 && row >= 0 && col < width && row < height && cells[row * width + col];
  let distance = 0;
  while (free(x, y) && distance < limit) {
    distance = Math.min(nextX, nextY);
    if (distance >= limit) break;
    if (Math.abs(nextX - nextY) < 1e-9) {
      if (!free(x + stepX, y) || !free(x, y + stepY)) break;
      x += stepX;
      y += stepY;
      nextX += deltaX;
      nextY += deltaY;
    } else if (nextX < nextY) {
      x += stepX;
      nextX += deltaX;
    } else {
      y += stepY;
      nextY += deltaY;
    }
  }
  return Math.min(distance, limit);
}
