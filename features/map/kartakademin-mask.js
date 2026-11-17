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

function colorDistance(rgba, first, second) {
  const a = first * 4, b = second * 4;
  return (rgba[a] - rgba[b]) ** 2 + (rgba[a + 1] - rgba[b + 1]) ** 2 + (rgba[a + 2] - rgba[b + 2]) ** 2;
}

const colorLimit = percent => 3 * (255 * percent / 100) ** 2;

export function wallPixels({ width, height }, rgba, sensitivity) {
  const ridges = new Uint8Array(width * height);
  const walls = new Uint8Array(ridges.length);
  const cutoff = colorLimit(22 - sensitivity * .20);
  const axes = [[1,0], [0,1], [-1,1], [1,1]];
  for (let axis = 0; axis < axes.length; axis++) {
    const [dx, dy] = axes[axis];
    const step = dy * width + dx;
    const flag = 1 << axis;
    for (let y = dy; y < height - dy; y++) for (let x = Math.abs(dx); x < width - Math.abs(dx); x++) {
      const index = y * width + x;
      if (colorDistance(rgba, index, index - step) >= cutoff &&
          colorDistance(rgba, index, index + step) >= cutoff &&
          colorDistance(rgba, index - step, index + step) < cutoff) ridges[index] |= flag;
    }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (!ridges[index]) continue;
    for (let axis = 0; axis < axes.length; axis++) {
      const flag = 1 << axis;
      if (!(ridges[index] & flag)) continue;
      const [dx, dy] = axes[axis];
      for (const sign of [-1, 1]) {
        const col = x - sign * dy, row = y + sign * dx;
        if (col < 0 || col >= width || row < 0 || row >= height) continue;
        const neighbor = row * width + col;
        if ((ridges[neighbor] & flag) && colorDistance(rgba, index, neighbor) < cutoff) walls[index] = 1;
      }
    }
  }
  return walls;
}

function floodSelection(mask, rgba, point, options, walls) {
  const { width, height, cells, dx, dy } = mask;
  const selected = new Uint8Array(cells.length);
  const x = Math.floor(point[0] / dx), y = Math.floor(point[1] / dy);
  if (x < 0 || y < 0 || x >= width || y >= height) return { selected, seed: -1 };
  const seed = y * width + x;
  const queue = new Int32Array(cells.length);
  let cursor = 0, end = 0;
  const color = colorLimit(options.colorTolerance);
  const edge = colorLimit(options.edgeTolerance ?? 100);
  function enqueue(index, from) {
    if (selected[index] || walls?.[index] || rgba[index * 4 + 3] === 0) return;
    if (colorDistance(rgba, seed, index) > color || colorDistance(rgba, from, index) > edge) return;
    selected[index] = 1;
    queue[end++] = index;
  }
  enqueue(seed, seed);
  while (cursor < end) {
    const index = queue[cursor++];
    const col = index % width;
    if (col > 0) enqueue(index - 1, index);
    if (col + 1 < width) enqueue(index + 1, index);
    if (index >= width) enqueue(index - width, index);
    if (index + width < cells.length) enqueue(index + width, index);
  }
  return { selected, seed };
}

function smoothSelection({ width, height }, selected, seed, passes) {
  for (let pass = 0; pass < passes; pass++) {
    const next = selected.slice();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!selected[index] || index === seed) continue;
      const left = selected[index - 1], right = selected[index + 1];
      const above = selected[index - width], below = selected[index + width];
      const adjacent = left + right + above + below;
      const backedCorner = adjacent === 2 && left !== right && above !== below &&
        selected[index + (left ? -1 : 1) + (above ? -width : width)];
      if (adjacent <= 1 || backedCorner) next[index] = 0;
    }
    selected = next;
  }
  return selected;
}

function fillEnclosed({ width, height }, result, selected, rgba, walls, maximum) {
  const visited = new Uint8Array(result.length);
  const queue = new Int32Array(result.length);
  for (let start = 0; start < result.length; start++) {
    if (result[start] || visited[start]) continue;
    let cursor = 0, end = 1, exterior = false, touchesSelection = false, protectedCell = false;
    visited[start] = 1;
    queue[0] = start;
    while (cursor < end) {
      const index = queue[cursor++], y = Math.floor(index / width), x = index % width;
      exterior ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      protectedCell ||= !!walls?.[index] || rgba[index * 4 + 3] === 0;
      for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++) {
        for (let col = Math.max(0, x - 1); col <= Math.min(width - 1, x + 1); col++) {
          const neighbor = row * width + col;
          if (result[neighbor]) {
            touchesSelection ||= !!selected[neighbor];
          } else if (!visited[neighbor]) {
            visited[neighbor] = 1;
            queue[end++] = neighbor;
          }
        }
      }
    }
    if (!exterior && !protectedCell && touchesSelection && end <= maximum) {
      for (let i = 0; i < end; i++) result[queue[i]] = 1;
    }
  }
}

export function previewFlood(mask, rgba, point, options, walls) {
  const detected = options.detectWalls ? walls ?? wallPixels(mask, rgba, options.wallSensitivity) : null;
  const { selected, seed } = floodSelection(mask, rgba, point, options, detected);
  const smoothed = smoothSelection(mask, selected, seed, options.smoothing ?? 0);
  const result = mask.cells.slice();
  for (let i = 0; i < result.length; i++) result[i] |= smoothed[i];
  if (options.maxHoleSize > 0 && smoothed[seed]) fillEnclosed(mask, result, smoothed, rgba, detected, options.maxHoleSize);
  return result;
}


export function floodMask(mask, rgba, point, tolerance) {
  mask.cells.set(previewFlood(mask, rgba, point, { colorTolerance: tolerance }));
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
