// Only role-scoped battle data enters the renderer. Receiving an effect never writes combat state.
import { pointIsExplored } from '../map/kartakademin-geometry.js';

export function outdoorWeather(environment, description) {
  if (environment !== 'outdoor') return '';
  const value = String(description ?? '').trim().toLocaleLowerCase('sv-SE');
  // The campaign day stores free text. Interpret only unambiguous, complete labels.
  if (['regn', 'lätt regn', 'ösregn', 'regnskur', 'kraftigt regn'].includes(value)) return 'rain';
  if (['snö', 'snöfall', 'lätt snöfall', 'kraftigt snöfall'].includes(value)) return 'snow';
  if (['dimma', 'tät dimma', 'lätt dimma'].includes(value)) return 'fog';
  return '';
}

export function resolvedCues(rows, actors, manager, areas) {
  const participants = new Map();
  for (const actor of actors) {
    if (!actor.position?.every(Number.isFinite) || actor.position.length !== 2) continue;
    if (!manager && (actor.visible_to_players === false || !pointIsExplored(areas, actor.position))) continue;
    participants.set(actor.id, actor.position);
  }
  const cues = [];
  for (const row of rows) {
    const result = row.details;
    const origin = participants.get(row.actor_id);
    if (!origin || (!manager && row.player_visible !== true) || !['spell_attack', 'spell_after_antimagic'].includes(row.event_type) ||
        !result?.success || !result.hit_resolved || result.awaiting_antimagic || !Array.isArray(result.target_results)) continue;

    // Keep the GM's configured HERMES sequence whenever the spell has one.
    const name = String(result.spell_name || '').toLocaleUpperCase('sv-SE').replace(/\s*\([^)]*\)/g, '').trim();
    if (manager && typeof ruleSpells !== 'undefined' && ruleSpells.some(spell =>
      String(spell.name || '').toLocaleUpperCase('sv-SE').replace(/\s*\([^)]*\)/g, '').trim() === name &&
      (spell.projectile_animation_key || spell.impact_animation_key))) continue;
    const hits = new Set();
    for (const hit of result.target_results) {
      if (!hit.damage || hit.blocked_by_beskyddare || hits.has(hit.target_id)) continue;
      const target = participants.get(hit.target_id);
      if (!target) continue;
      const from = hit.reflected && hit.original_target_id ? participants.get(hit.original_target_id) : origin;
      if (!from) continue;
      hits.add(hit.target_id);
      cues.push({ from, to: target, color: /^ELD/.test(name) ? 0xff954a : /^BLIXT/.test(name) ? 0x91d9ff : 0xc4a4ff });
    }
  }
  return cues;
}

export function newLogRows(log, lastId) {
  if (lastId === undefined || !log.length) return [];
  if (lastId === null) return log;
  const index = log.findIndex(row => row.id === lastId);
  // A new window with no overlapping history may follow an undo or a reconnect.
  return index < 0 ? [] : log.slice(index + 1);
}

function lightGeometry(config, lightBlockers, reducedMotion, lightsOut) {
  if (lightsOut) config = { ...config, lights: [] };
  else if (reducedMotion) config = { ...config, lights: config.lights.map(light => ({ ...light, motion: 0 })) };
  if (!lightBlockers.length) return config;
  return { ...config, geometry: [...(config.geometry || []), ...lightBlockers.map(points => ({
    closed: true, light: true, points,
  }))] };
}

export function battleEffectsController(loadRenderer) {
  let current;
  function clear() {
    const previous = current;
    current = null;
    previous?.renderer?.destroy();
  }
  function present(state) {
    if (state !== current || !state.renderer) return;
    const { renderer, latest } = state;
    const { config, areas, positions, host, manager, objects, lightsOut = false } = latest;
    const moved = JSON.stringify(positions);
    const lightBlockers = (objects || []).filter(row => row.light_blocking && row.footprint?.length >= 3)
      .map(row => row.footprint.map(({ x, y }) => [x, y]));
    const walls = JSON.stringify(lightBlockers);
    const reduce = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const lightingChanged = state.lightsOut !== lightsOut || state.reduce !== reduce || state.config !== config || state.areas !== areas ||
      state.moved !== moved || state.walls !== walls;
    if (lightingChanged) {
      // Repaint with the current role/room state before reattaching on DOM replacement.
      const prepared = lightGeometry(config, lightBlockers, reduce, lightsOut);
      renderer.update(prepared, areas, positions, manager);
      Object.assign(state, { config, areas, moved, walls, reduce, lightsOut });
    }
    if (renderer.canvas.parentElement !== host) host.prepend(renderer.canvas);
    const actorAccess = JSON.stringify((latest.actors || []).map(row => [row.id, row.visible_to_players, row.position]));
    const reset = reduce || lightingChanged || state.actorAccess !== actorAccess;
    state.actorAccess = actorAccess;
    renderer.setEffects(reduce ? '' : outdoorWeather(config.environment, latest.weather),
      reduce ? [] : resolvedCues(state.pending.splice(0), latest.actors || [], manager, areas), config.pixelsPerMeter, reset);
    if (reduce) state.pending.length = 0;
  }
  function sync(latest) {
    if (!latest.host || !latest.map?.image_url || !latest.config || !latest.combatId) { clear(); return; }
    const { combatId, manager, map, log = [] } = latest;
    // Signed delivery URLs may renew; map identity is stable throughout this fight.
    const source = map.image_url.split('?')[0];
    if (!current || current.id !== combatId || current.mapId !== map.id || current.source !== source || current.manager !== manager) {
      clear();
      const state = current = { id: combatId, mapId: map.id, source, manager, pending: [], latest };
      state.ready = loadRenderer(map).then(renderer => {
        if (current !== state) { renderer.destroy(); return; }
        state.renderer = renderer;
        present(state);
      }).catch(error => {
        if (current === state) clear();
        console.warn('Stridskartans ljus och effekter kunde inte visas', error);
      });
    }
    const state = current;
    state.latest = latest;
    const rows = newLogRows(log, state.lastId);
    state.lastId = log.at(-1)?.id ?? null;
    // A role, discovery or actor update can revoke an effect while WebGL is loading.
    state.pending = [...state.pending, ...rows].filter(row => log.some(visible => visible.id === row.id));
    if (state.renderer) {
      try { present(state); } catch (error) {
        clear();
        console.warn('Stridskartans ljus och effekter kunde inte uppdateras', error);
      }
    }
    return state.ready;
  }
  return { sync, clear };
}

if (typeof window !== 'undefined') {
  window.aleaBattleMapEffects = battleEffectsController(async map => {
    const [{ mountLighting }, { createBattleEffects }] = await Promise.all([
      import('../map/kartakademin-renderer.js'), import('./battle-map-pixi.js'),
    ]);
    return mountLighting(document.createElement('div'), map, createBattleEffects);
  });
}
