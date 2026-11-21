import { createPolygonOverlay } from './polygon-studio-overlay.js';
import { areaPoints } from './polygon-edit-geometry.js';
import { createPolygonHistory, locationsForPolygonMap } from './polygon-session.js';

const tools = { select: 'Välj', draw: 'Rita', edit: 'Redigera', fill: 'Fyll' };
const hints = {
  select: 'Välj en polygon på kartan eller i listan.',
  draw: 'Klicka ut hörn. Slutför med första hörnet, dubbelklick eller knappen.',
  edit: 'Dra ett hörn eller klicka på en kant för att infoga en punkt.',
  fill: 'Välj en turkos glipa. För en öppen glipa, välj två kanter.',
};
const discoveries = { unknown: 'Okänd', unexplored: 'Outforskad', explored: 'Utforskad' };
const locationName = place => place.name || ('Plats ' + (place.location_key || ''));

export function mountPolygonStudio({
  map, svg, toolbar, roomList, roomNotice, sites, locations, sitePath, reload, changed, setStatus,
  confirm, dbJson, getAreas, getWalls, inRoomMode, isVisible, canPoint, pointerTool, claimRoomPointer, centerOn
}) {
  const events = new AbortController();
  const listen = (element, type, fn) => element.addEventListener(type, fn, { signal: events.signal });
  const places = locationsForPolygonMap(map, sites, locations);
  const allPlaces = new Map(locations.map(place => [place.id, place]));
  const structure = map.site_id ? sitePath(map.site_id) : 'Hela kampanjen';
  const makeHistory = () => createPolygonHistory({ mapId: map.id, dbJson, areas: getAreas() });
  let history = makeHistory(), working = false, confirming = false, disposed = false, message = '';
  let renderedRows, previousSelectedId;
  toolbar.innerHTML = `
    <div class="room-tool-group" role="group" aria-label="Aktivt polygonverktyg">
      ${Object.entries(tools).map(([id, label]) => `<button type="button" class="btn" data-room-mode="${id}">${label}</button>`).join('')}
    </div>
    <button type="button" class="smallbtn" data-gap-edges hidden>Välj två kanter</button>
    <label class="map-area-location-label" data-gap-target-label hidden>Rum som ska utökas<select data-gap-target></select></label>
    <div class="room-actions">
      <button type="button" class="smallbtn" id="mapAreaUndoBtn" title="Ctrl/Cmd+Z">Ångra</button>
      <button type="button" class="smallbtn" id="mapAreaRedoBtn" title="Ctrl/Cmd+Shift+Z">Gör om</button>
      <button type="button" class="smallbtn" id="mapAreaCancelBtn">Avbryt</button>
      <button type="button" class="btn primary" id="mapAreaSaveBtn">Slutför polygon</button>
    </div>`;
  roomList.innerHTML = `
    <section class="room-properties" aria-label="Vald polygon" hidden>
      <h4 data-room-title></h4><p data-room-structure></p>
      <label data-room-hits hidden>Polygoner vid klicket<select></select></label>
      <label>Koppla till plats<select id="mapAreaLocation"></select></label>
      <label data-room-discovery>Upptäcktsstatus<select></select></label>
      <div class="room-actions"><button class="smallbtn" type="button" data-room-center>Centrera</button>
        <button class="smallbtn" type="button" id="mapAreaRemoveVertexBtn">Ta bort punkt</button>
        <button class="smallbtn" type="button" data-room-delete>Ta bort polygon</button></div>
    </section>
    <h4 class="room-list-heading"></h4><div class="room-rows"></div>`;
  const get = selector => toolbar.querySelector(selector) || roomList.querySelector(selector);
  const props = get('.room-properties'), rows = get('.room-rows'), location = get('#mapAreaLocation');
  const gapTarget = get('[data-gap-target]'), edgeButton = get('[data-gap-edges]');
  const modeButtons = [...toolbar.querySelectorAll('[data-room-mode]')];
  const discovery = get('[data-room-discovery] select'), hitSelect = get('[data-room-hits] select');
  let titles = new Map();
  const title = id => titles.get(id) || 'Polygon ' + id.slice(0, 8);
  const placeText = area => area.location_id ? (allPlaces.has(area.location_id) ? locationName(allPlaces.get(area.location_id)) : area.name || 'Kopplad plats') : 'Saknar plats';
  location.replaceChildren(new Option('Ingen plats kopplad', ''), ...places.map(place =>
    new Option((place.site_id !== map.site_id ? sitePath(place.site_id) + ' › ' : '') + locationName(place), place.id)));
  discovery.replaceChildren(...Object.entries(discoveries).map(([value, label]) => new Option(label, value)));
  const selected = () => getAreas().find(area => area.id === overlay.state.selectedId);
  const locked = () => working || confirming;
  const overlay = createPolygonOverlay({
    svg, map, getAreas, getWalls, isVisible,
    isActive: () => inRoomMode() && isVisible() && canPoint() && !locked(),
    onChange: panel,
    onNotice(text) { message = text; panel(); },
    async onCreate(points) {
      const id = crypto.randomUUID();
      const after = { id, location_id: null, shape_type: 'polygon', shape_data: { points },
        sort_order: getAreas().reduce((max, row) => Math.max(max, row.sort_order ?? -1), -1) + 1 };
      return await save(() => history.commit([{ id, before: null, after }]), 'Polygonen har sparats.') ? id : false;
    },
    onGeometry(changes, operation) {
      return save(() => history.commit(changes.map(({ id, points }) => {
        const before = getAreas().find(area => area.id === id);
        const data = before.shape_type === 'polygon' ? before.shape_data : {};
        return { id, before, after: { ...before, shape_type: 'polygon', shape_data: { ...data, points } } };
      })), operation === 'repair' ? 'Glipan har lagats i ' + title(changes[0].id) + '.' : 'Hörnen har sparats.');
    }
  });

  function rebuildRows() {
    if (renderedRows === getAreas()) return;
    renderedRows = getAreas();
    const counts = new Map();
    for (const { sort_order } of renderedRows) counts.set(sort_order, (counts.get(sort_order) || 0) + 1);
    titles = new Map(renderedRows.map(({ id, sort_order }) => [
      id, 'Polygon ' + (sort_order != null && counts.get(sort_order) === 1 ? sort_order + 1 : id.slice(0, 8))
    ]));
    rows.replaceChildren(...renderedRows.map(area => {
      const button = document.createElement('button');
      button.className = 'map-area-list-row'; button.type = 'button'; button.dataset.roomId = area.id;
      const label = document.createElement('strong'); label.textContent = title(area.id);
      const place = document.createElement('span');
      place.textContent = (area.location_id ? '✓ ' : '') + placeText(area);
      button.setAttribute('aria-label', label.textContent + ' · ' + (area.location_id ? 'Kopplad till ' : '') + placeText(area));
      button.append(label, place);
      return button;
    }));
    get('.room-list-heading').textContent = 'Polygoner (' + renderedRows.length + ')';
    previousSelectedId = undefined;
  }
  function panel() {
    if (disposed) return;
    const state = overlay.state, area = selected(), visible = isVisible();
    toolbar.hidden = roomNotice.hidden = !inRoomMode();
    roomList.hidden = toolbar.hidden || !visible;
    if (toolbar.hidden) return;
    const navigation = pointerTool();
    const editing = visible && !navigation;
    const disabled = locked() || state.dragging;
    const preview = Boolean(state.draftCount || state.gapSelected || state.sourceId);
    const highlighted = state.gapTargetId ?? state.sourceId ?? state.selectedId;
    rebuildRows();
    modeButtons.forEach(btn => {
      btn.setAttribute('aria-pressed', String(editing && btn.dataset.roomMode === state.mode)); btn.disabled = disabled;
    });
    get('#mapAreaSaveBtn').hidden = !['draw', 'fill'].includes(state.mode);
    const repairLabel = state.gapTargetId ? 'Laga glipan i ' + title(state.gapTargetId) : 'Laga glipan';
    get('#mapAreaSaveBtn').textContent = state.mode === 'fill' ? repairLabel : 'Slutför polygon';
    get('#mapAreaSaveBtn').disabled = disabled || !editing || !state.canFinish;
    edgeButton.hidden = state.mode !== 'fill';
    edgeButton.disabled = disabled;
    edgeButton.setAttribute('aria-pressed', String(editing && state.choosingEdges));
    get('[data-gap-target-label]').hidden = !state.gapTargetIds.length;
    const gapIds = state.gapTargetIds.join(',');
    if (gapTarget.dataset.ids !== gapIds) {
      gapTarget.replaceChildren(...state.gapTargetIds.map(id => {
        const area = getAreas().find(row => row.id === id);
        return new Option(title(id) + ' · ' + placeText(area), id);
      }));
      gapTarget.dataset.ids = gapIds;
    }
    gapTarget.disabled = disabled || !editing;
    gapTarget.value = state.gapTargetId || '';
    get('#mapAreaCancelBtn').hidden = !preview && !state.dragging && !state.choosingEdges;
    get('#mapAreaCancelBtn').disabled = locked();
    get('#mapAreaUndoBtn').disabled = disabled || (preview ? !editing || !state.draftCount : !history.canUndo);
    get('#mapAreaRedoBtn').disabled = disabled || state.pending || !history.canRedo;
    if (previousSelectedId !== highlighted) {
      for (const row of rows.children) row.setAttribute('aria-pressed', String(row.dataset.roomId === highlighted));
      const row = rows.querySelector('[aria-pressed=true]');
      if (row) {
        const item = row.getBoundingClientRect(), box = rows.getBoundingClientRect();
        if (item.top < box.top) rows.scrollTop += item.top - box.top;
        else if (item.bottom > box.bottom) rows.scrollTop += item.bottom - box.bottom;
      }
      previousSelectedId = highlighted;
    }
    rows.inert = disabled || preview;
    props.hidden = !area || preview;
    if (area) {
      get('[data-room-title]').textContent = title(area.id) + ' · ' + placeText(area);
      get('[data-room-structure]').textContent = structure + ' › ' + map.name + ' · ' + areaPoints(area).length + ' hörn';
      const hits = state.candidateIds;
      get('[data-room-hits]').hidden = hits.length < 2;
      if (hits.length > 1 && hitSelect.dataset.hits !== hits.join(',')) {
        hitSelect.replaceChildren(...hits.map(id => new Option(title(id), id)));
        hitSelect.dataset.hits = hits.join(',');
      }
      hitSelect.value = area.id;
      location.querySelector('[data-legacy]')?.remove();
      if (area.location_id && !places.some(p => p.id === area.location_id)) {
        const old = new Option(placeText(area) + ' · tidigare koppling', area.location_id);
        old.disabled = true; old.dataset.legacy = ''; location.add(old);
      }
      location.value = area.location_id || '';
      get('[data-room-discovery]').hidden = !area.location_id;
      discovery.value = area.status || 'unknown';
      props.inert = disabled;
      get('#mapAreaRemoveVertexBtn').hidden = state.mode !== 'edit';
      get('#mapAreaRemoveVertexBtn').disabled = state.vertexIndex == null || areaPoints(area).length <= 3;
    }
    const neighbours = state.affectedIds.filter(id => id !== state.selectedId);
    let hint = hints[state.mode];
    if (state.mode === 'edit' && !area) hint = 'Tryck på rummet du vill redigera.';
    if (state.choosingEdges) {
      if (!state.sourceId) hint = 'Klicka på kanten i rummet som ska utökas.';
      else if (!state.targetId) hint = title(state.sourceId) + ' ska utökas. Klicka på grannrummets motstående kant.';
      else hint = title(state.sourceId) + ' utökas fram till kanten på ' + title(state.targetId) + '. Turkos visar glipan.';
    }
    const identity = area && ['select', 'edit'].includes(state.mode) ? title(area.id) + ' · ' + placeText(area) + '.' : '';
    if (state.mode === 'select' && identity) hint = 'Tryck på Redigera för att flytta hörn.';
    const details = neighbours.length ? 'Gemensam gräns med ' + neighbours.map(title).join(', ') + '.' : '';
    if (working) roomNotice.textContent = 'Sparar…';
    else if (!visible) roomNotice.textContent = 'Rumsgränserna är dolda. Välj ett rumsverktyg för att visa dem.';
    else if (navigation === 'pan') roomNotice.textContent = 'Panorera · dra för att flytta kartan. Välj ett rumsverktyg för att fortsätta.';
    else if (navigation === 'ruler') roomNotice.textContent = 'Linjal · dra för att mäta. Välj ett rumsverktyg för att fortsätta.';
    else roomNotice.textContent = (identity ? identity + '. ' : '') + [message || hint, details].filter(Boolean).join(' ');
  }

  function localResult() {
    const next = new Map(getAreas().map(area => [area.id, area]));
    for (const { id, after } of history.lastChanges) {
      if (!after) { next.delete(id); continue; }
      const previous = next.get(id);
      next.set(id, { ...previous, ...after, id,
        name: after.location_id ? placeText({ ...after, name: previous?.name }) : 'Ej kopplad',
        status: previous?.location_id === after.location_id ? previous.status : 'unknown' });
    }
    return [...next.values()].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  }
  async function save(write, success) {
    if (working || disposed) return false;
    working = true;
    panel();
    try {
      if (!await write()) return false;
      let next = localResult();
      message = success;
      try { next = await reload(); }
      catch { message += ' Platsstatus kunde inte läsas om.'; }
      if (!disposed) changed(next);
      return true;
    } catch (error) {
      message = error.message;
      if (['POLYGON_CONFLICT', 'POLYGON_UNCERTAIN'].includes(error.code)) {
        try {
          const fresh = await reload();
          if (!disposed) {
            changed(fresh);
            history = makeHistory();
            message = 'De senaste polygonerna har hämtats. Granska kartan innan du fortsätter.';
          }
        } catch { /* Keep the last observed state; a later retry still checks its version. */ }
      }
      return false;
    } finally {
      working = false;
      if (!disposed) { overlay.render(); panel(); }
    }
  }
  async function removeArea() {
    const area = selected();
    if (!area || locked() || overlay.state.pending) return;
    confirming = true;
    try {
      if (!await confirm('Ta bort rumspolygon', 'Ta bort ' + title(area.id) + '? Platsen och dess upptäcktsstatus finns kvar.', 'Ta bort polygon', true) || disposed) return;
      await save(() => history.commit([{ id: area.id, before: area, after: null }]), 'Polygonen har tagits bort.');
    } finally { confirming = false; if (!disposed) { overlay.render(); panel(); } }
  }
  async function replay(redo) {
    if (locked()) return;
    if (!redo && overlay.popPoint()) return;
    if (overlay.state.pending) return;
    const saved = await save(() => redo ? history.redo() : history.undo(), redo ? 'Ändringen har gjorts om.' : 'Ändringen har ångrats.');
    if (saved && !disposed) {
      const restored = history.lastChanges.find(c => c.id === overlay.state.selectedId && c.after) ?? history.lastChanges.find(c => c.after);
      overlay.select(restored?.id || null);
    }
  }
  listen(toolbar, 'click', event => {
    const btn = event.target.closest('button');
    if (!btn || btn.disabled || locked()) return;
    if (btn.dataset.roomMode) {
      claimRoomPointer();
      if (btn.dataset.roomMode !== overlay.state.mode) overlay.setMode(btn.dataset.roomMode);
    } else if (btn.id === 'mapAreaSaveBtn') void overlay.finish();
    else if (btn.id === 'mapAreaCancelBtn') overlay.cancel();
    else if (btn.id === 'mapAreaUndoBtn') void replay(false);
    else if (btn.id === 'mapAreaRedoBtn') void replay(true);
  });
  listen(rows, 'click', event => {
    const id = event.target.closest('[data-room-id]')?.dataset.roomId;
    if (!id || locked() || overlay.state.pending) return;
    claimRoomPointer();
    message = '';
    if (['draw', 'fill'].includes(overlay.state.mode)) overlay.setMode('select');
    overlay.select(id);
  });
  listen(gapTarget, 'change', () => overlay.setGapTarget(gapTarget.value));
  listen(edgeButton, 'click', () => {
    const resume = !canPoint() && overlay.state.choosingEdges;
    claimRoomPointer();
    if (!resume) overlay.startEdgeRepair();
  });
  listen(hitSelect, 'change', () => overlay.select(hitSelect.value, overlay.state.candidateIds));
  listen(location, 'change', () => {
    const before = selected(), id = location.value || null;
    if (locked() || !before || id === before.location_id || (id && !places.some(place => place.id === id))) return panel();
    void save(() => history.commit([{ id: before.id, before, after: { ...before, location_id: id } }]), 'Platskopplingen har sparats.');
  });
  listen(discovery, 'change', () => {
    const area = selected();
    if (!locked() && area?.location_id) void setStatus(area.location_id, discovery.value);
  });
  listen(get('[data-room-delete]'), 'click', removeArea);
  listen(get('#mapAreaRemoveVertexBtn'), 'click', () => overlay.removeVertex());
  listen(get('[data-room-center]'), 'click', () => {
    const points = areaPoints(selected());
    if (!points.length) return;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    centerOn([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
  });
  listen(window, 'keydown', event => {
    if (event.defaultPrevented || !inRoomMode() || !isVisible() || !canPoint() || locked() ||
        event.target.closest?.('input,select,textarea,[contenteditable=true],dialog,[role=dialog]')) return;
    if (event.key === 'Escape') overlay.cancel();
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') void replay(event.shiftKey);
    else if (event.key === 'Delete' && !event.repeat && !overlay.state.pending) {
      if (overlay.state.vertexIndex != null) void overlay.removeVertex();
      else void removeArea();
    } else return;
    event.preventDefault();
  });
  return {
    render() { overlay.render(); panel(); },
    get busy() { return locked() || overlay.state.dragging; },
    get pending() { return overlay.state.pending; },
    destroy() { disposed = true; events.abort(); overlay.destroy(); toolbar.replaceChildren(); roomList.replaceChildren(); roomNotice.textContent = ''; }
  };
}
