// Kartakademin owns the viewport and its pan/ruler gestures. Rooms use the same
// SVG coordinate system as the other tools, including at fractional zoom.
import {
  areaPoints, hitPolygons, insertSharedVertex, mapPointer, mapScreenScale,
  movePreparedVertices, nearestEdge, polygonsOverlap, prepareVertexMove,
  snapPoint, validPolygon
} from './polygon-edit-geometry.js';
import { findHoles } from './polygon-topology.js';

const ns = 'http://www.w3.org/2000/svg';
function node(tag, attrs = {}) {
  const element = document.createElementNS(ns, tag);
  for (const [attr, value] of Object.entries(attrs)) element.setAttribute(attr, value);
  return element;
}
const coords = points => points.map(p => p.join(',')).join(' ');
const equalPoint = (a, b) => a[0] === b[0] && a[1] === b[1];

export function createPolygonOverlay({
  svg, map, getAreas, getWalls = () => [], isActive, isVisible = () => true,
  onSelect = () => {}, onChange = () => {}, onNotice = () => {}, onCreate, onGeometry
}) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const layer = node('g', { id: 'mapAreaRoomLayer' });
  const rooms = node('g'), handles = node('g'), gapLayer = node('g', { 'pointer-events': 'none' });
  const preview = node('g', { 'pointer-events': 'none' });
  const roomNodes = new Map();
  layer.append(rooms, gapLayer, handles, preview);
  svg.prepend(layer);
  let mode = 'select', selectedId = null, vertexIndex = null, candidateIds = [];
  let draft = [], gap = null, drag = null, pointerStart = null, hover = null;
  let previousAreas, shapes = [], gaps, busy = false, disposed = false;
  let suppressClick = false;
  let affectedIds = [];
  const selected = () => shapes.find(shape => shape.id === selectedId);
  const state = () => ({
    mode, selectedId, vertexIndex, candidateIds: [...candidateIds], affectedIds: [...affectedIds],
    draftCount: draft.length, canFinish: !busy && (mode === 'draw' ? draft.length >= 3 : !!gap),
    pending: busy || !!drag || !!gap || !!draft.length, dragging: !!drag
  });
  function changed() { if (!disposed) onChange(state()); }
  function refreshShapes() {
    const areas = getAreas();
    if (previousAreas === areas) return;
    previousAreas = areas;
    shapes = areas.map(area => ({ id: area.id, points: areaPoints(area) }));
    gaps = undefined;
    if (selectedId && !selected()) {
      selectedId = null;
      vertexIndex = null;
      candidateIds = [];
      affectedIds = [];
    }
  }
  function marker(group, point, size, scale, attrs) {
    const circle = node('ellipse', {
      cx: point[0], cy: point[1], rx: size / scale.scaleX, ry: size / scale.scaleY,
      'vector-effect': 'non-scaling-stroke', ...attrs
    });
    group.append(circle);
    return circle;
  }
  function paintRooms() {
    const active = isActive();
    const remaining = new Set(roomNodes.keys());
    for (const shape of shapes) {
      remaining.delete(shape.id);
      let polygon = roomNodes.get(shape.id);
      if (!polygon) {
        polygon = node('polygon', { 'data-area-id': shape.id });
        roomNodes.set(shape.id, polygon);
        rooms.append(polygon);
      }
      const points = coords(shape.points);
      if (polygon.getAttribute('points') !== points) polygon.setAttribute('points', points);
      polygon.setAttribute('class', ['map-editor-zone', !active ? 'reference' :
        shape.id === selectedId ? 'selected' : affectedIds.includes(shape.id) ? 'studio-neighbour' : ''].join(' '));
    }
    for (const id of remaining) { roomNodes.get(id).remove(); roomNodes.delete(id); }
    // The selected contour stays visible when a later room shares an edge.
    if (active && selectedId && roomNodes.has(selectedId)) rooms.append(roomNodes.get(selectedId));
  }
  function paintHandles(points = selected()?.points, selectedIndex = vertexIndex) {
    if (!isActive() || !points || !['edit', 'select'].includes(mode)) { handles.replaceChildren(); return; }
    const scale = mapScreenScale(svg);
    while (handles.childElementCount > points.length) handles.lastElementChild.remove();
    points.forEach((point, index) => {
      const active = index === selectedIndex, size = active ? 6 : mode === 'edit' ? 5 : 3;
      // Keep handle elements stable during a drag. Pointer hit tests use a
      // larger CSS-pixel radius than the visible marker.
      let glyph = handles.children[index];
      if (!glyph) glyph = marker(handles, point, size, scale, { 'data-vertex-index': index, style: 'pointer-events:none' });
      const attrs = { cx: point[0], cy: point[1], rx: size / scale.scaleX, ry: size / scale.scaleY,
        class: 'map-editor-vertex' + (active ? ' active' : '') };
      for (const [key, value] of Object.entries(attrs)) {
        if (glyph.getAttribute(key) !== String(value)) glyph.setAttribute(key, value);
      }
    });
  }
  function paintGaps() {
    gapLayer.replaceChildren();
    if (!isActive() || mode !== 'fill') return;
    gaps ??= findHoles(shapes.map(shape => shape.points));
    for (const [index, hole] of gaps.entries()) {
      // A real gap may be only a fraction of a map pixel wide. Give its exact
      // boundary a fixed-width visible outline, including when zoomed out.
      const active = hole === gap;
      const candidate = node('polygon', { points: coords(hole.points), 'data-gap-candidate': index,
        'vector-effect': 'non-scaling-stroke', fill: active ? '#ffd55988' : '#2bcde055',
        stroke: active ? '#ffda62' : '#50e8eb', 'stroke-width': active ? 5 : 3 });
      if (active) candidate.dataset.gapPreview = '';
      gapLayer.append(candidate);
    }
  }
  function paintPreview() {
    preview.replaceChildren();
    if (!isActive()) return;
    const scale = mapScreenScale(svg);
    if (mode === 'draw' && draft.length) {
      const line = hover ? [...draft, hover.point] : draft;
      preview.append(node(line.length > 2 ? 'polygon' : 'polyline',
        { class: 'map-editor-draft', points: coords(line) }));
      draft.forEach((point, index) => marker(preview, point, index ? 3.5 : 6, scale,
        { class: 'map-editor-point', 'data-draft-vertex': index }));
    }
    if (hover?.snap) {
      if (hover.snap.kind === 'edge') {
        const { id, index } = hover.snap;
        const points = id === 'draft' ? draft : (shapes.find(s => s.id === id) ?? getWalls().find(w => w.id === id))?.points;
        if (points?.[index]) preview.append(node('polyline', { points: coords([points[index], points[(index + 1) % points.length]]),
          fill: 'none', stroke: '#45f3dc', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' }));
      }
      marker(preview, hover.point, 9, scale, { fill: 'none', stroke: '#45f3dc', 'stroke-width': 3,
        'data-snap-kind': hover.snap.kind });
      marker(preview, hover.point, 2.2, scale, { fill: '#45f3dc' });
    }
  }
  function render() {
    if (disposed) return;
    refreshShapes();
    layer.style.display = isVisible() ? '' : 'none';
    layer.style.pointerEvents = isActive() ? 'auto' : 'none';
    layer.dataset.polygonTool = mode;
    paintRooms();
    paintGaps();
    paintHandles();
    if (drag?.changes.length) paintDrag();
    paintPreview();
  }
  function paintDrag() {
    for (const { id, points } of drag.changes) {
      roomNodes.get(id)?.setAttribute('points', coords(points));
      if (id === selectedId) paintHandles(points, drag.prepared.find(item => item.id === id)?.index);
    }
  }
  function releaseDrag() {
    if (!drag) return;
    const pointerId = drag.pointerId;
    drag = null;
    if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
  }
  function clearPreview() {
    releaseDrag();
    draft = [];
    gap = null;
    hover = null;
    pointerStart = null;
    affectedIds = [];
    vertexIndex = null;
  }
  function setMode(next) {
    if (busy || !['select', 'edit', 'draw', 'fill'].includes(next)) return;
    clearPreview();
    candidateIds = [];
    mode = next;
    onNotice('');
    render();
    changed();
  }
  function select(id, candidates = []) {
    if (busy || drag) return;
    refreshShapes();
    selectedId = shapes.some(shape => shape.id === id) ? id : null;
    candidateIds = candidates;
    vertexIndex = null;
    affectedIds = [];
    hover = null;
    onSelect(selectedId, candidateIds);
    render();
    changed();
  }
  function cancel() {
    if (busy) return;
    if (drag) suppressClick = true;
    clearPreview();
    onNotice('');
    render();
    changed();
  }
  function invalid(changes, adding = false) {
    const proposed = new Map(changes.map(change => [change.id, change.points]));
    const all = adding ? [...shapes, ...changes] : shapes;
    return changes.some(({ id, points }) => !validPolygon(points) || all.some(other =>
      other.id !== id && polygonsOverlap(points, proposed.get(other.id) ?? other.points)));
  }
  async function persist(changes) {
    if (!changes.length || busy) return false;
    if (invalid(changes)) {
      onNotice('Punktändringen skulle ge en ogiltig polygon eller en överlappning.');
      return false;
    }
    busy = true;
    changed();
    try {
      return await onGeometry(changes);
    } catch (error) {
      onNotice(error.message);
      return false;
    } finally {
      busy = false;
      render();
      changed();
    }
  }
  async function finish() {
    if (!isActive() || busy || !state().canFinish) return false;
    const points = mode === 'fill' ? gap.points : draft;
    if (invalid([{ id: Symbol(), points }], true)) {
      onNotice('Kontrollera hörnen. Polygonen korsar sig själv, saknar yta eller överlappar ett rum.');
      return false;
    }
    busy = true;
    changed();
    try {
      const id = await onCreate(points.map(p => p.slice()));
      if (!id || disposed) return false;
      busy = false;
      clearPreview();
      mode = 'edit';
      select(id);
      return true;
    } catch (error) {
      onNotice(error.message);
      return false;
    } finally {
      busy = false;
      render();
      changed();
    }
  }
  function popPoint() {
    if (busy || !isActive() || mode !== 'draw' || !draft.length) return false;
    draft.pop();
    hover = null;
    paintPreview();
    changed();
    return true;
  }
  function snapAt(point, excludePoint) {
    const targets = [...shapes, ...getWalls()];
    if (mode === 'draw' && draft.length) targets.push({ id: 'draft', closed: false, points: draft });
    const snap = snapPoint(point, targets, { ...mapScreenScale(svg), tolerance: 13, excludePoint, excludeIds: drag?.movingIds });
    return { point: snap?.point ?? point, snap };
  }
  function localPoint(event, clamp = false) {
    const point = mapPointer(event, svg);
    if (!point) return null;
    if (clamp) return [Math.max(0, Math.min(map.width, point[0])), Math.max(0, Math.min(map.height, point[1]))];
    return point[0] >= 0 && point[1] >= 0 && point[0] <= map.width && point[1] <= map.height ? point : null;
  }
  function nearestHandle(point, points, scale, radius) {
    let index = null, distance = radius;
    points.forEach(([x, y], i) => {
      const d = Math.hypot((point[0] - x) * scale.scaleX, (point[1] - y) * scale.scaleY);
      if (d <= distance) { distance = d; index = i; }
    });
    return index;
  }
  function selectAt(point) {
    const ids = hitPolygons(point, shapes, { ...mapScreenScale(svg), tolerance: 3 });
    // Repeated clicks cycle through the exact same hit stack. The panel also
    // exposes every candidate so a user can pick directly by name.
    const same = ids.length === candidateIds.length && ids.every((id, i) => id === candidateIds[i]);
    const next = same && ids.length ? (ids.indexOf(selectedId) + 1) % ids.length : 0;
    select(ids[next] ?? null, ids);
  }
  async function insert(point, radius) {
    const shape = selected();
    if (!shape) return false;
    const edge = nearestEdge(point, shape.points, mapScreenScale(svg));
    if (!edge || edge.distance > radius) return false;
    const changes = insertSharedVertex(shapes, edge.point);
    if (changes.length && await persist(changes)) {
      select(shape.id);
      vertexIndex = selected()?.points.findIndex(p => equalPoint(p, edge.point)) ?? null;
      if (vertexIndex === -1) vertexIndex = null;
      affectedIds = changes.map(change => change.id);
      render();
      changed();
    }
    return true;
  }
  async function removeVertex() {
    if (busy || mode !== 'edit' || vertexIndex === null || !isActive()) return false;
    const shape = selected(), origin = shape?.points[vertexIndex];
    if (!origin) return false;
    const touched = prepareVertexMove(shapes, origin);
    if (touched.some(item => item.points.length <= 3)) {
      onNotice('Varje rum behöver minst tre hörn.');
      return false;
    }
    // A corner shared by rooms may only be removed simultaneously when each
    // boundary remains on the same straight line (e.g. an inserted seam node).
    if (touched.length > 1 && touched.some(({ points, index }) => {
      const n = points.length, before = points[(index + n - 1) % n], after = points[(index + 1) % n];
      return (nearestEdge(origin, [before, after], { closed: false })?.distance ?? Infinity) > 1e-8;
    })) {
      onNotice('Hörnet formar flera rum. Flytta det för att justera deras gemensamma gräns.');
      return false;
    }
    const changes = touched.filter(item => shapes.find(s => s.id === item.id).points.some(p => equalPoint(p, origin)))
      .map(({ id, points, index }) => ({ id, points: points.filter((_, i) => i !== index) }));
    if (!await persist(changes)) return false;
    vertexIndex = null;
    affectedIds = [];
    render();
    changed();
    return true;
  }
  svg.addEventListener('pointerdown', event => {
    if (!isActive() || busy || event.button !== 0) return;
    if (!event.isPrimary) {
      if (event.pointerType === 'touch' && pointerStart) {
        releaseDrag();
        pointerStart = null;
        hover = null;
        suppressClick = true;
        render();
        changed();
      }
      return;
    }
    suppressClick = false;
    const point = localPoint(event);
    if (!point) return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
    if (mode !== 'edit' || !selected()) return;
    const index = nearestHandle(point, selected().points, mapScreenScale(svg), pointerStart.touch ? 18 : 12);
    if (index === null) return;
    vertexIndex = index;
    const origin = selected().points[index], prepared = prepareVertexMove(shapes, origin);
    affectedIds = prepared.map(item => item.id);
    drag = { pointerId: event.pointerId, origin, prepared, movingIds: new Set(affectedIds), changes: [], moved: false };
    hover = null;
    suppressClick = true;
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
    onNotice('');
    render();
    changed();
  }, options);
  function moveDrag(event) {
    if (!drag.moved && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) <
        (pointerStart.touch ? 8 : 4)) return;
    const point = localPoint(event, true);
    if (!point) return;
    drag.moved = true;
    hover = snapAt(point, drag.origin);
    drag.changes = movePreparedVertices(drag.prepared, hover.point);
    paintDrag();
    paintPreview();
  }
  svg.addEventListener('pointermove', event => {
    if (disposed || busy || !isActive() || !event.isPrimary) return;
    if (drag?.pointerId === event.pointerId) { moveDrag(event); return; }
    if (event.buttons || mode !== 'draw') return;
    const point = localPoint(event);
    hover = point ? snapAt(point) : null;
    paintPreview();
  }, options);
  svg.addEventListener('pointerleave', () => { if (!drag) { hover = null; paintPreview(); } }, options);
  svg.addEventListener('pointerup', async event => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    if (drag?.pointerId === event.pointerId) {
      if (isActive()) moveDrag(event);
      const { changes, moved, origin } = drag;
      const destination = hover?.point;
      releaseDrag();
      pointerStart = null;
      hover = null;
      if (isActive() && moved && destination && !equalPoint(origin, destination)) {
        // Materialize a target edge in the same transaction as moving the node.
        const movedIds = new Set(changes.map(change => change.id));
        const joined = insertSharedVertex(shapes.filter(shape => !movedIds.has(shape.id)), destination);
        const saved = await persist([...changes, ...joined]);
        if (saved) {
          vertexIndex = selected()?.points.findIndex(point => equalPoint(point, destination)) ?? null;
          if (vertexIndex === -1) vertexIndex = null;
          affectedIds = [...movedIds, ...joined.map(item => item.id)];
        }
      }
      render();
      changed();
    } else {
      suppressClick = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) >
        (pointerStart.touch ? 8 : 4);
      pointerStart = null;
    }
  }, options);
  for (const type of ['pointercancel', 'lostpointercapture']) svg.addEventListener(type, event => {
    if (drag?.pointerId !== event.pointerId && pointerStart?.id !== event.pointerId) return;
    if (drag) releaseDrag();
    pointerStart = null;
    suppressClick = true;
    hover = null;
    render();
    changed();
  }, options);
  svg.addEventListener('click', async event => {
    if (!isActive() || busy || event.button !== 0 || (event.detail > 1 && mode === 'draw')) return;
    if (suppressClick) { suppressClick = false; return; }
    const point = localPoint(event);
    if (!point) return;
    onNotice('');
    if (mode === 'select') { selectAt(point); return; }
    if (mode === 'edit') {
      // Pointerdown selects a handle. Keyboard-generated clicks and automation
      // can still arrive without a matching pointer gesture.
      if (selected() && nearestHandle(point, selected().points, mapScreenScale(svg), 12) !== null) return;
      if (!await insert(point, event.pointerType === 'touch' ? 16 : 9)) selectAt(point);
      return;
    }
    if (mode === 'fill') {
      gaps ??= findHoles(shapes.map(shape => shape.points));
      const scale = mapScreenScale(svg);
      const direct = hitPolygons(point, gaps.map((hole, id) => ({ id, points: hole.points })));
      const tolerance = event.pointerType === 'touch' ? 18 : 10;
      const nearby = gaps.map((hole, id) => ({ id, distance: nearestEdge(point, hole.points, scale).distance }))
        .filter(hit => hit.distance <= tolerance).sort((a, b) => a.distance - b.distance);
      gap = gaps[direct[0] ?? nearby[0]?.id] ?? null;
      onNotice(gap ? 'Tomrum med ' + gap.points.length + ' hörn. Godkänn fyllningen eller avbryt.' :
        'Här finns inget slutet tomrum. Välj en turkos kontur för att förhandsvisa ytan.');
      paintGaps();
      changed();
      return;
    }
    hover = snapAt(point);
    if (draft.length >= 3 && equalPoint(hover.point, draft[0])) { await finish(); return; }
    if (draft.some(vertex => equalPoint(vertex, hover.point))) {
      onNotice('Det här hörnet finns redan i konturen.');
      return;
    }
    draft.push(hover.point.slice());
    paintPreview();
    changed();
  }, options);
  svg.addEventListener('dblclick', event => {
    if (isActive() && mode === 'draw' && !busy) { event.preventDefault(); void finish(); }
  }, options);
  const resize = new ResizeObserver(() => { if (!disposed) { paintHandles(); paintPreview(); } });
  resize.observe(svg);
  return {
    render, setMode, select, cancel, finish, removeVertex, popPoint, get state() { return state(); },
    destroy() {
      disposed = true;
      releaseDrag();
      events.abort();
      resize.disconnect();
      layer.remove();
    }
  };
}
