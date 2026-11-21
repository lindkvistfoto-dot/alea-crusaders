import { expect, it } from 'vitest';
import { paintedEdge, wallIllumination, wallStrip } from '../features/map/kartakademin-surfaces.js';
import { createMask } from '../features/map/kartakademin-mask.js';
import { blockers, canMove } from '../features/map/kartakademin-geometry.js';

const points = [[5,30],[115,30]];
const wall = {points, face:paintedEdge(points,[42,22]), light:true, movement:true, closed:false};
const strip = wallStrip(wall);
const mask = createMask(120,100);
mask.cells.fill(1);
const source = {origin:[45,38], direction:[0,-1], aperture:360, range:58, width:24, softness:.2};
const receive = (s, at, edges=blockers([wall],'light'), raster=mask) =>
  wallIllumination(strip,at,s,edges,raster);

it('keeps signed image depth independent of drawing direction and rejects degenerate strokes', () => {
  expect(wall.face).toEqual([[5,22],[115,22]]);
  expect(paintedEdge([...points].reverse(),[80,22])).toEqual([...wall.face].reverse());
  expect(paintedEdge([points[0],points[0]],[10,18])).toBeNull();
  expect(paintedEdge(points,[50,30])).toBeNull();
  expect(wallStrip({...wall,closed:true})).toBeNull();
});

it('a moving torch reaches the facing strip along its foot and cannot light it from behind', () => {
  expect(receive(source,40)).toBeGreaterThan(.75);
  expect(receive({...source,origin:[85,38]},40)).toBeLessThan(.2);
  expect(receive({...source,origin:[85,38]},80)).toBeGreaterThan(.75);
  expect(receive({...source,origin:[45,15]},40)).toBe(0);
  expect(receive({...source,origin:[45,96]},40)).toBe(0);
  expect(receive(source,40,[[[0,34],[120,34]]])).toBe(0);
  const raster = createMask(120,100);
  raster.cells.fill(1); raster.cells.fill(0,34*120,35*120);
  expect(receive(source,40,[],raster)).toBe(0);
  expect(canMove([wall],[45,38],[45,22])).toBe(false);
});

it('uses direction, width and blockers for beams and supports a differently oriented wall', () => {
  expect(receive({...source,beam:'parallel'},40)).toBeGreaterThan(.9);
  expect(receive({...source,beam:'parallel'},70)).toBe(0);
  expect(receive({...source,beam:'parallel'},40,[[[0,34],[120,34]]])).toBe(0);
  expect(receive({...source,direction:[0,1],aperture:60},40)).toBe(0);
  const vertical = [[30,5],[30,95]];
  const side = wallStrip({points:vertical,face:paintedEdge(vertical,[22,32])});
  expect(wallIllumination(side,40,{...source,origin:[38,45]},[],mask)).toBeGreaterThan(.75);
});

it('permits a path down a 1.8 m corridor even when its centre misses a hex centre', () => {
  const walls = [0,1.8].map(x => ({points:[[x,0],[x,8]],movement:true,closed:false}));
  expect(canMove(walls,[.82,.3],[.82,7.7])).toBe(true);
  expect(canMove(walls,[.82,3],[2,4])).toBe(false);
});
