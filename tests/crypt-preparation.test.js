import {expect,it} from 'vitest';
import {DEFAULT_CRYPT_MAP, validateMap} from '../features/crypt/scene.js';
import {prepareCryptMap, previewDoorFootprint} from '../features/crypt/preparation.js';

it('retains both place IDs, the outside walls and shared doorway at both ends of the adjustment',()=>{
  for (const splitX of [430,500,570]) {
    const map=prepareCryptMap(DEFAULT_CRYPT_MAP,{splitX,pixelsPerMeter:40});
    expect(validateMap(map).rooms.map(room=>room.id)).toEqual(['west','east']);
    expect(map.rooms[0].x).toBe(70);
    expect(map.rooms[1].x+map.rooms[1].width).toBe(930);
    expect(map.door.x).toBe(splitX);
    expect(map.door.endX).toBe(splitX);
    expect(map.pixelsPerMeter).toBe(40);
  }
  expect(DEFAULT_CRYPT_MAP.door.x).toBe(500);
});

it('shows the width of a full footprint at the opening independently of its artwork',()=>{
  const api=globalThis.aleaMapGrid;
  expect(previewDoorFootprint(DEFAULT_CRYPT_MAP,'single',api).fits).toBe(true);
  expect(previewDoorFootprint(DEFAULT_CRYPT_MAP,'giant7',api)).toMatchObject({fits:false});
  const wider=prepareCryptMap(DEFAULT_CRYPT_MAP,{splitX:500,pixelsPerMeter:16});
  expect(previewDoorFootprint(wider,'giant7',api).fits).toBe(true);
  expect(previewDoorFootprint(wider,'triangle3',api).polygons).toHaveLength(3);
});
