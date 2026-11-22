// Only these fields belong to a map area's editable document. Player status and
// resolved names come from the location and are never written back to the area.
function snapshot(row) {
  if (row == null) return null;
  return {
    location_id: row.location_id ?? null,
    shape_type: row.shape_type,
    shape_data: structuredClone(row.shape_data),
    sort_order: row.sort_order ?? 0,
  };
}

export function locationsForPolygonMap(map, sites, locations) {
  if (!map?.campaign_id) return [];
  const campaignLocations = locations.filter(location => location.campaign_id === map.campaign_id);
  if (!map.site_id) return campaignLocations; // Older maps can lack a structure.
  const children = new Map();
  for (const site of sites) {
    if (site.campaign_id !== map.campaign_id) continue;
    if (!children.has(site.parent_site_id)) children.set(site.parent_site_id, []);
    children.get(site.parent_site_id).push(site.id);
  }
  const included = new Set();
  const pending = [map.site_id];
  while (pending.length) {
    const id = pending.pop();
    if (included.has(id)) continue;
    included.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  return campaignLocations.filter(location => included.has(location.site_id));
}

function ambiguous(error) {
  return error instanceof TypeError || error instanceof SyntaxError || error.code === 'POLYGON_RESPONSE'
    || /network|failed to fetch|load failed|timeout|databasfel 5\d\d/i.test(error.message);
}

export function createPolygonHistory({mapId, dbJson, areas}) {
  const past = [], future = [];
  let versions = Object.fromEntries(areas.map(area => [area.id, area.updated_at]));
  let busy = false, lastChanges = [], blocked = false;

  async function send(changes) {
    async function request(replay = false) {
      const entries = replay ? [{...changes[0], replay:true}, ...changes.slice(1)] : changes;
      const body = JSON.stringify({p_map_id:mapId, p_versions:versions, p_changes:entries});
      const result = await dbJson('rpc/apply_map_polygon_operation', {method: 'POST', body});
      if (!result || Array.isArray(result) || typeof result !== 'object' ||
          !Object.values(result).every(value => typeof value === 'string') ||
          changes.some(change => Boolean(change.after) !== Object.hasOwn(result, change.id))) {
        throw Object.assign(new Error('Kartans sparbekräftelse saknas.'), {code:'POLYGON_RESPONSE'});
      }
      return result;
    }
    try {
      return await request();
    } catch (first) {
      if (!ambiguous(first)) throw first;
      // A lost response may follow a successful commit. Replay the exact same
      // command. The database recognizes its complete after-state atomically.
      try { return await request(true); }
      catch (retry) {
        if (!ambiguous(retry)) throw retry;
        blocked = true;
        throw Object.assign(new Error('Sparningen kunde inte bekräftas. Öppna kartan igen.'), {code:'POLYGON_UNCERTAIN', cause:retry});
      }
    }
  }

  async function run(operation, direction) {
    if (busy || !operation?.length) return false;
    if (blocked) throw Object.assign(new Error('Öppna kartan igen för att läsa aktuella polygoner.'), {code:'POLYGON_CONFLICT'});
    const changes = direction === 'undo'
      ? operation.map(({id, before, after}) => ({id, before:after, after:before}))
      : operation;
    busy = true;
    try {
      versions = await send(changes);
      lastChanges = changes.map(({id, before, after}) => ({
        id, before, after: after && {...after, id, updated_at:versions[id]},
      }));
      if (direction === 'undo') future.push(past.pop());
      else if (direction === 'redo') past.push(future.pop());
      else { past.push(operation); future.length = 0; }
      return true;
    } catch (error) {
      if (error.message.includes('Kartans polygoner har ändrats')) {
        blocked = true;
        error.code = 'POLYGON_CONFLICT';
      }
      throw error;
    } finally {
      busy = false;
    }
  }
  return {
    get busy() { return busy; },
    get canUndo() { return !busy && !blocked && past.length > 0; },
    get canRedo() { return !busy && !blocked && future.length > 0; },
    get lastChanges() { return structuredClone(lastChanges); },
    commit(changes) {
      const operation = changes.map(({id, before, after}) => ({id, before:snapshot(before), after:snapshot(after)}))
        .filter(({before, after}) => JSON.stringify(before) !== JSON.stringify(after));
      return run(operation, 'commit');
    },
    undo() { return run(past.at(-1), 'undo'); },
    redo() { return run(future.at(-1), 'redo'); },
  };
}
