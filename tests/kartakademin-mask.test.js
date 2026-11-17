import { expect, it } from 'vitest';
import { contains, visibilityPolygon, canMove } from '../features/map/kartakademin-geometry.js';
import { createMask, floodMask, isFree, maskHistory, paintMask, polygonMask, prepareFreeSight, serializeMask, traceFree } from '../features/map/kartakademin-mask.js';

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
