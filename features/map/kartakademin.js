import './kartakademin.css';
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
const defaults = () => ({ version: 1, darkness: .7, pixelsPerMeter: 40, environment: 'indoor', lights: [], geometry: [] });
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
        <label>Verktyg<select data-tool><option value="light">Placera eller flytta ljus</option><option value="geometry">Rita eller ersätt geometri</option><option value="position">Flytta rollperson</option></select></label>
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
      <div class="kartakademin-board"><img alt=""><svg aria-label="Redigeringsyta"></svg></div>
      <div class="kartakademin-controls"><button type="button" class="btn primary" data-save>Spara Kartakademin</button><output aria-live="polite"></output></div>
    </div>`;
  opener.querySelector('.map-area-editor').append(root);
  const get = selector => root.querySelector(selector);
  const body = get('[data-body]'), board = get('.kartakademin-board'), svg = get('svg');
  const menu = get('[data-items]'), tool = get('[data-tool]');
  const output = get('output');
  const announce = message => { output.textContent = message; };
  const lightForm = get('[data-light]'), geoForm = get('[data-geometry]');
  const roster = (Array.isArray(chars) ? chars : []).filter(character => character._dbId && !character.isNpc);
  get('select[name=type]').replaceChildren(...Object.entries(types).map(([key, type]) => option(key, type.name)));
  get('select[name=characterId]').replaceChildren(option('', 'Fast ljuskälla'), ...roster.map(c => option(c._dbId, c.name || c.identity?.namn || c._dbId)));
  svg.setAttribute('viewBox', `0 0 ${map.width} ${map.height}`);
  get('img').src = imageUrl;
  const state = editor = { root, view: null, config: defaults(), positions: [], changedPositions: new Set(), points: [], selected: '', saving: false };

  function refreshList() {
    let elements;
    if (tool.value === 'light') elements = state.config.lights.map(light => option(light.id, light.name));
    else if (tool.value === 'geometry') elements = state.config.geometry.map((shape, i) => option(shape.id, 'Form ' + (i + 1)));
    else elements = roster.map(c => option(c._dbId, c.name || c.identity?.namn || c._dbId));
    menu.replaceChildren(option('', tool.value === 'position' ? 'Välj rollperson' : 'Ny'), ...elements);
    menu.value = state.selected;
    const light = state.config.lights.find(item => item.id === state.selected);
    lightForm.hidden = tool.value !== 'light';
    geoForm.hidden = tool.value !== 'geometry';
    get('[data-duplicate]').disabled = !light;
    get('[data-new]').disabled = tool.value === 'position';
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
    svg.replaceChildren();
    const showTools = !get('[data-player]').checked;
    if (!showTools) return;
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
    if (tool.value === 'position' && observer && !isBlocked(state.config.geometry, observer.position, 'sight')) {
      const sight = visibilityPolygon(observer.position, Math.hypot(map.width, map.height), blockers(state.config.geometry, 'sight'));
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
    if (input === tool) {
      get('[data-player]').checked = false;
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
  svg.onclick = event => {
    if (!state.loaded) return;
    const inverse = svg.getScreenCTM()?.inverse();
    if (!inverse) return;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    if (x < 0 || y < 0 || x > map.width || y > map.height) return;
    const point = [x, y].map(n => Math.round(n * 10) / 10);
    get('[data-player]').checked = false;
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
    if (state.points.length) return announce('Slutför eller ångra den påbörjade formen före sparning.');
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
