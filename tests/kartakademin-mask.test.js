import { expect, it } from 'vitest';
import { contains, visibilityPolygon, canMove } from '../features/map/kartakademin-geometry.js';
import { createMask, findSmallSolidIslands, floodMask, isFree, previewFlood, maskHistory, paintMask, polygonMask, prepareFreeSight, serializeMask, traceFree } from '../features/map/kartakademin-mask.js';

const rect = (x, y, w, h) => [[x,y], [x+w,y], [x+w,y+h], [x,y+h]];

it('flood-fyller fyra grannar med färgtolerans och respekterar transparens', () => {
  const mask = createMask(3, 2);
  const image = Uint8ClampedArray.from([100, 110, 200, 100, 120, 100].flatMap((gray, i) => [gray, gray, gray, i === 4 ? 0 : 255]));
  floodMask(mask, image, [.5,.5], 2);
  expect([...mask.cells]).toEqual([1,0,0,1,0,0]);
  floodMask(mask, image, [.5,.5], 5);
  expect([...mask.cells]).toEqual([1,1,0,1,0,0]);
});

it('målar sammanhängande drag, suddar, ångrar och gör om i kartkoordinater', () => {
  const mask = createMask(12, 8);
  const history = maskHistory(mask.cells);
  const before = mask.cells.slice();
  paintMask(mask, [.5,3.5], [10.5,3.5], 1, 1);
  history.record(before);
  const painted = mask.cells.slice();
  paintMask(mask, [5.5,3.5], [5.5,3.5], 1, 0);
  history.record(painted);
  expect(isFree(mask,[5.5,3.5])).toBe(false);
  expect(history.undo()).toBe(true);
  expect(isFree(mask,[5.5,3.5])).toBe(true);
  expect(history.redo()).toBe(true);
  expect(isFree(mask,[5.5,3.5])).toBe(false);
  expect(isFree(mask,[8.5,3.5])).toBe(true);
});

it('sparar och återöppnar tillagda och borttagna polygoner inklusive hål', () => {
  const mask = createMask(12, 8);
  polygonMask(mask, rect(1, 1, 10, 6), 1);
  polygonMask(mask, rect(3, 3, 2, 2), 0);
  const loaded = createMask(12, 8, JSON.parse(JSON.stringify(serializeMask(mask))));
  expect(loaded.cells).toEqual(mask.cells);
  expect(isFree(loaded,[3.5,3.5])).toBe(false);
  expect(isFree(loaded,[7.5,3.5])).toBe(true);
});

it('ger facklans klippolygon fri passage genom öppningen men skugga bakom Solid', () => {
  const edited = createMask(24, 16);
  polygonMask(edited, rect(1, 1, 10, 14), 1);
  polygonMask(edited, rect(13, 1, 10, 14), 1);
  polygonMask(edited, rect(11, 7, 2, 2), 1);
  const mask = prepareFreeSight(24, 16, serializeMask(edited));
  const polygon = visibilityPolygon([5.5,8], 30, [], 0, 360, mask);
  expect(contains(polygon, [8,8])).toBe(true);
  expect(contains(polygon, [18,8])).toBe(true);
  expect(contains(polygon, [18,3])).toBe(false);
  expect(contains(polygon, [11.5,6])).toBe(false);
  expect(canMove([], [5.5,8], [18,3])).toBe(true);
});

it('släpper inte en stråle diagonalt genom två rum som bara möts i ett hörn', () => {
  const mask = createMask(2, 2);
  mask.cells.set([1,0,0,1]);
  expect(traceFree(mask, [.5,.5], Math.SQRT1_2, Math.SQRT1_2, 3)).toBeCloseTo(Math.SQRT1_2);
});

const grayscale = tones => Uint8ClampedArray.from(tones.flatMap(value => [value, value, value, 255]));

it('skiljer startfärg från den lokala kontrastövergången', () => {
  const mask = createMask(4, 1);
  const image = grayscale([80, 90, 100, 124]);
  const preview = (colorTolerance, edgeTolerance) =>
    [...previewFlood(mask, image, [.5,.5], { colorTolerance, edgeTolerance })];
  expect(preview(30, 5)).toEqual([1,1,1,0]);
  expect(preview(5, 100)).toEqual([1,1,0,0]);
  expect(preview(30, 100)).toEqual([1,1,1,1]);
});

