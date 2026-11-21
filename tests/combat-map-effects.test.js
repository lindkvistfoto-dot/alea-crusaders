import { expect, it, vi } from 'vitest';
import { battleEffectsController, newLogRows, outdoorWeather, resolvedCues } from '../features/combat/battle-map-effects.js';

const room = (status, x = 0, width = 240) => ({ status, shape_type: 'rect', shape_data: { x, y: 0, width, height: 120 } });
const actor = { id: 'astrid', position: [60, 60], visible_to_players: true };
const victim = { id: 'slp', position: [120, 60], visible_to_players: true };
const hit = { id: '1', event_type: 'spell_attack', actor_id: actor.id, player_visible: true,
  details: { success: true, hit_resolved: true, spell_name: 'Eld', target_results: [{ target_id: victim.id, damage: { total: 3 } }] } };
const cue = { from: actor.position, to: victim.position, color: 0xff954a };

it('uses the actual resolved victim including a reflected hit and ignores blocked, pending and duplicate hits', () => {
  const result = { ...hit.details, target_results: [
    { target_id: victim.id, blocked_by_beskyddare: true }, { target_id: actor.id, original_target_id: victim.id, damage: { total: 4 }, reflected: true },
    { target_id: actor.id, damage: { total: 1 }, repetition: 2 },
  ] };
  expect(resolvedCues([{ ...hit, event_type: 'spell_after_antimagic', details: result }], [actor, victim], true, []))
    .toEqual([{ ...cue, from: victim.position, to: actor.position }]);
  for (const property of [{ success: false }, { hit_resolved: false }, { awaiting_antimagic: true }]) {
    expect(resolvedCues([{ ...hit, details: { ...hit.details, ...property } }], [actor, victim], true, [])).toEqual([]);
  }
});

it('requires both visible participants, authorized rooms and a public result on player clients', () => {
  expect(resolvedCues([hit], [actor, victim], false, [room('explored')])).toEqual([cue]);
  expect(resolvedCues([hit], [actor], false, [room('explored')])).toEqual([]);
  expect(resolvedCues([hit], [actor, { ...victim, visible_to_players: false }], false, [room('explored')])).toEqual([]);
  expect(resolvedCues([hit], [actor, victim], false, [room('explored'), room('unknown', 118, 12)])).toEqual([]);
  expect(resolvedCues([{ ...hit, player_visible: false }], [actor, victim], false, [room('explored')])).toEqual([]);
});

it('shows only explicitly described outdoor precipitation and fog', () => {
  expect(outdoorWeather('outdoor', ' Regn ')).toBe('rain');
  expect(outdoorWeather('outdoor', 'SNÖFALL')).toBe('snow');
  expect(outdoorWeather('outdoor', 'Tät dimma')).toBe('fog');
  expect(outdoorWeather('underground', 'regn')).toBe('');
  expect(outdoorWeather('outdoor', 'tidigare regn, nu klart')).toBe('');
});

it('ignores historical entries when opening or replacing the visible log window', () => {
  expect(newLogRows([hit], undefined)).toEqual([]);
  expect(newLogRows([hit], 'older-removed-event')).toEqual([]);
  expect(newLogRows([hit], null)).toEqual([hit]);
  expect(newLogRows([{ id: '0' }, hit], '0')).toEqual([hit]);
  expect(newLogRows([hit], '1')).toEqual([]);
});

function fakeRenderer() {
  return { update: vi.fn(), setEffects: vi.fn(), destroy: vi.fn(), canvas: { parentElement: null } };
}
function fixture() {
  const map = { id: 'crypt', width: 240, height: 120, image_url: 'crypt.webp' };
  return { map, host: { prepend(canvas) { canvas.parentElement = this; } }, combatId: 'fight', manager: false,
    config: { pixelsPerMeter: 40, lights: [], environment: 'outdoor', geometry: [] },
    weather: 'snö', log: [], actors: [actor, victim], objects: [], positions: [], areas: [room('explored')] };
}
it('retains one canvas across combat re-renders and plays each newly committed hit once', async () => {
  const renderer = fakeRenderer(), load = vi.fn(async () => renderer), controller = battleEffectsController(load);
  const state = fixture();
  const pillar = { light_blocking: true, footprint: [{x:95,y:0},{x:105,y:0},{x:100,y:20}] };
  state.objects.push(pillar);
  await controller.sync(state);
  expect(renderer.update.mock.calls[0][0].geometry).toEqual([{closed:true,light:true,points:[[95,0],[105,0],[100,20]]}]);
  const newHost = { prepend: vi.fn() };
  await controller.sync({ ...state, log: [hit], host: newHost });
  expect(renderer.setEffects).toHaveBeenLastCalledWith('snow', [cue], 40, false);
  expect(newHost.prepend).toHaveBeenCalledWith(renderer.canvas);
  await controller.sync({ ...state, log: [hit] });
  expect(renderer.setEffects).toHaveBeenLastCalledWith('snow', [], 40, false);
  expect(load).toHaveBeenCalledTimes(1);
  controller.clear();
  expect(renderer.destroy).toHaveBeenCalledOnce();
});

it('rejects late GM loads and pending cues after a room becomes concealed', async () => {
  const mounts = [], controller = battleEffectsController(() => new Promise(resolve => mounts.push(resolve)));
  const state = fixture();
  const first = controller.sync({ ...state, manager: true });
  const second = controller.sync(state);
  controller.sync({ ...state, log: [hit] });
  controller.sync({ ...state, log: [hit], areas: [room('unknown')] });
  const gm = fakeRenderer(), player = fakeRenderer();
  mounts[0](gm); mounts[1](player);
  await Promise.all([first, second]);
  expect(gm.destroy).toHaveBeenCalledOnce();
  expect(gm.update).not.toHaveBeenCalled();
  expect(player.setEffects).toHaveBeenLastCalledWith('snow', [], 40, true);
});

it('extinguishes and restores the encounter lights without changing the shared map or discovery', async () => {
  const renderer = fakeRenderer(), controller = battleEffectsController(async () => renderer);
  const state = fixture();
  state.config.lights = [{ type: 'fackla', on: true, position: [60,60] }];
  await controller.sync(state);
  await controller.sync({ ...state, lightsOut: true });
  expect(renderer.update.mock.lastCall[0]).toEqual({ ...state.config, lights: [] });
  expect(renderer.update.mock.lastCall[1]).toBe(state.areas);
  await controller.sync(state);
  expect(renderer.update.mock.lastCall[0].lights).toEqual([{ type: 'fackla', on: true, position: [60,60] }]);
});
