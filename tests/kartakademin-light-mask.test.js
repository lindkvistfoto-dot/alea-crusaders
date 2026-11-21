import { expect, it } from 'vitest';
import { contains, visibilityPolygon } from '../features/map/kartakademin-geometry.js';
import { createMask, floodMask, maskHistory, paintMask, polygonMask, prepareFreeSight, serializeMask, traceFree } from '../features/map/kartakademin-mask.js';
import { FREE_SIGHT_RESET_CONFIRMATION, FREE_SIGHT_RESET_LABEL, removalConfirmation, resetFreeSight, toolsForMode } from '../features/map/kartakademin-actions.js';

function grid(width, height, rows) {
  const mask = createMask(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    mask.cells[y * width + x] = rows[y]?.[x] === '.' ? 1 : 0;
  }
  return prepareFreeSight(width, height, serializeMask(mask));
}

it('keeps a full rectangular mask aligned with every light ray', () => {
  const mask = grid(20, 12, Array(12).fill('.'.repeat(20)));
  const polygon = visibilityPolygon([10, 6], 100, [], 0, 360, mask);
  for (const point of [[10, 6], [12, 6], [10, 10], [5, 6], [15, 3]]) expect(contains(polygon, point)).toBe(true);
  expect(contains(polygon, [-1, 2])).toBe(false);
  for (let i = 0; i < 360; i++) {
    const angle = i * Math.PI / 180;
    const distance = traceFree(mask, [10, 6], Math.cos(angle), Math.sin(angle), 100);
    expect(distance).toBeGreaterThan(3.9);
  }
});

it('keeps light inside a narrow corridor and stops it at the same solid boundary as the mask', () => {
  const rows = Array.from({ length: 9 }, (_, y) => y === 4 ? '#'.repeat(2) + '.'.repeat(16) + '#'.repeat(2) : '#'.repeat(20));
  const mask = grid(20, 9, rows);
  const polygon = visibilityPolygon([2.5, 4.5], 30, [], 0, 360, mask);
  expect(traceFree(mask, [2.5, 4.5], 1, 0, 30)).toBeCloseTo(15.5);
  expect(traceFree(mask, [2.5, 4.5], 0, 1, 30)).toBeCloseTo(.5);
  expect(contains(polygon, [17.5, 4.5])).toBe(true);
  expect(contains(polygon, [2.5, 6.5])).toBe(false);
});

it('keeps an accepted isolated Solid pixel as an occluder instead of drawing light through it', () => {
  const open = createMask(20, 12);
  open.cells.fill(1);
  const clean = prepareFreeSight(20, 12, serializeMask(open));
  const speckled = createMask(20, 12);
  speckled.cells.fill(1);
  speckled.cells[6 * 20 + 10] = 0;
  const accepted = prepareFreeSight(20, 12, serializeMask(speckled));
  const source = [5.5, 6.5];
  const cleanLight = visibilityPolygon(source, 20, [], 0, 360, clean);
  const acceptedLight = visibilityPolygon(source, 20, [], 0, 360, accepted);
  expect(contains(cleanLight, [14.5, 6.5])).toBe(true);
  expect(contains(acceptedLight, [14.5, 6.5])).toBe(false);
  expect(traceFree(accepted, source, 1, 0, 20)).toBeCloseTo(4.5);
});

it('carries the current mask through connected cave rooms without lighting through solid walls', () => {
  const rows = [
    '##############',
    '#....#########',
    '#....####....#',
    '#....####....#',
    '#............#',
    '#....####....#',
    '#....####....#',
    '##############',
  ];
  const mask = grid(14, 8, rows);
  const polygon = visibilityPolygon([2.5, 4.5], 20, [], 0, 360, mask);
  expect(contains(polygon, [11.5, 4.5])).toBe(true);
  expect(contains(polygon, [11.5, 2.5])).toBe(false);
  expect(traceFree(mask, [2.5, 4.5], 1, 0, 20)).toBeCloseTo(10.5);
});

it('uses the newly accepted flood, brush, and polygon mask immediately', () => {
  const mask = createMask(12, 8);
  const image = new Uint8ClampedArray(12 * 8 * 4);
  for (let index = 0; index < 12 * 8; index++) {
    const value = index % 12 < 6 ? 100 : 220;
    image.set([value, value, value, 255], index * 4);
  }
  floodMask(mask, image, [2.5, 3.5], 5);
  paintMask(mask, [6.5, 3.5], [6.5, 3.5], .2, 1);
  polygonMask(mask, [[7, 1], [11, 1], [11, 7], [7, 7]], 1);

  const accepted = serializeMask(mask);
  const prepared = prepareFreeSight(12, 8, accepted);
  expect(prepared.cells).toEqual(mask.cells);
  expect(traceFree(prepared, [2.5, 3.5], 1, 0, 10)).toBeCloseTo(8.5);

  const before = prepared;
  paintMask(mask, [6.5, 3.5], [6.5, 3.5], .2, 0);
  const next = prepareFreeSight(12, 8, serializeMask(mask));
  expect(next).not.toBe(before);
  expect(next.cells).toEqual(mask.cells);
  expect(traceFree(next, [2.5, 3.5], 1, 0, 10)).toBeCloseTo(3.5);
});

