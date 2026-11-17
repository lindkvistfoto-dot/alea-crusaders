import './kartakademin.css';
import { createMask, isFree, maskHistory, paintMask, polygonMask, prepareFreeSight, serializeMask } from './kartakademin-mask.js';
import { blockers, canMove, isBlocked, visibilityPolygon } from './kartakademin-geometry.js';

const types = {
  fackla: { name: 'Fackla', color: '#ffb060', motion: .18 },
  lykta: { name: 'Lykta', color: '#ffd59b', motion: .06 },
  eldstad: { name: 'Eldstad', color: '#ff9349', motion: .22 },
  solljus: { name: 'Infallande solljus', color: '#fff1bd', aperture: 65 },
  manljus: { name: 'Månljus', color: '#adcaff', aperture: 85 },
  magiskt: { name: 'Magiskt sken', color: '#c1a1ff', motion: .13 },
};
const svgNS = 'http://www.w3.org/2000/svg';
const defaults = () => ({ version: 1, darkness: .7, pixelsPerMeter: 40, environment: 'indoor', lights: [], geometry: [], freeSight: null });
const filter = id => 'map_id=eq.' + encodeURIComponent(id);
const ignoredMissingTable = error => /PGRST205|42P01|schema cache|could not find the table/i.test(error.message);
let editor, current, rendererModule;

async function load(map) {
  let rows;
  try {
    rows = await dbJson('campaign_map_academy?' + filter(map.id) + '&select=configuration,revision');
  } catch (error) {
    if (ignoredMissingTable(error)) return { config: null, positions: [] };
    throw error;
  }
  const config = rows[0]?.configuration ?? null;
  const positions = config ? await dbJson('campaign_map_character_positions?' + filter(map.id) + '&select=character_id,position') : [];
  return { config, positions, revision: rows[0]?.revision ?? 0 };
}

function mount(host, map) {
  const view = { host, map, renderer: null };
  host.dataset.kartakademinMount = map.id;
  view.ready = (rendererModule ??= import('./kartakademin-renderer.js')).then(module => module.mountLighting(host, map)).then(renderer => {
    if (view.closed) {
      renderer.destroy();
      return null;
    }
    view.renderer = renderer;
    return renderer;
  });
  return view;
}

function dispose(view) {
  if (!view) return;
  view.closed = true;
  view.renderer?.destroy();
}

function clearCampaign() {
  if (current) {
    dispose(current.view);
    current = null;
  }
}

async function syncCampaign(map, areas, refresh = false) {
  const host = document.getElementById('mapCanvas');
  if (!map?.image_url || document.getElementById('mapPage')?.classList.contains('hidden')) {
    clearCampaign();
    return;
  }
  if (current?.map.id !== map.id || current.map.image_url !== map.image_url) {
    clearCampaign();
    current = { map, host };
  }
  const state = current;
  state.areas = areas;
  const request = state.request = (state.request || 0) + 1;
  try {
    if (!state.data || refresh) {
      const data = await (refresh ? load(map) : (state.loading ??= load(map)));
      if (current !== state || state.request !== request) return;
      state.data = data;
      state.loading = null;
    }
    if (!state.data.config) {
      dispose(state.view);
      state.view = null;
      return;
    }
    state.view ??= mount(host, map);
    const renderer = await state.view.ready;
    if (current === state && state.request === request) renderer?.update(state.data.config, state.areas, state.data.positions);
  } catch (error) {
    if (current !== state || state.request !== request) return;
    state.loading = null;
    dispose(state.view);
    state.view = null;
    console.warn('Kartakademin kunde inte visas', error);
  }
}

function node(tag, attributes) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function option(value, text) {
  return new Option(text, value);
}

function closeEditor() {
  if (!editor) return;
  editor.disposeFlood?.();
  dispose(editor.view);
  editor.root.remove();
  editor = null;
}

