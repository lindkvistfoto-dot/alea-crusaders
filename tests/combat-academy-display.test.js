import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { pointIsExplored } from '../features/map/kartakademin-geometry.js';

const runtime = readFileSync(new URL('../features/combat/runtime.js', import.meta.url), 'utf8');
const footprint = readFileSync(new URL('../features/combat/footprint.js', import.meta.url), 'utf8');
const source = (from, until) => runtime.slice(runtime.indexOf(from), runtime.indexOf(until, runtime.indexOf(from) + 1));
const board = source('const combatExploredPoints=', 'function combatMapPresetsHtml');
const camera = source('function combatMapZoomAt(', 'function combatMapZoomStep(');
const room = (status, x, width) => ({ status, shape_type:'rect', shape_data:{x, y:0, width, height:200} });

it('rejects anchors and map actions in unvisited, concealed or overlapping rooms', () => {
  const areas = [
    room('explored', 0, 300),
    room('unknown', 110, 80),
    { status:'unexplored', shape_type:'polygon', shape_data:{ points:[[190,0],[260,0],[260,90],[190,90]] } },
  ];
  const scene = { areas, manager:false };
  const context = {
    window:{ aleaKartakademin:{pointIsExplored} }, combatRuntimeMapMeta:scene,
    combatSvgPoint:event => ({x:event.clientX,y:event.clientY}),
  };
  runInNewContext(footprint + board + source('function combatNearestRuntimeCell(', 'function combatMovementDragStart('), context);
  const g = context.combatMapHexGeometry({width:400,height:200},{academy_map:true,pixels_per_meter:40,hex_m:1.5,offset_x:15,offset_y:30});
  context.combatRuntimeGeometry=()=>g;
  expect(context.combatNearestRuntimeCell({x:75,y:30})).toMatchObject({q:1,r:0,x:75,y:30});
  expect(context.combatNearestRuntimeCell({x:135,y:30})).toBe(null);
  expect(context.combatNearestRuntimeCell({x:-10,y:30})).toBe(null);
  const visible = {q:1,r:0}; // centre (75, 30)
  expect(context.combatAcademyActorVisible(visible,scene,g)).toBe(true);
  expect(context.combatAcademyActorVisible({...visible,visible_to_players:false},scene,g)).toBe(false);
  const click = x => {
    const event = {clientX:x,clientY:30,stopImmediatePropagation:vi.fn(),preventDefault:vi.fn()};
    context.combatRestrictMapInput(event);
    return event.defaultPrevented || event.preventDefault.mock.calls.length > 0;
  };
  expect(click(75)).toBe(false);
  expect(click(135)).toBe(true);
  expect(click(240)).toBe(true);
  expect(click(320)).toBe(true);
  // Discovery can change during a fight without stale per-coordinate answers.
  scene.areas=[room('explored',0,400)];
  expect(click(135)).toBe(false);
});

it('keeps the original map pixel under a wheel gesture on a letterboxed mobile map', () => {
  const rect={left:20,top:10,width:400,height:400};
  // A 2:1 image fills only the middle 200 screen pixels in the square viewport.
  const context = {
    document:{querySelector:()=>({getBoundingClientRect:()=>rect})},
    combatMapViewGeometry:()=>({width:800,height:400}), combatMapEnsureView:()=>{},combatMapApplyView:()=>{},
    combatMapViewBox:()=>({x:0,y:0,width:800,height:400}),combatMapView:{x:0,y:0,zoom:1},
    COMBAT_MAP_MAX_ZOOM:8,
  };
  runInNewContext(camera,context);
  context.combatMapZoomAt(320,160,2);
  expect(context.combatMapView).toEqual({zoom:2,x:300,y:50});
  // (600,100) is at 75% across and 25% down both views.
  expect([300 + .75 * 400, 50 + .25 * 200]).toEqual([600,100]);
});

it('keeps a temporary shared lighting change on the selected combat instance and detects concurrent updates', async () => {
  const fight={id:'battle',updated_at:'2026-11-19T20:00:00Z',status:'active',
    settings:{academy_map:true,scene_id:'encounter',pixels_per_meter:40}};
  const context={
    activeCombat:fight,combatCanManage:()=>true,combatMapLightSavePending:false,renderCombat:vi.fn(),
    dbJson:vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),alert:vi.fn(),loadActiveCombat:vi.fn(),
  };
  runInNewContext(source('async function combatSetMapLightsOut(', 'function combatSlBoardModuleHtml'),context);
  await context.combatSetMapLightsOut(true);
  const [query, request] = context.dbJson.mock.calls[0];
  expect(query).toBe('rpc/set_combat_map_lights_out');
  expect(JSON.parse(request.body)).toEqual({p_combat_id:'battle',p_expected:false,p_lights_out:true});
  expect(fight.settings.map_lights_out).toBeUndefined();
  await context.combatSetMapLightsOut(false);
  expect(context.alert).toHaveBeenCalledWith(expect.stringContaining('stridsläget har ändrats'));
  expect(context.loadActiveCombat).toHaveBeenCalledTimes(2);
  context.combatCanManage=()=>false;
  await context.combatSetMapLightsOut(true);
  expect(context.dbJson).toHaveBeenCalledTimes(2);
});