it('stops at real diagonal solid even when both side cells are free', () => {
  const mask = grid(2, 2, ['..', '.#']);
  expect(traceFree(mask, [.5, .5], Math.SQRT1_2, Math.SQRT1_2, 3)).toBeCloseTo(Math.SQRT1_2);
});


it('cancels free-sight reset without changing the mask, configuration, or history', async () => {
  const mask = createMask(4, 3);
  mask.cells.fill(1);
  const config = { freeSight: serializeMask(mask), lights: [{ id: 'light-1' }], geometry: [{ id: 'wall-1' }] };
  const original = JSON.stringify(config.freeSight);
  const history = maskHistory(mask.cells);
  const confirmed = await resetFreeSight(mask, history, config, async () => false);

  expect(FREE_SIGHT_RESET_CONFIRMATION).toBe('Vill du ta bort all markerad fri sikt på den här kartan? Hela kartan kommer att återgå till Solid. Ljuskällor, rum och andra kartlager påverkas inte.');
  expect(FREE_SIGHT_RESET_LABEL).toBe('Nollställ fri sikt');
  expect(confirmed).toBe(false);
  expect(JSON.stringify(config.freeSight)).toBe(original);
  expect([...mask.cells]).toEqual(Array(12).fill(1));
  expect(history.canUndo()).toBe(false);
});

it('resets only free sight, supports undo and redo, and reloads as Solid before saving', async () => {
  const mask = createMask(4, 3);
  mask.cells.fill(1);
  const config = { freeSight: serializeMask(mask), lights: [{ id: 'light-1' }], geometry: [{ id: 'wall-1' }] };
  const originalSight = JSON.stringify(config.freeSight);
  const originalLights = JSON.stringify(config.lights);
  const originalGeometry = JSON.stringify(config.geometry);
  const history = maskHistory(mask.cells);
  const persistedBeforeSave = JSON.stringify(config);

  expect(await resetFreeSight(mask, history, config, async () => true)).toBe(true);
  expect([...mask.cells]).toEqual(Array(12).fill(0));
  expect(config.freeSight.runs).toEqual([]);
  expect(JSON.stringify(config.lights)).toBe(originalLights);
  expect(JSON.stringify(config.geometry)).toBe(originalGeometry);
  expect(JSON.stringify(config)).not.toBe(persistedBeforeSave);

  expect(history.undo()).toBe(true);
  config.freeSight = serializeMask(mask);
  expect(JSON.stringify(config.freeSight)).toBe(originalSight);
  expect(history.redo()).toBe(true);
  config.freeSight = serializeMask(mask);
  expect(config.freeSight.runs).toEqual([]);
  const reopened = createMask(4, 3, config.freeSight);
  expect([...reopened.cells]).toEqual(Array(12).fill(0));
  expect(JSON.stringify(config.lights)).toBe(originalLights);
  expect(JSON.stringify(config.geometry)).toBe(originalGeometry);
});


it('uses independent, scoped confirmation copy for each current deletion action', () => {
  expect(removalConfirmation('lights', 'light')).toEqual({
    title: 'Ta bort ljuskälla',
    message: 'Vill du ta bort den valda ljuskällan? Fri sikt, rum och andra kartlager påverkas inte.',
    actionLabel: 'Ta bort ljuskälla',
  });
  expect(removalConfirmation('sight', 'geometry')).toEqual({
    title: 'Ta bort hindergeometri',
    message: 'Vill du ta bort den valda hindergeometrin? Fri sikt, ljuskällor, rum och andra kartlager påverkas inte.',
    actionLabel: 'Ta bort hindergeometri',
  });
  expect(removalConfirmation('lights', 'position')?.actionLabel).toBe('Ta bort kartposition');
  expect(removalConfirmation('rooms', 'room')).toBeNull();
  expect(removalConfirmation('effects', 'effect')).toBeNull();
  expect(removalConfirmation('objects', 'object')).toBeNull();
});

it('keeps editor tools specific to their active mode', () => {
  expect(toolsForMode('sight').map(tool => tool.value)).toEqual(['mask', 'geometry', 'pan']);
  expect(toolsForMode('lights').map(tool => tool.value)).toEqual(['light', 'position', 'surface', 'pan']);
  expect(toolsForMode('rooms').map(tool => tool.value)).toEqual(['room', 'pan']);
  expect(toolsForMode('effects')).toEqual([]);
  expect(toolsForMode('objects')).toEqual([]);
});
