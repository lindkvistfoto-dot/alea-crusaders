import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const read = name => readFileSync(new URL('../features/combat/' + name + '.js', import.meta.url), 'utf8');
const admin = read('admin-scenes'), runtime = read('runtime');
function section(text, from, to) {
  const begin = text.indexOf(from), end = text.indexOf(to, begin + 1);
  if (begin < 0 || end < 0) throw Error('Missing entry point ' + from);
  return text.slice(begin, end);
}
const map = { id: 'crypt', campaign_id: 'party', name: 'Kryptan', width: 240, height: 120,
  image_path: 'original', pixels_per_meter: 40, player_visible: true };
const config = { pixelsPerMeter: 40, geometry: [], lights: [{ name: 'Hemlig SL-anteckning' }] };
const linked = { id: 'scene', map_id: 'crypt', settings: { academy_map: true, pixels_per_meter: 40 } };
const reads = section(admin, 'async function combatReadCampaignMap', 'function combatSceneLocationOptions');
const creator = section(runtime, 'async function combatCreateRuntimeFromScene', 'async function combatStartScene');
const background = section(runtime, 'let combatBackgroundRequest=', 'function combatRuntimeGeometry');

function encounterHarness() {
  const writes = [], mapRow = { ...map };
  const context = {
    combatLoadSceneRuntimeData: async () => ({ sceneCombatants: [], sceneHexes: [], sources: {} }),
    window: { aleaMapBattleObjects: { load: vi.fn(async () => []) } },
    combatProjectMapHexes: vi.fn(async () => [{ q: 1, r: 0, academy_barriers: { move: 16 } }]),
    dbJson: async (path, options) => {
      if (path === 'rpc/read_battle_player') return null;
      if (path === 'rpc/read_combat_map_source') return config;
      if (options?.method === 'POST') {
        writes.push({ path, row: JSON.parse(options.body) });
        return;
      }
      if (path.startsWith('campaign_maps?')) return [mapRow];
      if (path.startsWith('campaign_map_academy?')) return [{ configuration: config }];
      throw Error(path);
    },
    activeUser: () => ({ id: 'gm' }), centralCampaignId: 'party', crypto,
  };
  runInNewContext(reads + creator, context);
  return { writes, context, mapRow };
}

it('reuses a calibrated map in two independent instances without publishing its private config', async () => {
  const { writes, context } = encounterHarness();
  const a = await context.combatCreateRuntimeFromScene(linked);
  const b = await context.combatCreateRuntimeFromScene(linked);
  expect(a).not.toBe(b);
  expect(writes.map(w => w.path)).toEqual(['combat_instances','combat_hexes','combat_instances','combat_hexes']);
  expect(writes[0].row).toMatchObject({ map_id:'crypt', settings:{ pixels_per_meter:40, background_width:240, background_height:120 } });
  expect(writes[1].row[0]).toMatchObject({ combat_id:a, q:1, r:0, academy_barriers:{ move:16 } });
  expect(writes[3].row[0].combat_id).toBe(b);
  expect(JSON.stringify(writes)).not.toContain('Hemlig');
  expect(context.combatProjectMapHexes).toHaveBeenCalledWith(expect.objectContaining({ map, config }));
});

it('detects recalibration before creating an instance, while old scenes retain their grid and access pattern', async () => {
  const { context, writes, mapRow } = encounterHarness();
  mapRow.pixels_per_meter = 50;
  await expect(context.combatCreateRuntimeFromScene(linked)).rejects.toThrow(/Kartskalan/);
  expect(writes).toEqual([]);
  await context.combatCreateRuntimeFromScene({ ...linked, settings:{ rows:17 } });
  expect(writes.map(w => w.path)).toEqual(['combat_instances']);
  expect(writes[0].row.settings).toMatchObject({ rows:17 });
  expect(context.window.aleaMapBattleObjects.load).not.toHaveBeenCalled();
});