it('detekterar en lågkontrastvägg utan att tillsluta en ritad dörröppning', () => {
  const mask = createMask(7, 5);
  const image = opening => grayscale(Array.from({ length: 35 }, (_, i) => i % 7 === 3 && !(opening && i === 17) ? 110 : 90));
  const options = { colorTolerance: 100, edgeTolerance: 100, detectWalls: true, wallSensitivity: 80 };
  const fill = (opening, overrides = {}) => previewFlood(mask, image(opening), [1.5,2.5], { ...options, ...overrides });
  expect(fill(false)[19]).toBe(0);
  expect(fill(false, { wallSensitivity: 0 })[19]).toBe(1);
  expect(fill(false, { detectWalls: false })[19]).toBe(1);
  expect(fill(true)[19]).toBe(1);
  expect(fill(true)[3]).toBe(0);
});

it('bevarar diagonal Solid vid hög utjämning och tar bort utstickande maskpixlar', () => {
  const mask = createMask(8, 8);
  const image = grayscale(Array.from({ length: 64 }, (_, i) => {
    const x = i % 8, y = Math.floor(i / 8);
    return x < y && (x !== 0 || y !== 5) ? 80 : 180;
  }));
  const base = previewFlood(mask, image, [.5,7.5], { colorTolerance: 0 });
  const smooth = previewFlood(mask, image, [.5,7.5], { colorTolerance: 0, smoothing: 4 });
  expect(smooth.every((value, i) => value <= base[i])).toBe(true);
  const spurImage = grayscale(Array.from({ length: 64 }, (_, i) => [18,19,20,26,27,28,34,35,36,44].includes(i) ? 80 : 180));
  const smoothed = previewFlood(mask, spurImage, [3.5,3.5], { colorTolerance: 0, smoothing: 1 });
  expect(smoothed[44]).toBe(0);
  expect(smoothed[27]).toBe(1);
});

it('fyller små hål men bevarar större hål och diagonal förbindelse mot kartkanten', () => {
  const mask = createMask(9, 7);
  const dark = new Set([0,10,20,25,41,42,50,51]);
  const image = grayscale(Array.from({ length: 63 }, (_, i) => dark.has(i) ? 180 : 80));
  const result = previewFlood(mask, image, [3.5,1.5], { colorTolerance: 0, maxHoleSize: 2 });
  expect(result[25]).toBe(1);
  expect([0,10,20,41,42,50,51].every(i => result[i] === 0)).toBe(true);
  const accepted = prepareFreeSight(9, 7, serializeMask({ ...mask, cells: result }));
  expect(isFree(accepted, [7.5,2.5])).toBe(true);
  expect(isFree(accepted, [5.5,4.5])).toBe(false);
});

it('håller förhandsvisningen utanför historik och sparning tills den accepteras', () => {
  const mask = createMask(3, 1);
  const history = maskHistory(mask.cells);
  const image = grayscale([80,80,160]);
  previewFlood(mask, image, [.5,.5], { colorTolerance: 100 });
  expect(serializeMask(mask).runs).toEqual([]);
  expect(history.canUndo()).toBe(false);
  const accepted = previewFlood(mask, image, [.5,.5], { colorTolerance: 0 });
  const before = mask.cells.slice();
  mask.cells.set(accepted);
  history.record(before);
  expect(serializeMask(mask).runs).toEqual([[0,2]]);
  expect(history.undo()).toBe(true);
  expect(serializeMask(mask).runs).toEqual([]);
  expect(history.redo()).toBe(true);
  expect(createMask(3, 1, serializeMask(mask)).cells).toEqual(accepted);
});

it('släpper ljus förbi en fylld falsk Solid-ö i den återlästa masken', () => {
  const mask = createMask(9, 5);
  const image = grayscale(Array.from({ length: 45 }, (_, i) => i === 22 ? 160 : 80));
  const trace = maxHoleSize => {
    const cells = previewFlood(mask, image, [2.5,2.5], { colorTolerance: 0, maxHoleSize });
    const saved = prepareFreeSight(9, 5, serializeMask({ ...mask, cells }));
    return visibilityPolygon([2.5,2.5], 8, [], 0, 360, saved);
  };
  expect(contains(trace(0), [6.5,2.5])).toBe(false);
  expect(contains(trace(1), [6.5,2.5])).toBe(true);
});

it('markerar små inneslutna Solid-fläckar utan att redigera masken', () => {
  const mask = createMask(8, 8);
  mask.cells.fill(1);
  for (const index of [0, 9, 21, 35, 36]) mask.cells[index] = 0;
  const before = mask.cells.slice();
  expect(findSmallSolidIslands(mask, 1)).toEqual([[5.5, 2.5, 1]]);
  expect(findSmallSolidIslands(mask, 2)).toEqual([[5.5, 2.5, 1], [4, 4.5, 2]]);
  expect(mask.cells).toEqual(before);
});