async function openEditor(map, areas, imageUrl) {
  const opener = document.getElementById('mapAreaEditor');
  closeEditor();
  if (!canManageCampaignMaps() || !opener) return;
  const root = document.createElement('section');
  root.className = 'kartakademin-editor';
  root.innerHTML = `<button type="button" class="btn" data-open>Kartakademin · ljus och geometri</button>
    <div data-body hidden>
      <div class="kartakademin-controls">
        <label>Miljö<select data-config="environment"><option value="indoor">Inomhus</option><option value="outdoor">Utomhus</option><option value="underground">Under jord</option></select></label>
        <label>Grundmörker (%)<input data-config="darkness" type="number" min="60" max="80" step="1"></label>
        <label>Skala (px/m)<input data-config="pixelsPerMeter" type="number" min="0.01" step="0.01"></label>
        <label><input type="checkbox" data-player checked> Spelarförhandsvisning</label>
      </div>
      <div class="kartakademin-controls">
        <label>Verktyg<select data-tool><option value="light">Placera eller flytta ljus</option><option value="mask">Redigera fri sikt</option><option value="pan">Panorera</option><option value="geometry">Rita eller ersätt geometri</option><option value="position">Flytta rollperson</option></select></label>
        <label>Välj<select data-items></select></label>
        <button type="button" class="btn" data-new>Ny</button>
        <button type="button" class="btn" data-duplicate>Duplicera ljus</button>
        <button type="button" class="btn" data-remove>Ta bort</button>
      </div>
      <div data-light class="kartakademin-controls">
        <label>Typ<select name="type"></select></label>
        <label>Namn<input name="name" maxlength="80"></label>
        <label>Färg<input name="color" type="color"></label>
        <label>Styrka<input name="intensity" type="number" min="0" max="1" step=".05"></label>
        <label>Räckvidd (m)<input name="range" type="number" min=".1" max="100" step=".1"></label>
        <label>Höjd (m)<input name="height" type="number" min="0" max="100" step=".1"></label>
        <label>Fladder/puls<input name="motion" type="number" min="0" max="1" step=".01"></label>
        <label>Riktning (°)<input name="direction" type="number" min="0" max="359" step="1"></label>
        <label>Ljusvinkel (°)<input name="aperture" type="number" min="1" max="360" step="1"></label>
        <label>Infallsvinkel (°)<input name="inclination" type="number" min="0" max="90" step="1"></label>
        <label>Bärs av<select name="characterId"></select></label>
        <label><input name="on" type="checkbox"> Tänd</label>
      </div>
      <div data-geometry class="kartakademin-controls" hidden>
        <label><input name="closed" type="checkbox" checked> Sluten polygon</label>
        <label><input name="light" type="checkbox" checked> Blockerar ljus</label>
        <label><input name="sight" type="checkbox" checked> Blockerar sikt</label>
        <label><input name="movement" type="checkbox" checked> Blockerar rörelse</label>
        <button type="button" class="btn" data-undo>Ångra punkt</button>
        <button type="button" class="btn" data-finish>Slutför form</button>
      </div>
      <div data-mask-tools class="kartakademin-controls" hidden>
        <label>Fri sikt<select data-mask-mode><option value="flood">Flood fill</option><option value="paint">Pensel</option><option value="erase">Sudd</option><option value="add">Lägg till polygon</option><option value="subtract">Ta bort polygon</option></select></label>
        <div data-flood-panel class="kartakademin-controls">
          <label>Färgtolerans (%)<input data-flood="colorTolerance" type="number" min="0" max="100" value="12" required></label>
          <label>Kanttolerans (%)<input data-flood="edgeTolerance" type="number" min="0" max="100" value="100" required></label>
          <label><input data-flood="detectWalls" type="checkbox">Väggdetektering</label>
          <label>Väggkänslighet (%)<input data-flood="wallSensitivity" type="number" min="0" max="100" value="50" required disabled></label>
          <label>Kantutjämning (pass)<input data-flood="smoothing" type="number" min="0" max="4" value="0" required></label>
          <label>Max hålstorlek (maskpixlar)<input data-flood="maxHoleSize" type="number" min="0" max="2359296" value="0" required></label>
          <button type="button" class="btn" data-flood-accept disabled>Acceptera fyllning</button>
          <button type="button" class="btn" data-flood-cancel disabled>Avbryt fyllning</button>
          <output data-flood-status aria-live="polite">Klicka i området du vill fylla.</output>
        </div>
        <label>Penselradie (kartpixlar)<input data-radius type="number" min="1" max="1000" value="12" required></label>
        <button type="button" class="btn" data-mask-finish>Slutför polygon</button>
        <button type="button" class="btn" data-mask-undo>Ångra</button>
        <button type="button" class="btn" data-mask-redo>Gör om</button>
      </div>
      <div class="kartakademin-controls">
        <label>Zoom<input data-zoom type="range" min="1" max="5" step=".25" value="1"></label>
        <button type="button" class="btn" data-reset-view>Återställ vy</button>
      </div>
      <div class="kartakademin-viewport"><div class="kartakademin-board"><img alt=""><canvas data-mask-overlay hidden></canvas><svg aria-label="Redigeringsyta"></svg></div></div>
      <div class="kartakademin-controls"><button type="button" class="btn primary" data-save>Spara Kartakademin</button><output aria-live="polite"></output></div>
    </div>`;
  opener.querySelector('.map-area-editor').append(root);
  const get = selector => root.querySelector(selector);
  const body = get('[data-body]'), board = get('.kartakademin-board'), svg = get('svg');
  const menu = get('[data-items]'), tool = get('[data-tool]');
  const output = get('output:not([data-flood-status])');
  const announce = message => { output.textContent = message; };
  const lightForm = get('[data-light]'), geoForm = get('[data-geometry]');
  const roster = (Array.isArray(chars) ? chars : []).filter(character => character._dbId && !character.isNpc);
  get('select[name=type]').replaceChildren(...Object.entries(types).map(([key, type]) => option(key, type.name)));
  get('select[name=characterId]').replaceChildren(option('', 'Fast ljuskälla'), ...roster.map(c => option(c._dbId, c.name || c.identity?.namn || c._dbId)));
  svg.setAttribute('viewBox', `0 0 ${map.width} ${map.height}`);
  get('img').src = imageUrl;
  const state = editor = { root, view: null, config: defaults(), positions: [], changedPositions: new Set(), points: [], selected: '', saving: false };

  const maskOverlay = get('[data-mask-overlay]');
  const viewport = get('.kartakademin-viewport');
  const zoom = get('[data-zoom]');
  const maskMode = get('[data-mask-mode]');
  let mask, history, rgba, stroke, pan;
  const maskPoints = [];
  const floodPanel = get('[data-flood-panel]');
  const floodInputs = [...floodPanel.querySelectorAll('[data-flood]')];
  const acceptFlood = get('[data-flood-accept]'), cancelFlood = get('[data-flood-cancel]');
  const floodStatus = get('[data-flood-status]');
  let worker, floodPoint, floodPreview, floodTimer, floodRequest = 0;

  function resetFlood() {
    clearTimeout(floodTimer);
    floodRequest++;
    floodPoint = floodPreview = null;
    acceptFlood.disabled = cancelFlood.disabled = true;
    floodStatus.textContent = 'Klicka i området du vill fylla.';
    updateMaskOverlay();
  }

  state.disposeFlood = () => {
    clearTimeout(floodTimer);
    worker?.terminate();
  };

  function queueFlood() {
    clearTimeout(floodTimer);
    get('[data-flood="wallSensitivity"]').disabled = !get('[data-flood="detectWalls"]').checked;
    if (!floodPoint) return;
    const request = ++floodRequest;
    floodPreview = null;
    acceptFlood.disabled = true;
    cancelFlood.disabled = false;
    updateMaskOverlay();
    if (floodInputs.some(input => !input.validity.valid)) {
      floodStatus.textContent = 'Kontrollera värdena för fyllningen.';
      return;
    }
    floodStatus.textContent = 'Beräknar förhandsvisning…';
    floodTimer = setTimeout(() => {
      try {
        let image;
        if (!worker) {
          image = sampleMap();
          worker = new Worker(new URL('./kartakademin-flood-worker.js', import.meta.url), { type: 'module' });
          worker.onmessage = ({ data }) => {
            if (data.request !== floodRequest || !floodPoint) return;
            floodPreview = data.cells;
            acceptFlood.disabled = !floodPreview;
            floodStatus.textContent = data.error || 'Förhandsvisning. Acceptera eller avbryt.';
            updateMaskOverlay();
          };
          worker.onerror = () => {
            worker.terminate();
            worker = null;
            floodStatus.textContent = 'Förhandsvisningen kunde inte beräknas.';
          };
        }
        const options = Object.fromEntries(floodInputs.map(input => [
          input.dataset.flood, input.type === 'checkbox' ? input.checked : input.disabled ? 50 : input.valueAsNumber,
        ]));
        worker.postMessage({ request, mask, point: floodPoint, options, image });
      } catch (error) {
        floodStatus.textContent = error.message;
      }
    }, 100);
  }

  floodPanel.oninput = queueFlood;
  cancelFlood.onclick = resetFlood;
  acceptFlood.onclick = () => {
    if (!floodPreview) return;
    const before = mask.cells.slice();
    mask.cells.set(floodPreview);
    resetFlood();
    commitMask(before);
  };

  function updateMaskOverlay() {
    const visible = tool.value === 'mask' && !get('[data-player]').checked;
    maskOverlay.hidden = !visible;
    floodPanel.hidden = maskMode.value !== 'flood';
    get('[data-mask-undo]').disabled = !!floodPoint || (!history?.canUndo() && !maskPoints.length);
    get('[data-mask-redo]').disabled = !!floodPoint || !history?.canRedo() || !!maskPoints.length;
    get('[data-mask-finish]').disabled = maskPoints.length < 3;
    if (!visible || !mask) return;
    const context = maskOverlay.getContext('2d');
    const pixels = context.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.cells.length; i++) {
      if (!(floodPreview ?? mask.cells)[i]) continue;
      const offset = i * 4;
      pixels.data[offset] = mask.cells[i] ? 45 : 255;
      pixels.data[offset + 1] = 255;
      pixels.data[offset + 2] = mask.cells[i] ? 190 : 40;
      pixels.data[offset + 3] = 90;
    }
    context.putImageData(pixels, 0, 0);
  }

  function commitMask(before) {
    history.record(before);
    state.config.freeSight = serializeMask(mask);
    draw();
  }

  function brushPoint(event, clamp = false) {
    const inverse = svg.getScreenCTM()?.inverse();
    if (!inverse) return null;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    if (!clamp && (x < 0 || y < 0 || x >= map.width || y >= map.height)) return null;
    return [Math.min(map.width - .001, Math.max(0, x)), Math.min(map.height - .001, Math.max(0, y))];
  }

  function sampleMap() {
    if (rgba) return rgba;
    const image = get('img');
    if (!image.complete || !image.naturalWidth) throw Error('Kartbilden laddas fortfarande.');
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, mask.width, mask.height);
    rgba = context.getImageData(0, 0, mask.width, mask.height).data;
    return rgba;
  }

  function refreshList() {
    let elements;
    if (tool.value === 'light') elements = state.config.lights.map(light => option(light.id, light.name));
    else if (tool.value === 'geometry') elements = state.config.geometry.map((shape, i) => option(shape.id, 'Form ' + (i + 1)));
    else elements = roster.map(c => option(c._dbId, c.name || c.identity?.namn || c._dbId));
    menu.replaceChildren(option('', tool.value === 'position' ? 'Välj rollperson' : 'Ny'), ...elements);
    menu.value = state.selected;
    const drawingMask = tool.value === 'mask';
    menu.closest('label').hidden = drawingMask || tool.value === 'pan';
    get('[data-mask-tools]').hidden = !drawingMask;
    const light = state.config.lights.find(item => item.id === state.selected);
    lightForm.hidden = tool.value !== 'light';
    geoForm.hidden = tool.value !== 'geometry';
    get('[data-duplicate]').disabled = !light;
    get('[data-new]').disabled = drawingMask || tool.value === 'pan' || tool.value === 'position';
    get('[data-remove]').disabled = !state.selected;
    for (const input of lightForm.querySelectorAll('[name]')) {
      input.disabled = !light;
      if (input.type === 'checkbox') input.checked = Boolean(light?.[input.name]);
      else input.value = light?.[input.name] ?? '';
    }
    const shape = state.config.geometry.find(item => item.id === state.selected);
    for (const field of geoForm.querySelectorAll('input')) field.checked = shape?.[field.name] ?? true;
  }

  function draw() {
    state.view?.renderer?.update(state.config, areas, state.positions, !get('[data-player]').checked);
    updateMaskOverlay();
    svg.replaceChildren();
    const showTools = !get('[data-player]').checked;
    if (!showTools) return;
    if (tool.value === 'mask' && maskPoints.length) {
      svg.append(node('polyline', { points: maskPoints.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#53ffc4', 'stroke-width': 2 }));
      for (const [x,y] of maskPoints) svg.append(node('circle', { cx:x, cy:y, r:map.width / 220, fill:'#53ffc4' }));
    }
    for (const shape of state.config.geometry) {
      svg.append(node(shape.closed ? 'polygon' : 'polyline', {
        points: shape.points.map(p => p.join(',')).join(' '),
        fill: shape.closed ? '#dc86452a' : 'none', stroke: shape.id === state.selected ? '#fff2ac' : '#ed9557',
        'stroke-width': 2,
      }));
    }
    for (const point of state.points) svg.append(node('circle', { cx: point[0], cy: point[1], r: map.width / 200, fill: '#ffe897' }));
    if (state.points.length) svg.append(node('polyline', { points: state.points.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#ffe897', 'stroke-width': 2 }));
    const markers = [...state.config.lights.filter(light => !light.characterId).map(light => ({ id: light.id, position: light.position, color: light.color })),
      ...state.positions.map(p => ({ id: p.character_id, position: p.position, color: '#66d8ff' }))];
    for (const marker of markers) {
      svg.append(node('circle', { cx: marker.position[0], cy: marker.position[1], r: map.width / 130,
        fill: marker.color, stroke: marker.id === state.selected ? '#fff' : '#36312b', 'stroke-width': 2 }));
    }
    const observer = state.positions.find(p => p.character_id === state.selected);
    const freeSight = prepareFreeSight(map.width, map.height, state.config.freeSight);
    if (tool.value === 'position' && observer && freeSight && isFree(freeSight, observer.position) && !isBlocked(state.config.geometry, observer.position, 'sight')) {
      const sight = visibilityPolygon(observer.position, Math.hypot(map.width, map.height), blockers(state.config.geometry, 'sight'), 0, 360, freeSight);
      svg.prepend(node('polygon', { points: sight.map(p => p.join(',')).join(' '), fill: '#66d8ff22', stroke: '#66d8ff', 'stroke-width': 1 }));
    }
  }

  function select(id) {
    state.selected = id;
    state.points = [];
    refreshList();
    draw();
  }

  get('[data-open]').onclick = async () => {
    if (!body.hidden) {
      body.hidden = true;
      resetFlood();
      dispose(state.view);
      state.view = null;
      return;
    }
    body.hidden = false;
    if (state.initializing) return;
    state.initializing = true;
    try {
      if (!state.loaded) {
        const data = await load(map);
        if (editor !== state) return;
        state.config = data.config ?? defaults();
        state.revision = data.revision ?? 0;
        state.positions = data.positions;
        mask = createMask(map.width, map.height, state.config.freeSight);
        history = maskHistory(mask.cells);
        maskOverlay.width = mask.width;
        maskOverlay.height = mask.height;
        state.config.freeSight ??= serializeMask(mask);
        state.loaded = true;
      }
      for (const input of root.querySelectorAll('[data-config]')) {
        const value = state.config[input.dataset.config];
        input.value = input.dataset.config === 'darkness' ? value * 100 : value;
      }
      refreshList();
      if (!body.hidden) {
        state.view = mount(board, { ...map, image_url: imageUrl });
        await state.view.ready;
        if (editor === state) draw();
      }
    } catch (error) {
      announce('Förhandsvisningen kunde inte öppnas: ' + error.message);
    } finally {
      state.initializing = false;
    }
  };

  root.onchange = event => {
    const input = event.target;
    if (input === menu) return select(menu.value);
    if (input === maskMode || input === zoom || input.dataset.flood) return;
    if (input === tool) {
      get('[data-player]').checked = false;
      if (tool.value !== 'pan' && tool.value !== 'mask') resetFlood();
      maskPoints.length = 0;
      return select('');
    }
    const key = input.dataset.config;
    if (key) {
      if (!input.reportValidity()) return;
      state.config[key] = key === 'environment' ? input.value : input.valueAsNumber / (key === 'darkness' ? 100 : 1);
    } else if (lightForm.contains(input)) {
      const light = state.config.lights.find(item => item.id === state.selected);
      if (!light || !input.reportValidity()) return;
      light[input.name] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.valueAsNumber : input.value;
      if (input.name === 'type') {
        const preset = types[light.type];
        if (Object.values(types).some(type => light.name.startsWith(type.name + ' ') && /^\d+$/.test(light.name.slice(type.name.length + 1)))) {
          light.name = nextName(preset, light.id);
        }
        Object.assign(light, { color: preset.color, aperture: preset.aperture ?? 360, motion: preset.motion ?? 0 });
      }
      if (input.name === 'name' || input.name === 'type') refreshList();
    } else if (geoForm.contains(input)) {
      const shape = state.config.geometry.find(item => item.id === state.selected);
      if (shape && input.name !== 'closed') shape[input.name] = input.checked;
    }
    draw();
  };
  get('[data-new]').onclick = () => {
    get('[data-player]').checked = false;
    select('');
  };
  get('[data-undo]').onclick = () => { state.points.pop(); draw(); };
  get('[data-finish]').onclick = () => {
    const flags = Object.fromEntries([...geoForm.querySelectorAll('input')].map(input => [input.name, input.checked]));
    if (state.points.length < (flags.closed ? 3 : 2)) return announce('Rita fler punkter.');
    const id = state.selected || crypto.randomUUID();
    const shape = { id, points: state.points, ...flags };
    state.config.geometry = [...state.config.geometry.filter(item => item.id !== id), shape];
    select(id);
  };
  get('[data-remove]').onclick = () => {
    if (tool.value === 'position') {
      state.positions = state.positions.filter(p => p.character_id !== state.selected);
      state.changedPositions.add(state.selected);
    } else {
      const key = tool.value === 'geometry' ? 'geometry' : 'lights';
      state.config[key] = state.config[key].filter(item => item.id !== state.selected);
    }
    select('');
  };
  function nextName(preset, except) {
    let number = 1;
    while (state.config.lights.some(light => light.id !== except && light.name === preset.name + ' ' + number)) number++;
    return preset.name + ' ' + number;
  }
  function addLight(position, source) {
    const type = source?.type || 'fackla', preset = types[type];
    const id = crypto.randomUUID();
    state.config.lights.push({
      type, intensity: 1, range: 6, height: 1.5, direction: 0, aperture: preset.aperture ?? 360,
      inclination: 45, motion: preset.motion ?? 0, color: preset.color, on: true, characterId: '',
      ...source, id, name: nextName(preset), position,
    });
    select(id);
  }
  get('[data-duplicate]').onclick = () => {
    const light = state.config.lights.find(item => item.id === state.selected);
    if (light) addLight(light.position.slice(), light);
  };
  zoom.oninput = () => { board.style.width = zoom.valueAsNumber * 100 + '%'; };
  get('[data-reset-view]').onclick = () => {
    zoom.value = '1';
    zoom.oninput();
    viewport.scrollTo(0, 0);
  };
  maskMode.onchange = () => { resetFlood(); maskPoints.length = 0; draw(); };
  get('[data-mask-undo]').onclick = () => {
    if (maskPoints.length) { maskPoints.pop(); draw(); }
    else if (history.undo()) { state.config.freeSight = serializeMask(mask); draw(); }
  };
  get('[data-mask-redo]').onclick = () => {
    if (history.redo()) { state.config.freeSight = serializeMask(mask); draw(); }
  };
  get('[data-mask-finish]').onclick = () => {
    if (maskPoints.length < 3) return;
    const before = mask.cells.slice();
    polygonMask(mask, maskPoints, Number(maskMode.value === 'add'));
    maskPoints.length = 0;
    commitMask(before);
  };
  svg.onpointerdown = event => {
    if (!state.loaded || !event.isPrimary || event.button !== 0) return;
    if (tool.value === 'pan') {
      pan = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      svg.setPointerCapture(event.pointerId);
      return;
    }
    if (tool.value !== 'mask' || !['paint', 'erase'].includes(maskMode.value)) return;
    const point = brushPoint(event);
    const size = get('[data-radius]');
    if (!point || !size.reportValidity()) return;
    get('[data-player]').checked = false;
    stroke = { before: mask.cells.slice(), point, radius: size.valueAsNumber, value: Number(maskMode.value === 'paint') };
    svg.setPointerCapture(event.pointerId);
    paintMask(mask, point, point, stroke.radius, stroke.value);
    updateMaskOverlay();
  };
  svg.onpointermove = event => {
    if (!event.isPrimary) return;
    if (pan) viewport.scrollTo(pan.left + pan.x - event.clientX, pan.top + pan.y - event.clientY);
    if (!stroke) return;
    const point = brushPoint(event, true);
    if (!point) return;
    paintMask(mask, stroke.point, point, stroke.radius, stroke.value);
    stroke.point = point;
    updateMaskOverlay();
  };
  svg.onpointerup = svg.onlostpointercapture = () => {
    pan = null;
    if (!stroke) return;
    const { before } = stroke;
    stroke = null;
    commitMask(before);
  };
  svg.onclick = event => {
    if (!state.loaded || tool.value === 'pan') return;
    const point = brushPoint(event);
    if (!point) return;
    get('[data-player]').checked = false;
    if (tool.value === 'mask') {
      if (maskMode.value === 'flood') {
        floodPoint = point;
        queueFlood();
      } else if (['add', 'subtract'].includes(maskMode.value)) { maskPoints.push(point); draw(); }
      return;
    }
    if (tool.value === 'geometry') state.points.push(point);
    else if (tool.value === 'position') {
      if (!state.selected) return announce('Välj en rollperson först.');
      const origin = state.positions.find(p => p.character_id === state.selected)?.position;
      if (!canMove(state.config.geometry, origin, point)) return announce('Platsen blockerar rörelse.');
      state.positions = [...state.positions.filter(p => p.character_id !== state.selected), { character_id: state.selected, position: point }];
      state.changedPositions.add(state.selected);
    } else {
      const light = state.config.lights.find(item => item.id === state.selected);
      if (light) light.position = point;
      else addLight(point);
    }
    draw();
  };
  get('[data-save]').onclick = async () => {
    if (!state.loaded || state.saving || [...root.querySelectorAll('input[type=number]:enabled')].some(input => !input.reportValidity())) return;
    if (floodPoint) return announce('Acceptera eller avbryt förhandsvisningen före sparning.');
    if (state.points.length || maskPoints.length || stroke) return announce('Slutför eller ångra den påbörjade formen före sparning.');
    state.saving = true;
    const save = get('[data-save]');
    save.disabled = true;
    const changes = [...state.changedPositions].map(character_id => ({
      character_id,
      position: state.positions.find(p => p.character_id === character_id)?.position ?? null,
    }));
    body.inert = true;
    try {
      state.revision = await dbJson('rpc/save_campaign_map_academy', {
        method: 'POST',
        body: JSON.stringify({
          p_map_id: map.id, p_campaign_id: map.campaign_id, p_configuration: state.config,
          p_revision: state.revision, p_positions: changes,
        }),
      });
      state.changedPositions.clear();
      announce('Kartakademin sparad.');
    } catch (error) {
      announce('Sparningen avbröts: ' + error.message);
    } finally {
      state.saving = false;
      body.inert = false;
      save.disabled = false;
    }
  };
}

window.aleaKartakademin = { openEditor, closeEditor, syncCampaign, clearCampaign };