it('loads player-approved layers only, clears them on a hidden map and discards a late GM response', async () => {
  let manager = false, visible = true, release;
  const approved = { freeSight: { runs: [] }, lights: [] }, calls = [];
  const context = {
    centralCampaignId:'party', supabaseSession:{user:{id:'player'}}, activeCombat:{ ...linked, id:'battle', settings:{...linked.settings, background_width:240,background_height:120} }, combatCanManage:() => manager,
    window:{ aleaMapBattleObjects:{ load: async () => [] } }, console:{ error:()=>{} },
    getMapImageUrl: async () => 'blob:crypt', loadCampaignMapAreas: async () => [],
    dbJson: async (path) => {
      calls.push(path);
      if (path.startsWith('campaign_maps?')) return visible ? [map] : [];
      if (path === 'rpc/read_combat_map_academy_player') return approved;
      if (path === 'rpc/read_combat_map_source') return new Promise(resolve => { release=resolve });
      throw Error(path);
    }
  };
  runInNewContext(reads + background, context);
  await context.loadCombatRuntimeBackground();
  expect(context.combatRuntimeMapMeta.config.lights).toEqual([]);
  expect(calls.some(path => path.startsWith('campaign_map_academy?'))).toBe(false);
  expect(calls[0]).toContain('player_visible=is.true');
  manager=true;
  const pending=context.loadCombatRuntimeBackground();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  visible=false; manager=false;
  await context.loadCombatRuntimeBackground();
  expect(context.combatRuntimeMapUrl).toBe('');
  expect(context.combatRuntimeMapMeta).toBe(null);
  release([{ configuration:config }]);
  await pending;
  expect(context.combatRuntimeMapMeta).toBe(null);
  expect(context.combatRuntimeMapError).toMatch(/inte tillgänglig/);
});

it('selects an existing map through the scene editor and retains placements if a swap is cancelled', async () => {
  const st = { settings:{ rows:30 }, hexes:new Map(), selected:new Set(), mapId:'', imageUrl:'' };
  const notice = vi.fn(), loadImage = vi.fn(), clear = vi.fn();
  const context = {
    eventCombatEditorState:st,centralCampaignId:'party',combatReadCampaignMap:vi.fn(async()=>map),
    combatReadAcademyConfig:vi.fn(async()=>config),renderEventCombatMapEditor:vi.fn(),
    sceneHasCombatantPlacements:()=>false,clearAllSceneCombatantPlacements:clear,
    askConfirm: vi.fn(async()=>false),loadEventCombatEditorMapImage:loadImage,alert:notice
  };
  runInNewContext(section(admin,'function combatCampaignMapScale','function combatSceneLocationOptions')+
    section(admin,'async function changeEventCombatMap(','function eventCombatImageMeta'),context);
  expect(await context.changeEventCombatMap('crypt')).toBe(true);
  expect(st).toMatchObject({mapId:'crypt',settings:{academy_map:true,pixels_per_meter:40,map_height_m:3}});
  expect(loadImage).toHaveBeenCalledWith('crypt',{map,config});
  st.hexes.set('2,1',{movement_mode:'difficult'});
  expect(await context.changeEventCombatMap('')).toBe(false);
  expect(st.mapId).toBe('crypt');
  expect(st.hexes.size).toBe(1);
  expect(notice).not.toHaveBeenCalled();
});

it('reuses only the confirmed raster for the same viewer and encounter while fetching current light origins', async () => {
  const requests = [], mask = { width:2,height:2,runs:[[0,1]] };
  const context = {
    supabaseSession:{user:{id:'a'}},
    dbJson:async(path,options)=>{
      const request=JSON.parse(options.body); requests.push(request);
      const reuse=request.p_known_mask_revision==='12';
      return {maskRevision:'12',maskUnchanged:reuse,freeSight:reuse?null:mask,lights:[{position:[requests.length,0]}]};
    }
  };
  runInNewContext(reads,context);
  await context.combatReadAcademyConfig(map,false,'fight-a');
  const update=await context.combatReadAcademyConfig(map,false,'fight-a');
  expect(update).toMatchObject({freeSight:mask,lights:[{position:[2,0]}]});
  context.supabaseSession.user.id='b';
  await context.combatReadAcademyConfig(map,false,'fight-a');
  await context.combatReadAcademyConfig(map,false,'fight-b');
  expect(requests.map(r=>r.p_known_mask_revision)).toEqual([null,'12',null,null]);
});
