import './kartakademin.css';
import '../combat/battle-map-effects.js';
import { createMask, findSmallSolidIslands, isFree, maskHistory, paintMask, polygonMask, prepareFreeSight, serializeMask } from './kartakademin-mask.js';
import { FREE_SIGHT_RESET_CONFIRMATION, FREE_SIGHT_RESET_LABEL, removalConfirmation, resetFreeSight, toolsForMode } from './kartakademin-actions.js';
import { blockers, canMove, contains, isBlocked, mapDistanceMeters, pointIsExplored, visibilityPolygon } from './kartakademin-geometry.js';

const types = {
  fackla: { name: 'Fackla', color: '#ffb060', motion: .18 },
  lykta: { name: 'Lykta', color: '#ffd59b', motion: .06 },
  eldstad: { name: 'Eldstad', color: '#ff9349', motion: .22 },
  solljus: { name: 'Infallande solljus', color: '#fff1bd', aperture: 65 },
  manljus: { name: 'Månljus', color: '#adcaff', aperture: 85 },
  magiskt: { name: 'Magiskt sken', color: '#c1a1ff', motion: .13 },
};
const svgNS = 'http://www.w3.org/2000/svg';
const defaults = () => ({ version: 1, darkness: .7, pixelsPerMeter: 40, environment: 'indoor', lights: [], geometry: [], freeSight: null, characterTokenStyles: {} });
const filter = id => 'map_id=eq.' + encodeURIComponent(id);
const ignoredMissingTable = error => /PGRST202|PGRST205|42P01|schema cache|could not find the table/i.test(error.message);
let editor, current, rendererModule;

async function load(map, manager = canManageCampaignMaps()) {
  let rows;
  try {
    if (!manager) {
      const config = await dbJson('rpc/read_campaign_map_academy_player', {
        method: 'POST', body: JSON.stringify({ p_map_id: map.id }),
      });
      return { config: config && Number(map.pixels_per_meter) > 0 ? { ...config, pixelsPerMeter: Number(map.pixels_per_meter) } : config, positions: [] };
    }
    rows = await dbJson('campaign_map_academy?' + filter(map.id) + '&select=configuration,revision');
  } catch (error) {
    if (ignoredMissingTable(error)) return { config: null, positions: [] };
    throw error;
  }
  const saved = rows[0]?.configuration ?? null;
  const config = saved && Number(map.pixels_per_meter) > 0 ? { ...saved, pixelsPerMeter: Number(map.pixels_per_meter) } : saved;
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
  const manager = canManageCampaignMaps();
  if (current?.map.id !== map.id || current.map.image_url !== map.image_url || current.manager !== manager) {
    clearCampaign();
    current = { map, host, manager };
  }
  const state = current;
  state.areas = areas;
  const request = state.request = (state.request || 0) + 1;
  try {
    if (!state.data || refresh) {
      const data = await (refresh ? load(map, manager) : (state.loading ??= load(map, manager)));
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
  editor.root.closest('.map-area-editor')?.querySelector('[data-mask-overlay]')?.remove();
  editor.root.closest('.map-area-editor')?.querySelectorAll('#mapAreaSvg :is([data-object-layer],[data-academy-layer],[data-character-token-layer],[data-ruler-layer])').forEach(layer => layer.remove());
  const canvas = editor.root.closest('.map-area-editor')?.querySelector('#mapAreaCanvas');
  for (const property of ['width', 'left', 'top']) canvas?.style.removeProperty(property);
  canvas?.classList.remove('kartakademin-light-only');
  if (editor.workspace?.parentElement) {
    const parent = editor.workspace.parentElement;
    for (const node of [editor.roomToolbar, editor.roomNotice, editor.mapBoard, editor.roomList]) parent.insertBefore(node, editor.workspace);
  }
  editor.root.remove();
  editor.settings.remove();
  editor.workspace?.remove();
  editor = null;
}

async function openEditor(map, areas, imageUrl) {
  const opener = document.getElementById('mapAreaEditor');
  closeEditor();
  if (!canManageCampaignMaps() || !opener) return;
  const root = document.createElement('section');
  root.className = 'kartakademin-editor';
  const roomHelp = window.aleaSectionHelp;
  roomHelp?.register('kartverkstad-rum', {
    title: 'Rumsverktyg',
    paragraphs: [
      'Rita minst tre hörn. Nya punkter fäster mot befintliga hörn och kanter. Tomrum mellan rum är tillåtna, men polygoner får inte överlappa.',
      'Välj Infoga punkt och klicka nära en kant. Dra ett hörn för att flytta det. Koppla sedan polygonen till en plats i rumslistan.',
    ],
  });
  root.innerHTML = `<div data-body>
      <details class="kartakademin-settings" data-settings-panel open>
        <summary>Kartinställningar</summary>
        <div class="kartakademin-settings-grid">
          <fieldset><legend>Miljö</legend><label><input type="radio" name="map-environment" data-config="environment" value="outdoor"> Utomhus</label><label><input type="radio" name="map-environment" data-config="environment" value="indoor"> Inomhus</label><label><input type="radio" name="map-environment" data-config="environment" value="underground"> Underjord</label></fieldset>
          <label>Grundmörker (%)<input data-config="darkness" type="number" min="60" max="80" step="1"></label>
          <label>Kartans bredd (m)<input data-config="pixelsPerMeter" type="number" min="0.01" step="any" required></label>
          <output data-map-scale aria-label="Kartskala"></output>
          <label>Norr (° medurs)<input data-config="north" type="number" min="0" max="359" step="1" required></label>
          <button type="button" class="btn" data-reset-north>Återställ norr</button>
        </div>
      </details>
      <div class="kartakademin-mode-controls" data-mode-controls>
        <div class="kartakademin-view-controls">
          <button type="button" class="btn" data-zoom-out aria-label="Zooma ut">−</button>
          <label>Zoom <output data-zoom-percent>100 %</output><input data-zoom type="range" min="0.02" max="5" step="any" value="1"></label>
          <button type="button" class="btn" data-zoom-in aria-label="Zooma in">+</button>
          <button type="button" class="btn" data-pan-tool aria-pressed="false" title="Panorera med vänster musknapp"><span aria-hidden="true">✋︎</span> Panorera</button>
          <button type="button" class="btn" data-ruler-tool aria-pressed="false"><span aria-hidden="true">📏</span> Linjal</button>
          <output data-measurement aria-label="Uppmätt avstånd" hidden></output>
          <button type="button" class="btn" data-fit-view title="Anpassa hela kartan till vyn">Anpassa</button>
          <button type="button" class="btn" data-reset-view title="Återställ zoom och panorering">Återställ vy</button>
        </div>
        <details class="kartakademin-layers-panel" open>
          <summary>Synliga kartlager</summary>
          <div class="kartakademin-layers" aria-label="Synliga kartlager"><label><input type="checkbox" data-layer="rooms" checked> Rumsgränser</label><label><input type="checkbox" data-player> Rummens upptäcktsstatus</label><label><input type="checkbox" data-layer="effects" checked> Effektområden</label><label><input type="checkbox" data-layer="sight" checked> Fri sikt</label><label><input type="checkbox" data-layer="solid"> Solid</label><label><input type="checkbox" data-layer="lights" checked> Ljuskällor</label><label><input type="checkbox" data-layer="characters" checked> Rollpersoner</label><label><input type="checkbox" data-layer="objects" checked> Objekt</label></div>
        </details>
        <label class="kartakademin-preview-switch"><input type="checkbox" data-light-only> Visa endast ljusresultat</label>
      </div>
      <nav class="kartakademin-mode-nav" data-mode-nav aria-label="Kartverkstadens redigeringslägen" role="tablist">
        <button type="button" role="tab" data-mode-button="rooms" aria-selected="true">Rum</button>
        <button type="button" role="tab" data-mode-button="sight" aria-selected="false">Sikt</button>
        <button type="button" role="tab" data-mode-button="lights" aria-selected="false">Ljus</button>
        <button type="button" role="tab" data-mode-button="effects" aria-selected="false">Effekt</button>
        <button type="button" role="tab" data-mode-button="objects" aria-selected="false">Objekt</button>
        <button type="button" role="tab" disabled aria-disabled="true" title="Kommande funktion: Varelse">Varelse</button>
      </nav>
      <div class="kartakademin-controls" data-tool-picker></div><select data-tool hidden aria-hidden="true" tabindex="-1"></select>
      <label class="kartakademin-mode-select" hidden>Redigeringsläge<select data-mode aria-hidden="true" tabindex="-1"><option value="rooms">Rum</option><option value="effects">Områdeseffekter</option><option value="sight">Sikt och hinder</option><option value="lights">Ljuskällor</option><option value="objects">Objekt</option></select></label>
      <div class="kartakademin-controls" data-tool-controls>
        <label data-item-select>Välj<select data-items></select></label>
        <label data-token-style-control>Visning<select data-token-style><option value="portrait">Porträtt</option><option value="battlepose">Battlepose</option></select></label>
        <details data-token-preview hidden><summary>Förstora figur</summary><svg viewBox="-80 -180 160 240" role="img" aria-label="Förstorad battlepose"></svg></details>
        <button type="button" class="btn" data-token-demo>Placera Astrid och Evalin</button>
        <div data-light-list class="kartakademin-light-list" role="listbox" aria-label="Ljuskällor" hidden></div>
        <button type="button" class="btn" data-new>Ny ljuskälla</button>
        <button type="button" class="btn" data-duplicate>Duplicera ljuskälla</button>
        <button type="button" class="btn kartakademin-destructive" data-remove>Ta bort</button>
      </div>
      <div data-light class="kartakademin-controls">
        <h3>Vald ljuskälla</h3>
        <label>Typ<select name="type"></select></label>
        <label>Namn<input name="name" maxlength="80"></label>
        <label>Färg<input name="color" type="color"></label>
        <label>Styrka<input name="intensity" type="number" min="0" max="3" step=".05"></label>
        <label>Räckvidd (m)<input name="range" type="number" min=".1" max="100" step=".1"></label>
        <label>Höjd (m)<input name="height" type="number" min="0" max="100" step=".1"></label>
        <label>Fladder/puls<input name="motion" type="number" min="0" max="1" step=".01"></label>
        <label data-directional>Form<select name="beam"><option value="">Befintligt riktat ljus</option><option value="parallel">Parallellt ljus</option><option value="cone">Ljuskon</option><option value="overhead">Ljus uppifrån</option></select></label>
        <label data-beam-width>Bredd (m)<input name="beamWidth" type="number" min=".1" max="100" step=".1"></label>
        <label data-beam-size>Kantmjukhet (%)<input name="edgeSoftness" type="number" min="0" max="100" step="1"></label>
        <label>Riktning (°)<input name="direction" type="number" min="0" max="359" step="1"></label>
        <label>Ljusvinkel (°)<input name="aperture" type="number" min="1" max="360" step="1"></label>
        <label>Infallsvinkel (°)<input name="inclination" type="number" min="0" max="90" step="1"></label>
        <label>Bärs av<select name="characterId"></select></label>
        <label><input name="on" type="checkbox"> Tänd</label>
        <label><input name="playerVisible" type="checkbox"> Dela ljuset i utforskade rum</label>
      </div>
      <div data-geometry class="kartakademin-controls" hidden>
        <h3>Hindergeometri</h3>
        <label><input name="closed" type="checkbox" checked> Sluten polygon</label>
        <label><input name="light" type="checkbox" checked> Blockerar ljus</label>
        <label><input name="sight" type="checkbox" checked> Blockerar sikt</label>
        <label><input name="movement" type="checkbox" checked> Blockerar rörelse</label>
        <button type="button" class="btn" data-undo>Ångra punkt</button>
        <button type="button" class="btn" data-finish>Slutför form</button>
      </div>
      <div data-mask-tools class="kartakademin-controls" hidden>
        <div class="kartakademin-mask-picker" role="group" aria-label="Fri sikt">
          <button type="button" class="btn" data-mask-tool="flood"><span aria-hidden="true">◈</span> Flood fill</button>
          <button type="button" class="btn" data-mask-tool="paint"><span aria-hidden="true">✎</span> Pensel</button>
          <button type="button" class="btn" data-mask-tool="erase"><span aria-hidden="true">▱</span> Sudd</button>
          <button type="button" class="btn" data-mask-tool="add"><span aria-hidden="true">⬠</span> +Polygon</button><button type="button" class="btn" data-mask-tool="subtract"><span aria-hidden="true">⬠</span> −Polygon</button>
        </div>
        <select data-mask-mode hidden aria-hidden="true"><option value="flood">Flood fill</option><option value="paint">Pensel</option><option value="erase">Sudd</option><option value="add">+Polygon</option><option value="subtract">−Polygon</option></select>
        <div data-flood-panel class="kartakademin-controls">
          <div class="kartakademin-flood-basic">
            <label>Färgtolerans (%)<input data-flood="colorTolerance" type="number" min="0" max="100" value="12" required></label>
            <label>Kanttolerans (%)<input data-flood="edgeTolerance" type="number" min="0" max="100" value="100" required></label>
            <label><input data-flood="detectWalls" type="checkbox">Väggdetektering</label>
          </div>
          <details class="kartakademin-advanced-flood">
            <summary>Avancerade inställningar</summary>
            <label>Väggkänslighet (%)<input data-flood="wallSensitivity" type="number" min="0" max="100" value="50" required disabled></label>
            <label>Kantutjämning (pass)<input data-flood="smoothing" type="number" min="0" max="4" value="0" required></label>
            <label>Max hålstorlek (maskpixlar)<input data-flood="maxHoleSize" type="number" min="0" max="2359296" value="0" required></label>
          </details>
          <div class="kartakademin-flood-actions">
            <button type="button" class="btn" data-flood-cancel disabled>Avbryt fyllning</button>
          </div>
          <output data-flood-status aria-live="polite">Klicka i området du vill fylla.</output>
        </div>
        <label>Maximal fläckstorlek (maskpixlar)<input data-island-size type="number" min="1" max="1000" value="8"></label>
        <button type="button" class="btn" data-find-islands>Granska små Solid-fläckar</button>
        <output data-island-status aria-live="polite"></output>
        <label data-brush-size>Penselradie (kartpixlar)<input data-radius type="number" min="1" max="1000" value="12" required></label>
        <button type="button" class="btn" data-mask-finish>Slutför polygon</button>
        <div class="kartakademin-mask-history">
          <button type="button" class="btn" data-mask-undo>Ångra</button>
          <button type="button" class="btn" data-mask-redo>Gör om</button>
        </div>
        <button type="button" class="btn kartakademin-destructive" data-mask-reset>Nollställ fri sikt</button>
      </div>
      <div class="kartakademin-controls kartakademin-save-row" data-save-row>
        <output data-save-status data-status="clean" aria-live="polite">Inga ändringar</output>
        <button type="button" class="btn primary" data-save>Spara ändringar</button>
        <output data-save-message aria-live="polite"></output>
      </div>
    </div>`;
  const toolbar = opener.querySelector('.map-area-toolbar');
  const modal = opener;
  toolbar.before(root);
  const get = selector => opener.querySelector(selector);
  const body = get('[data-body]'), board = document.getElementById('mapAreaCanvas'), svg = document.getElementById('mapAreaSvg');
  const menu = get('[data-items]'), tool = get('[data-tool]'), mode = get('[data-mode]');
  const modeNav = get('[data-mode-nav]');
  const modeButtons = [...modeNav.querySelectorAll('[data-mode-button]')];
  const roomNotice = document.getElementById('mapAreaNotice'), roomList = document.getElementById('mapAreaList');
  const workspace = document.createElement('div'); workspace.className = 'map-area-workspace';
  const mapStage = document.createElement('div'); mapStage.className = 'map-area-map-stage';
  const toolPanel = document.createElement('aside'); toolPanel.className = 'map-area-tool-panel';
  const leftPanel = document.createElement('aside');
  leftPanel.className = 'kartakademin-navigation';
  const settings = get('[data-settings-panel]');
  modal.insertBefore(workspace, root);
  const center = document.createElement('div');
  center.className = 'kartakademin-center';
  const controls = document.createElement('div');
  controls.className = 'kartakademin-footer';
  controls.append(get('.kartakademin-view-controls'), get('.kartakademin-mask-history'), get('[data-save-row]'));
  workspace.append(leftPanel, center, toolPanel);
  leftPanel.append(settings, get('[data-mode-controls]'));
  center.append(modeNav, mapStage, controls);
  mapStage.append(board);
  const frame = document.createElement('div');
  frame.className = 'kartakademin-frame';
  frame.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 4; i++) frame.append(document.createElement('span'));
  mapStage.append(frame);
  const toolHeader = document.createElement('div');
  toolHeader.className = 'kartakademin-panel-heading';
  toolHeader.innerHTML = `<h3></h3>${roomHelp?.button('kartverkstad-rum') ?? ''}`;
  toolPanel.append(toolHeader, toolbar, roomNotice, roomList, root);
  const output = get('[data-save-message]');
  const saveStatus = get('[data-save-status]');
  const announce = message => { output.textContent = message; };
  const setSaveStatus = (text, status) => { saveStatus.textContent = text; saveStatus.dataset.status = status; };
  const markDirty = () => { state.dirty = true; setSaveStatus('Osparade ändringar', 'dirty'); };
  const lightForm = get('[data-light]'), geoForm = get('[data-geometry]');
  const roster = (Array.isArray(chars) ? chars : []).filter(character => character._dbId && !character.isNpc);
  get('select[name=type]').replaceChildren(...Object.entries(types).map(([key, type]) => option(key, type.name)));
  get('select[name=characterId]').replaceChildren(option('', 'Fast ljuskälla'), ...roster.map(c => option(c._dbId, c.name || c.identity?.namn || c._dbId)));
  svg.setAttribute('viewBox', `0 0 ${map.width} ${map.height}`);
  document.getElementById('mapAreaImage').src = imageUrl;
  const state = editor = { root, workspace, settings, roomToolbar: toolbar, roomNotice, roomList, mapBoard: board, view: null, config: defaults(), positions: [], changedPositions: new Set(), points: [], selected: '', saving: false, dirty: false, mode: 'rooms', tool: 'room', layers: { rooms: true, effects: true, sight: true, solid: false, lights: true, characters: true, objects: true } };
  const academyLayer = document.createElementNS(svgNS, 'g'); academyLayer.dataset.academyLayer = ''; svg.append(academyLayer);

  const objectLayer = node('g', { 'data-object-layer': '', 'pointer-events': 'none' });
  academyLayer.before(objectLayer);
  let objectMarkup = '', objectRequest = 0;
  function updateObjectLayer() {
    const discovery = get('[data-player]').checked;
    if (discovery) {
      objectLayer.innerHTML = window.aleaMapBattleObjects.discoveryMask(areas, map, 'academyObjectDiscovery')
        + `<g mask="url(#academyObjectDiscovery)">${objectMarkup}</g>`;
    } else {
      objectLayer.innerHTML = objectMarkup;
    }
  }
  async function reloadObjects() {
    const request = ++objectRequest;
    if (!(Number(map.pixels_per_meter) > 0)) return;
    try {
      const objects = await window.aleaMapBattleObjects.load(map);
      if (editor !== state || objectRequest !== request) return;
      objectMarkup = window.aleaMapBattleObjects.render(objects);
      updateObjectLayer();
    } catch (error) {
      if (editor !== state || objectRequest !== request) return;
      objectMarkup = '';
      updateObjectLayer();
      announce('Kunde inte visa kartobjekten: ' + error.message);
    }
  }

  const tokenLayer = node('g', { 'data-character-token-layer': '' });
  const rulerLayer = node('g', { 'data-ruler-layer': '', 'aria-hidden': 'true' });
  academyLayer.after(tokenLayer, rulerLayer);
  const measurementOutput = get('[data-measurement]');
  let rulerEnabled = false, measurement;
  const tokenPreview = get('[data-token-preview]');
  const ruler = get('[data-ruler-tool]');
  const tokenStyles = get('[data-token-style]');
  const characterName = character => character.name || character.identity?.namn || character._dbId;
  const astrid = roster.find(character => /^astrid(?:\s|$)/i.test(characterName(character)));
  const evalin = roster.find(character => /^evalin(?:\s|$)/i.test(characterName(character)));
  const tokenStyle = id => state.config.characterTokenStyles?.[id] === 'battlepose' ? 'battlepose' : 'portrait';
  const tokenDemo = get('[data-token-demo]');

  const maskOverlay = document.createElement('canvas'); maskOverlay.dataset.maskOverlay = ''; maskOverlay.hidden = true; board.append(maskOverlay);
  const viewport = board.parentElement;
  const zoom = get('[data-zoom]');
  const maskMode = get('[data-mask-mode]');
  let mask, history, rgba, stroke, pan;
  let islands = [];
  const maskPoints = [];
  const floodPanel = get('[data-flood-panel]');
  const floodInputs = [...floodPanel.querySelectorAll('[data-flood]')];
  const cancelFlood = get('[data-flood-cancel]');
  const floodStatus = get('[data-flood-status]');
  const viewEvents = new AbortController();
  let spaceDown = false;
  let suppressPanClick = false;
  let worker, floodPoint, floodTimer, floodRequest = 0;

  function resetFlood() {
    clearTimeout(floodTimer);
    floodRequest++;
    floodPoint = null;
    cancelFlood.disabled = true;
    floodStatus.textContent = 'Klicka i området du vill fylla.';
    updateMaskOverlay();
  }

  state.disposeFlood = () => {
    clearTimeout(floodTimer);
    worker?.terminate();
    viewEvents.abort();
    resize.disconnect();
  };

  function queueFlood() {
    clearTimeout(floodTimer);
    get('[data-flood="wallSensitivity"]').disabled = !get('[data-flood="detectWalls"]').checked;
    if (!floodPoint) return;
    const request = ++floodRequest;
    cancelFlood.disabled = false;
    updateMaskOverlay();
    if (floodInputs.some(input => !input.validity.valid)) {
      resetFlood();
      floodStatus.textContent = 'Kontrollera värdena för fyllningen.';
      return;
    }
    floodStatus.textContent = 'Fyller område…';
    floodTimer = setTimeout(() => {
      try {
        let image;
        if (!worker) {
          image = sampleMap();
          worker = new Worker(new URL('./kartakademin-flood-worker.js', import.meta.url), { type: 'module' });
          worker.onmessage = ({ data }) => {
            if (data.request !== floodRequest || !floodPoint) return;
            resetFlood();
            if (!data.cells) {
              floodStatus.textContent = data.error || 'Området kunde inte fyllas.';
              return;
            }
            const before = mask.cells.slice();
            mask.cells.set(data.cells);
            commitMask(before);
            floodStatus.textContent = 'Området fyllt. Klicka för att fylla nästa område.';
          };
          worker.onerror = () => {
            worker.terminate();
            worker = null;
            resetFlood();
            floodStatus.textContent = 'Området kunde inte fyllas.';
          };
        }
        const options = Object.fromEntries(floodInputs.map(input => [
          input.dataset.flood, input.type === 'checkbox' ? input.checked : input.disabled ? 50 : input.valueAsNumber,
        ]));
        worker.postMessage({ request, mask, point: floodPoint, options, image });
      } catch (error) {
        resetFlood();
        floodStatus.textContent = error.message;
      }
    }, 100);
  }

  floodPanel.oninput = queueFlood;
  cancelFlood.onclick = resetFlood;
  function updateMaskOverlay() {
    const visible = (state.layers.sight || state.layers.solid) && !!mask && !get('[data-light-only]').checked;
    maskOverlay.hidden = !visible;
    get('.kartakademin-mask-history').hidden = state.mode !== 'sight' || state.tool !== 'mask';
    get('[data-mask-undo]').disabled = !!floodPoint || (!history?.canUndo() && !maskPoints.length);
    get('[data-mask-redo]').disabled = !!floodPoint || !history?.canRedo() || !!maskPoints.length;
    get('[data-mask-finish]').disabled = maskPoints.length < 3;
    if (!visible || !mask) return;
    const context = maskOverlay.getContext('2d');
    const pixels = context.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.cells.length; i++) {
      const solid = !mask.cells[i];
      if (!state.layers[solid ? 'solid' : 'sight']) continue;
      const offset = i * 4;
      pixels.data[offset] = solid ? 255 : 45;
      pixels.data[offset + 1] = solid ? 55 : 255;
      pixels.data[offset + 2] = solid ? 55 : 190;
      pixels.data[offset + 3] = 90;
    }
    context.putImageData(pixels, 0, 0);
  }

  function clearIslands() {
    islands = [];
    get('[data-island-status]').textContent = '';
  }
  function commitMask(before) {
    clearIslands();
    history.record(before);
    state.config.freeSight = serializeMask(mask);
    markDirty();
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
    const image = document.getElementById('mapAreaImage');
    if (!image.complete || !image.naturalWidth) throw Error('Kartbilden laddas fortfarande.');
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, mask.width, mask.height);
    rgba = context.getImageData(0, 0, mask.width, mask.height).data;
    return rgba;
  }

  function refreshToolPicker(preferred = state.tool) {
    const options = toolsForMode(state.mode);
    const picker = get('[data-tool-picker]');
    const choices = options.filter(item => item.value !== 'pan');
    picker.replaceChildren(...(choices.length > 1 ? choices : []).map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.textContent = item.label;
      button.dataset.toolChoice = item.value;
      button.setAttribute('aria-pressed', String(item.value === preferred));
      button.onclick = () => {
        tool.value = item.value;
        tool.dispatchEvent(new Event('change', { bubbles: true }));
      };
      return button;
    }));
    tool.replaceChildren(...options.map(({ value, label }) => option(value, label)));
    state.tool = options.some(item => item.value === preferred) ? preferred : options[0]?.value ?? 'pan';
    tool.value = state.tool;
  }

  function refreshList() {
    const modeKey = state.mode;
    toolHeader.querySelector('h3').textContent = modeKey === 'rooms' ? 'Rumsverktyg' :
      modeButtons.find(button => button.dataset.modeButton === modeKey)?.textContent;
    const help = toolHeader.querySelector('button');
    if (help) help.hidden = modeKey !== 'rooms';
    const maskModeKey = maskMode.value;
    const drawingMask = modeKey === 'sight' && state.tool === 'mask';
    const polygonMaskMode = drawingMask && ['add', 'subtract'].includes(maskModeKey);
    const brushMaskMode = drawingMask && ['paint', 'erase'].includes(maskModeKey);
    get('[data-tool-picker]').hidden = !get('[data-tool-picker]').childElementCount;
    get('[data-tool-controls]').hidden = !['sight', 'lights'].includes(modeKey) || state.tool === 'pan' || drawingMask;
    get('[data-mode-note]')?.remove();
    if (modeKey === 'objects') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.modeNote = '';
      button.textContent = 'Öppna objektbiblioteket';
      button.onclick = () => window.openArcaneObjectLibrary(map.id);
      body.append(button);
    } else if (modeKey === 'effects') {
      const note = document.createElement('p');
      note.dataset.modeNote = '';
      note.className = 'muted';
      note.textContent = 'Förberett läge. PR #916 innehåller ingen kartbunden effektmodell.';
      body.append(note);
    }
    let elements;
    if (tool.value === 'light') elements = state.config.lights.map(light => option(light.id, light.name));
    else if (tool.value === 'geometry') elements = state.config.geometry.map((shape, i) => option(shape.id, 'Form ' + (i + 1)));
    else elements = roster.map(c => option(c._dbId, c.name || c.identity?.namn || c._dbId));
    menu.replaceChildren(option('', tool.value === 'position' ? 'Välj rollperson' : 'Ny'), ...elements);
    menu.value = state.selected;
    const editingPosition = tool.value === 'position';
    get('[data-token-style-control]').hidden = !editingPosition;
    tokenStyles.disabled = !state.loaded || !state.selected;
    tokenStyles.value = tokenStyle(state.selected);
    tokenDemo.hidden = !editingPosition || !astrid || !evalin;
    tokenDemo.disabled = !state.loaded;
    const lightList = get('[data-light-list]');
    lightList.hidden = state.mode !== 'lights' || tool.value !== 'light';
    lightList.replaceChildren(...(state.config.lights.length ? state.config.lights.map(light => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'kartakademin-light-row' + (light.id === state.selected ? ' selected' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(light.id === state.selected));
      row.dataset.lightId = light.id;
      const title = document.createElement('strong');
      title.textContent = light.name || 'Namnlös ljuskälla';
      const detail = document.createElement('span');
      detail.textContent = `${types[light.type]?.name || light.type || 'Okänd typ'} · ${light.on ? 'Tänd' : 'Släckt'}`;
      row.append(title, detail);
      row.addEventListener('click', () => select(light.id));
      return row;
    }) : [Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Inga ljuskällor ännu.' })]));
    menu.closest('label').hidden = drawingMask || tool.value === 'light' || state.tool === 'pan' || ['rooms', 'effects', 'objects'].includes(state.mode);
    get('[data-mask-tools]').hidden = !drawingMask;
    get('[data-flood-panel]').hidden = !drawingMask || maskModeKey !== 'flood';
    for (const button of root.querySelectorAll('[data-mask-tool]')) {
      button.setAttribute('aria-pressed', String(button.dataset.maskTool === maskModeKey));
    }
    for (const option of maskMode.options) option.hidden = !['add', 'subtract'].includes(option.value);
    get('[data-brush-size]').hidden = !brushMaskMode;
    get('[data-mask-finish]').hidden = !polygonMaskMode;
    get('[data-mask-finish]').textContent = maskModeKey === 'subtract' ? 'Slutför borttagningspolygon' : 'Slutför polygon';
    get('[data-mask-undo]').textContent = polygonMaskMode && maskPoints.length ? 'Ångra polygonpunkt' : 'Ångra maskändring';
    const light = state.config.lights.find(item => item.id === state.selected);
    lightForm.hidden = !light || state.mode !== 'lights' || tool.value !== 'light';
    geoForm.hidden = state.mode !== 'sight' || tool.value !== 'geometry';
    const lightToolActive = state.mode === 'lights' && state.tool === 'light';
    get('[data-duplicate]').hidden = !lightToolActive;
    get('[data-duplicate]').disabled = !light;
    get('[data-new]').hidden = !lightToolActive;
    get('[data-new]').disabled = !lightToolActive;
    const remove = get('[data-remove]');
    const selectedGeometry = state.config.geometry.some(item => item.id === state.selected);
    const selectedPosition = state.positions.some(item => item.character_id === state.selected);
    const canRemoveLight = state.mode === 'lights' && tool.value === 'light' && Boolean(light);
    const canRemoveGeometry = state.mode === 'sight' && tool.value === 'geometry' && selectedGeometry;
    const canRemovePosition = state.mode === 'lights' && tool.value === 'position' && selectedPosition;
    remove.hidden = !(canRemoveLight || canRemoveGeometry || canRemovePosition);
    remove.disabled = remove.hidden;
    remove.textContent = canRemoveLight ? 'Ta bort vald ljuskälla' : canRemoveGeometry ? 'Ta bort vald hindergeometri' : 'Ta bort kartposition';
    remove.classList.toggle('kartakademin-destructive', !remove.hidden);
    for (const input of lightForm.querySelectorAll('[name]')) {
      input.disabled = !light;
      if (input.type === 'checkbox') input.checked = Boolean(light?.[input.name]);
      else input.value = light?.[input.name] ?? '';
    }
    const directional = ['solljus', 'manljus'].includes(light?.type);
    get('[data-directional]').hidden = !directional;
    get('[data-beam-width]').hidden = !directional || !['parallel', 'overhead'].includes(light?.beam);
    get('[data-beam-size]').hidden = !directional || !light?.beam;
    get('input[name=beamWidth]').value = light?.beamWidth ?? light?.range ?? 6;
    get('input[name=edgeSoftness]').value = light?.edgeSoftness ?? (light?.type === 'manljus' ? 45 : 25);
    get('select[name=beam]').value = light?.beam ?? '';
    const shape = state.config.geometry.find(item => item.id === state.selected);
    for (const field of geoForm.querySelectorAll('input')) field.checked = shape?.[field.name] ?? true;
  }

  state.updateAreas = next => {
    areas = next;
    if (get('[data-player]').checked) { updateObjectLayer(); draw(); }
  };
  function drawCharacterTokens() {
    tokenLayer.replaceChildren();
    const previewArt = tool.value === 'position' && tokenStyle(state.selected) === 'battlepose'
      ? window.aleaCombatPaperDollMap?.renderMapToken(state.selected, 100) : '';
    tokenPreview.hidden = !previewArt;
    tokenPreview.querySelector('svg').innerHTML = previewArt || '';
    if (!state.layers.characters || get('[data-light-only]').checked) return;
    const screenScale = svg.getScreenCTM()?.a;
    if (!(screenScale > 0)) return;
    const interactive = tool.value === 'position';
    for (const { character_id: id, position: [x, y] } of state.positions) {
      const character = roster.find(item => item._dbId === id);
      if (!character) continue;
      const name = characterName(character);
      const selected = interactive && state.selected === id;
      const marker = node('g', { transform: `translate(${x} ${y})`, 'data-character-token': id });
      const width = window.aleaCombatPaperDollMap?.mapBaseWidth?.(state.config.pixelsPerMeter);
      const art = tokenStyle(id) === 'battlepose' ? window.aleaCombatPaperDollMap?.renderMapToken(id, width) : '';
      if (art) {
        marker.innerHTML = art;
        marker.append(node('ellipse', { rx: width / 2, ry: width / 4, fill: 'transparent',
          stroke: selected ? '#ffe5a1' : 'none', 'vector-effect': 'non-scaling-stroke' }));
      } else {
        const r = 15 / screenScale;
        const portrait = typeof getPortraitSrc === 'function' ? getPortraitSrc(character) : character.portrait;
        const clipId = `kart-portrait-${id}`;
        const clip = node('clipPath', { id: clipId });
        clip.append(node('circle', { r }));
        marker.append(clip, node('circle', { r, fill: '#27483d' }));
        if (portrait) marker.append(node('image', { href: portrait, x: -r, y: -r, width: 2*r, height: 2*r,
          preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})` }));
        else {
          const initial = node('text', { 'font-size': r, fill: '#fff2d4', 'text-anchor': 'middle', dy: '.35em' });
          initial.textContent = name.charAt(0);
          marker.append(initial);
        }
        marker.append(node('circle', { r, fill: 'none', stroke: selected ? '#ffe5a1' : '#bb9153',
          'stroke-width': selected ? 3 : 2, 'vector-effect': 'non-scaling-stroke' }));
      }
      const title = node('title', {});
      title.textContent = tokenStyle(id) === 'battlepose' && !art ? name + ' · Battlepose eller High Angle-bas saknas' : name;
      marker.append(title);
      if (interactive) {
        marker.setAttribute('tabindex', '0');
        marker.setAttribute('role', 'button');
        marker.setAttribute('aria-label', name);
        marker.addEventListener('keydown', event => {
          if (!['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          select(id);
        });
      }
      tokenLayer.append(marker);
    }
    tokenLayer.classList.toggle('kartakademin-tokens-interactive', interactive);
  }

  function draw(moving = null) {
    const lightOnly = get('[data-light-only]').checked;
    const discovery = get('[data-player]').checked;
    objectLayer.style.display = state.layers.objects && !lightOnly ? '' : 'none';
    board.classList.toggle('kartakademin-light-only', lightOnly);
    state.view?.renderer?.update(state.config, areas, state.positions, lightOnly || !discovery, moving);
    get('[data-map-scale]').textContent = `${state.config.pixelsPerMeter.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} px/m`;
    updateMaskOverlay();
    const roomGroup = svg.querySelector('#mapAreaRoomLayer');
    if (roomGroup) roomGroup.style.display = state.layers.rooms ? '' : 'none';
    academyLayer.replaceChildren();
    drawCharacterTokens();
    drawMeasurement();
    if (lightOnly) return;
    if ((state.layers.sight || state.layers.solid) && tool.value === 'mask' && maskPoints.length) {
      academyLayer.append(node('polyline', { points: maskPoints.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#53ffc4', 'stroke-width': 2 }));
      for (const [x,y] of maskPoints) academyLayer.append(node('circle', { cx:x, cy:y, r:map.width / 220, fill:'#53ffc4' }));
    }
    if (state.layers.solid && state.mode === 'sight') {
      for (const [x, y] of islands) academyLayer.append(node('circle', {
        cx: x, cy: y, r: map.width / 165, fill: 'none', stroke: '#ffde69', 'stroke-width': 2,
      }));
    }
    if (state.layers.solid) for (const shape of state.config.geometry) {
      academyLayer.append(node(shape.closed ? 'polygon' : 'polyline', {
        points: shape.points.map(p => p.join(',')).join(' '),
        fill: shape.closed ? '#dc86452a' : 'none', stroke: shape.id === state.selected ? '#fff2ac' : '#ed9557',
        'stroke-width': 2,
      }));
    }
    if (state.layers.solid) for (const point of state.points) academyLayer.append(node('circle', { cx: point[0], cy: point[1], r: map.width / 200, fill: '#ffe897' }));
    if (state.layers.solid && state.points.length) academyLayer.append(node('polyline', { points: state.points.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#ffe897', 'stroke-width': 2 }));
    const characterMarkers = state.positions.map(position => {
      const attached = state.config.lights.filter(light => light.characterId === position.character_id);
      const selectedAttached = attached.find(light => light.id === state.selected);
      return { id: position.character_id, lightIds: attached.map(light => light.id), position: position.position,
        color: selectedAttached?.color || attached[0]?.color || '#66d8ff', character: true };
    });
    const markers = state.layers.lights ? [...state.config.lights.filter(light => !light.characterId).map(light => ({
      id: light.id, lightIds: [light.id], position: light.position, color: light.color,
    })), ...(tool.value === 'position' ? [] : characterMarkers)] : [];
    for (const marker of markers) {
      const markerNode = node('circle', { cx: marker.position[0], cy: marker.position[1], r: map.width / 130,
        fill: marker.color, stroke: marker.lightIds.includes(state.selected) ? '#fff' : '#36312b', 'stroke-width': 2,
        tabindex: 0, role: 'button', 'aria-label': marker.character ? `Rollperson med ${marker.lightIds.length} ljus` : 'Välj ljuskälla' });
      if (state.mode !== 'lights' || tool.value !== 'light') {
        markerNode.removeAttribute('tabindex');
        markerNode.removeAttribute('role');
      } else {
        markerNode.style.pointerEvents = 'all';
      }
      markerNode.dataset.lightIds = marker.lightIds.join(',');
      markerNode.dataset.characterMarker = String(Boolean(marker.character));
      markerNode.addEventListener('keydown', event => {
        if (state.mode !== 'lights' || tool.value !== 'light') return;
        if (!['Enter', ' '].includes(event.key)) return;
        const id = marker.lightIds.find(lightId => state.config.lights.some(light => light.id === lightId));
        if (!id) return;
        event.preventDefault();
        select(id);
      });
      academyLayer.append(markerNode);
    }
    const observer = state.positions.find(p => p.character_id === state.selected);
    const freeSight = prepareFreeSight(map.width, map.height, state.config.freeSight);
    if (tool.value === 'position' && observer && freeSight && isFree(freeSight, observer.position) && !isBlocked(state.config.geometry, observer.position, 'sight')) {
      const sight = visibilityPolygon(observer.position, Math.hypot(map.width, map.height), blockers(state.config.geometry, 'sight'), 0, 360, freeSight);
      academyLayer.prepend(node('polygon', { points: sight.map(p => p.join(',')).join(' '), fill: '#66d8ff22', stroke: '#66d8ff', 'stroke-width': 1 }));
    }
  }

  function select(id) {
    state.selected = id;
    state.points = [];
    refreshList();
    draw();
  }

  function moveCharacter(id, point) {
    const origin = state.positions.find(position => position.character_id === id)?.position;
    if (!canMove(state.config.geometry, origin, point)) return false;
    if (origin?.[0] === point[0] && origin?.[1] === point[1]) return true;
    state.positions = [...state.positions.filter(position => position.character_id !== id), { character_id: id, position: point }];
    state.changedPositions.add(id);
    markDirty();
    return true;
  }

  function moveLight(light, point) {
    if (light.characterId) return moveCharacter(light.characterId, point);
    light.position = point;
    markDirty();
    return true;
  }

  function setTokenStyle(id, style) {
    state.config.characterTokenStyles = { ...state.config.characterTokenStyles, [id]: style };
    markDirty();
    loadTokenArt();
  }

  function loadTokenArt() {
    if (!Object.values(state.config.characterTokenStyles ?? {}).includes('battlepose')) return;
    const paperDoll = window.aleaCombatPaperDollMap;
    if (!paperDoll) return;
    void paperDoll.loadMapTokens().then(() => Promise.all(
      Object.entries(state.config.characterTokenStyles ?? {})
        .filter(([, style]) => style === 'battlepose')
        .map(([id]) => paperDoll.prepareMapToken(id))
    )).then(() => {
      if (editor === state) drawCharacterTokens();
    });
  }

  tokenStyles.onchange = event => {
    event.stopPropagation();
    if (!state.loaded || !state.selected) return;
    setTokenStyle(state.selected, tokenStyles.value);
    drawCharacterTokens();
  };
  tokenDemo.onclick = () => {
    if (!state.loaded || !astrid || !evalin) return;
    const hasPosition = character => state.positions.some(position => position.character_id === character._dbId);
    const hasFreeSight = mask.cells.some(Boolean);
    const eligible = point => !isBlocked(state.config.geometry, point, 'movement')
      && (!hasFreeSight || isFree(mask, point));
    const grid = Array.from({ length: 24*24 }, (_, i) => [(i%24+.5)*map.width/24, (Math.floor(i/24)+.5)*map.height/24]);
    const available = grid.filter(eligible);
    const inRoom = point => areas.some(area => {
      const shape = area.shape_data;
      return shape && (area.shape_type === 'rect'
        ? point[0] > shape.x && point[0] < shape.x+shape.width && point[1] > shape.y && point[1] < shape.y+shape.height
        : Array.isArray(shape.points) && contains(shape.points, point));
    });
    const astridPoint = available.find(inRoom);
    const evalinPoint = available.filter(([x,y]) => x > map.width*.5 && y > map.height*.5)
      .sort((a,b) => Math.hypot(a[0]-map.width*.85,a[1]-map.height*.85) - Math.hypot(b[0]-map.width*.85,b[1]-map.height*.85))[0];
    if ((!hasPosition(astrid) && !astridPoint) || (!hasPosition(evalin) && !evalinPoint)) {
      return announce('Ingen lämplig plats hittades i ett rum och nedre högra delen. Placera rollpersonerna manuellt.');
    }
    if (!hasPosition(astrid)) moveCharacter(astrid._dbId, astridPoint);
    if (!hasPosition(evalin)) moveCharacter(evalin._dbId, evalinPoint);
    setTokenStyle(astrid._dbId, 'portrait');
    setTokenStyle(evalin._dbId, 'battlepose');
    select(evalin._dbId);
  };

  const initialize = async () => {
    if (state.initializing) return;
    state.initializing = true;
    try {
      if (!state.loaded) {
        const data = await load(map);
        if (editor !== state) return;
        state.config = { ...defaults(), ...data.config };
        if (Number(map.pixels_per_meter) > 0) state.config.pixelsPerMeter = Number(map.pixels_per_meter);
        state.mapScaleAtOpen = map.pixels_per_meter;
        state.revision = data.revision ?? 0;
        state.positions = data.positions;
        mask = createMask(map.width, map.height, state.config.freeSight);
        history = maskHistory(mask.cells);
        maskOverlay.width = mask.width;
        maskOverlay.height = mask.height;
        state.config.freeSight ??= serializeMask(mask);
        state.loaded = true;
        loadTokenArt();
      }
      for (const input of settings.querySelectorAll('[data-config]')) {
        const value = state.config[input.dataset.config];
        if (input.type === 'radio') input.checked = input.value === value;
        else if (input.dataset.config === 'pixelsPerMeter') input.value = Number((map.width / value).toPrecision(10));
        else input.value = input.dataset.config === 'darkness' ? value * 100 : value ?? 0;
      }
      refreshList();
      window.renderMapAreaEditor?.();
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

  window.addEventListener('alea:map-object-scale', async ({ detail }) => {
    if (editor !== state || detail.mapId !== map.id) return;
    map.pixels_per_meter = detail.pixelsPerMeter;
    if (!state.loaded || state.saving) return;
    if (state.dirty) {
      state.scaleConflict = true;
      announce('Kartskalan ändrades i objektbiblioteket. Öppna kartan igen före sparning.');
      return;
    }
    // Reload the whole revision, including changes made by another GM.
    dispose(state.view);
    state.view = null;
    state.loaded = false;
    await initialize();
  }, { signal: viewEvents.signal });

  const onChange = event => {
    const input = event.target;
    if (input === menu) return select(menu.value);
    if (input === mode) {
      state.mode = mode.value;
      state.selected = '';
      for (const button of modeButtons) button.setAttribute('aria-selected', String(button.dataset.modeButton === state.mode));
      refreshToolPicker(state.mode === 'rooms' ? 'room' : state.mode === 'sight' ? 'mask' : state.mode === 'lights' ? 'light' : 'pan');
      state.points = [];
      maskPoints.length = 0;
      resetFlood();
      refreshList(); draw(); window.renderMapAreaEditor?.(); return;
    }
    if (input.dataset.layer) return state.setLayer(input.dataset.layer, input.checked);
    if (input === maskMode || input === zoom || input.dataset.flood) return;
    if (input === tool) {
      refreshToolPicker(tool.value);
      if (tool.value !== 'mask') resetFlood();
      maskPoints.length = 0;
      refreshList(); draw(); window.renderMapAreaEditor?.();
      return select('');
    }
    const key = input.dataset.config;
    if (key) {
      if (!input.reportValidity()) return;
      if (key === 'pixelsPerMeter') state.config[key] = map.width / input.valueAsNumber;
      else state.config[key] = key === 'environment' ? input.value : input.valueAsNumber / (key === 'darkness' ? 100 : 1);
      markDirty();
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
        if (['solljus', 'manljus'].includes(light.type)) {
          light.beam = 'cone';
          light.intensity = light.type === 'manljus' ? .65 : 1;
          light.edgeSoftness = light.type === 'manljus' ? 45 : 25;
        } else light.beam = '';

      }
      markDirty();
      if (input.name === 'name' || input.name === 'type' || input.name === 'on' || input.name === 'beam') refreshList();
    } else if (geoForm.contains(input)) {
      const shape = state.config.geometry.find(item => item.id === state.selected);
      if (shape && input.name !== 'closed') { shape[input.name] = input.checked; markDirty(); }
    }
    draw();
  };
  root.onchange = leftPanel.onchange = onChange;
  get('[data-light-only]').onchange = () => {
    const active = get('[data-light-only]').checked;
    toolPanel.inert = active;
    draw();
  };
  get('[data-reset-north]').onclick = () => {
    const north = get('[data-config="north"]');
    north.value = '0';
    north.dispatchEvent(new Event('change', { bubbles: true }));
  };
  for (const button of root.querySelectorAll('[data-mask-tool]')) {
    button.onclick = () => {
      maskMode.value = button.dataset.maskTool;
      maskMode.dispatchEvent(new Event('change'));
    };
  }
  get('[data-new]').onclick = () => {
    select('');
  };
  get('[data-undo]').onclick = () => { state.points.pop(); draw(); };
  get('[data-finish]').onclick = () => {
    const flags = Object.fromEntries([...geoForm.querySelectorAll('input')].map(input => [input.name, input.checked]));
    if (state.points.length < (flags.closed ? 3 : 2)) return announce('Rita fler punkter.');
    const id = state.selected || crypto.randomUUID();
    const shape = { id, points: state.points, ...flags };
    state.config.geometry = [...state.config.geometry.filter(item => item.id !== id), shape];
    markDirty();
    select(id);
  };
  get('[data-remove]').onclick = async () => {
    const light = state.mode === 'lights' && tool.value === 'light' && state.config.lights.some(item => item.id === state.selected);
    const geometry = state.mode === 'sight' && tool.value === 'geometry' && state.config.geometry.some(item => item.id === state.selected);
    const position = state.mode === 'lights' && tool.value === 'position' && state.positions.some(item => item.character_id === state.selected);
    const confirmation = removalConfirmation(state.mode, tool.value);
    if ((!light && !geometry && !position) || !confirmation) return;
    if (!await window.askConfirm(confirmation.title, confirmation.message, confirmation.actionLabel, true)) return;
    if (light) state.config.lights = state.config.lights.filter(item => item.id !== state.selected);
    else if (geometry) state.config.geometry = state.config.geometry.filter(item => item.id !== state.selected);
    else {
      state.positions = state.positions.filter(item => item.character_id !== state.selected);
      state.changedPositions.add(state.selected);
    }
    markDirty();
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
    markDirty();
    select(id);
  }
  get('[data-duplicate]').onclick = () => {
    const light = state.config.lights.find(item => item.id === state.selected);
    if (light) addLight(light.position.slice(), light);
  };
  modeButtons.forEach(button => button.addEventListener('click', () => {
    mode.value = button.dataset.modeButton;
    mode.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  state.setLayer = (layer, visible) => {
    const input = get(`[data-layer="${layer}"]`);
    if (!input) return;
    state.layers[layer] = input.checked = visible;
    draw();
    window.renderMapAreaEditor?.();
  };
  let offsetX = 0, offsetY = 0;
  const fitScale = () => Math.min(viewport.clientWidth / map.width, viewport.clientHeight / map.height);
  function positionBoard() {
    get('[data-zoom-percent]').value = Math.round(zoom.valueAsNumber * 100) + ' %';
    const scale = fitScale() * zoom.valueAsNumber;
    const width = map.width * scale;
    const height = map.height * scale;
    offsetX = Math.max(-width / 2, Math.min(width / 2, offsetX));
    offsetY = Math.max(-height / 2, Math.min(height / 2, offsetY));
    board.style.width = `${width}px`;
    board.style.left = `${(viewport.clientWidth - width) / 2 + offsetX}px`;
    board.style.top = `${(viewport.clientHeight - height) / 2 + offsetY}px`;
    if (!pan) drawCharacterTokens();
  }
  function setZoom(value, x, y, previous = zoom.valueAsNumber) {
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    zoom.value = String(Math.max(Number(zoom.min), Math.min(Number(zoom.max), value)));
    const ratio = zoom.valueAsNumber / previous;
    offsetX = (offsetX + centerX - (x ?? centerX)) * ratio - centerX + (x ?? centerX);
    offsetY = (offsetY + centerY - (y ?? centerY)) * ratio - centerY + (y ?? centerY);
    positionBoard();
    window.renderMapAreaEditor?.();
  }
  let sliderZoom = 1;
  function resetView() {
    zoom.value = String(sliderZoom = 1);
    offsetX = offsetY = 0;
    positionBoard();
    window.renderMapAreaEditor?.();
  }
  zoom.oninput = () => { setZoom(zoom.valueAsNumber, undefined, undefined, sliderZoom); sliderZoom = zoom.valueAsNumber; };
  const zoomBy = (factor, x, y) => { setZoom(zoom.valueAsNumber * factor, x, y); sliderZoom = zoom.valueAsNumber; };
  get('[data-zoom-in]').onclick = () => zoomBy(1.25);
  get('[data-zoom-out]').onclick = () => zoomBy(1 / 1.25);
  get('[data-fit-view]').onclick = get('[data-reset-view]').onclick = resetView;
  const updateWorkspaceHeight = () => {
    const pageTop = workspace.getBoundingClientRect().top + window.scrollY;
    workspace.style.setProperty('--kartakademin-space', `${Math.max(160, window.innerHeight - pageTop - 12)}px`);
  };
  const header = document.querySelector('.alea-app-header');
  const resize = new ResizeObserver(entries => {
    if (entries.some(entry => entry.target !== viewport)) updateWorkspaceHeight();
    positionBoard();
  });
  resize.observe(viewport);
  resize.observe(get('.kartakademin-header'));
  if (header) resize.observe(header);
  updateWorkspaceHeight();
  positionBoard();
  const viewOptions = { signal: viewEvents.signal };
  get('[data-player]').addEventListener('change', updateObjectLayer, viewOptions);
  for (const eventName of ['alea:map-objects-changed', 'alea:map-object-scale']) {
    window.addEventListener(eventName, event => {
      if (event.detail?.mapId === map.id) void reloadObjects();
    }, viewOptions);
  }
  void reloadObjects();
  window.addEventListener('resize', updateWorkspaceHeight, viewOptions);
  const hand = get('[data-pan-tool]');
  let handEnabled = false;
  function updatePanCursor() {
    viewport.classList.toggle('kartakademin-can-pan', handEnabled || spaceDown);
    viewport.classList.toggle('kartakademin-panning', Boolean(pan));
  }
  function drawMeasurement() {
    rulerLayer.replaceChildren();
    measurementOutput.hidden = !measurement;
    if (!measurement) return;
    const { start, end } = measurement;
    rulerLayer.append(node('line', { x1:start[0], y1:start[1], x2:end[0], y2:end[1],
      stroke:'#ffe09c', 'stroke-width':3, 'vector-effect':'non-scaling-stroke' }));
    measurementOutput.textContent = new Intl.NumberFormat('sv-SE',{ maximumFractionDigits:2 }).format(
      mapDistanceMeters(start,end,state.config.pixelsPerMeter)) + ' m';
  }
  function setRuler(enabled) {
    rulerEnabled = enabled;
    ruler.setAttribute('aria-pressed', String(enabled));
    viewport.classList.toggle('kartakademin-ruler-active', enabled);
    if (!enabled) measurement = null;
    drawMeasurement();
  }
  hand.onclick = () => {
    handEnabled = !handEnabled;
    if (handEnabled) setRuler(false);
    hand.setAttribute('aria-pressed', String(handEnabled));
    updatePanCursor();
  };
  ruler.onclick = () => {
    handEnabled = false;
    hand.setAttribute('aria-pressed','false');
    setRuler(!rulerEnabled);
    updatePanCursor();
  };
  viewport.addEventListener('wheel', event => {
    if (!event.target.closest('#mapAreaCanvas')) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
    zoomBy(Math.exp(-delta * .002), event.clientX, event.clientY);
  }, { ...viewOptions, passive: false });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && rulerEnabled) {
      setRuler(false);
      event.preventDefault();
      return;
    }
    if (event.code !== 'Space' || event.target.closest?.('input, select, textarea, [contenteditable]')) return;
    if (!viewport.matches(':hover') && event.target.closest?.('button, summary, [role="button"]')) return;
    spaceDown = true;
    updatePanCursor();
    event.preventDefault();
  }, viewOptions);
  function releaseSpace() {
    spaceDown = false;
    updatePanCursor();
  }
  window.addEventListener('keyup', event => { if (event.code === 'Space') releaseSpace(); }, viewOptions);
  window.addEventListener('blur', releaseSpace, viewOptions);
  viewport.addEventListener('pointerdown', event => {
    if (pan || !event.isPrimary) return;
    suppressPanClick = false;
    if (stroke || lightDrag || (event.button === 1 && (event.buttons & 1))) return;
    const wantsPan = event.button === 1 ||
      (event.button === 0 && (spaceDown || handEnabled || (!rulerEnabled && tool.value === 'pan')));
    if (!wantsPan) {
      if (!rulerEnabled || event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      suppressPanClick = true;
      const start = brushPoint(event);
      if (!start) return;
      measurement = { start, end:start, pointerId:event.pointerId };
      viewport.setPointerCapture(event.pointerId);
      drawMeasurement();
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: offsetX, top: offsetY };
    suppressPanClick = true;
    viewport.setPointerCapture(event.pointerId);
    updatePanCursor();
  }, { ...viewOptions, capture: true });
  viewport.addEventListener('pointermove', event => {
    if (measurement?.pointerId === event.pointerId) {
      const end = brushPoint(event,true);
      if (end) { measurement.end = end; drawMeasurement(); }
      return;
    }
    if (pan?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    offsetX = pan.left + event.clientX - pan.x;
    offsetY = pan.top + event.clientY - pan.y;
    positionBoard();
  }, viewOptions);
  function finishPan(event) {
    if (measurement?.pointerId === event.pointerId) {
      if (event.type === 'pointercancel') measurement = null;
      else {
        if (event.type === 'pointerup') measurement.end = brushPoint(event,true) ?? measurement.end;
        measurement.pointerId = null;
      }
      drawMeasurement();
      return;
    }
    if (pan?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    pan = null;
    updatePanCursor();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    viewport.addEventListener(type, finishPan, viewOptions);
  }
  for (const type of ['click', 'dblclick', 'auxclick', 'contextmenu']) {
    viewport.addEventListener(type, event => {
      if (!suppressPanClick && !rulerEnabled && !get('[data-light-only]').checked) return;
      event.preventDefault();
      event.stopPropagation();
    }, { ...viewOptions, capture: true });
  }
  viewport.addEventListener('pointerdown', event => {
    if (get('[data-light-only]').checked) event.stopPropagation();
  }, { ...viewOptions, capture: true });
  refreshToolPicker('room');
  for (const button of modeButtons) button.setAttribute('aria-selected', String(button.dataset.modeButton === state.mode));
  refreshList();
  initialize();
  maskMode.onchange = () => { resetFlood(); maskPoints.length = 0; refreshList(); draw(); };
  get('[data-find-islands]').onclick = () => {
    const limit = get('[data-island-size]');
    if (!mask || !limit.reportValidity()) return;
    islands = findSmallSolidIslands(mask, limit.valueAsNumber);
    get('[data-island-status]').textContent = `${islands.length} små Solid-områden markerade.`;
    draw();
  };
  get('[data-mask-undo]').onclick = () => {
    if (maskPoints.length) { maskPoints.pop(); refreshList(); draw(); }
    else if (history.undo()) { clearIslands(); state.config.freeSight = serializeMask(mask); markDirty(); draw(); }
  };
  get('[data-mask-redo]').onclick = () => {
    if (history.redo()) { clearIslands(); state.config.freeSight = serializeMask(mask); markDirty(); draw(); }
  };
  get('[data-mask-reset]').onclick = async () => {
    if (!state.loaded || !mask) return;
    const accepted = await resetFreeSight(mask, history, state.config,
      () => window.askConfirm('Nollställ fri sikt', FREE_SIGHT_RESET_CONFIRMATION, FREE_SIGHT_RESET_LABEL, true));
    if (!accepted) return;
    clearIslands();
    maskPoints.length = 0;
    resetFlood();
    markDirty();
    draw();
  };
  get('[data-mask-finish]').onclick = () => {
    if (maskPoints.length < 3) return;
    const before = mask.cells.slice();
    polygonMask(mask, maskPoints, Number(maskMode.value === 'add'));
    maskPoints.length = 0;
    commitMask(before);
  };
  let lightDrag = null;
  let skipLightClick = false;
  svg.onpointerdown = event => {
    if (!state.loaded || !event.isPrimary || event.button !== 0 || pan) return;
    if (tool.value === 'light' && !state.layers.lights) return;
    const token = event.target.closest?.('[data-character-token]');
    if (tool.value === 'position' && token) {
      const id = token.dataset.characterToken;
      const position = state.positions.find(item => item.character_id === id)?.position;
      const point = brushPoint(event, true);
      if (!point || !position) return;
      select(id);
      lightDrag = { characterId: id, pointerId: event.pointerId, moved: true,
        offset: [position[0] - point[0], position[1] - point[1]] };
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const marker = event.target.closest?.('[data-light-ids]');
    if (state.mode === 'lights' && tool.value === 'light' && marker) {
      const ids = marker.dataset.lightIds.split(',').filter(Boolean);
      if (!ids.length) return;
      const light = ids.includes(state.selected) ? state.config.lights.find(item => item.id === state.selected) :
        state.config.lights.find(item => item.id === ids[0]);
      if (!light) return;
      select(light.id);
      lightDrag = { id: light.id, pointerId: event.pointerId, moved: false, x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (state.mode !== 'sight' || tool.value !== 'mask' || !['paint', 'erase'].includes(maskMode.value)) return;
    const point = brushPoint(event);
    const size = get('[data-radius]');
    if (!point || !size.reportValidity()) return;
    stroke = { before: mask.cells.slice(), point, radius: size.valueAsNumber, value: Number(maskMode.value === 'paint') };
    svg.setPointerCapture(event.pointerId);
    paintMask(mask, point, point, stroke.radius, stroke.value);
    updateMaskOverlay();
  };
  svg.onpointermove = event => {
    if (!event.isPrimary) return;
    if (lightDrag?.pointerId === event.pointerId) {
      const point = brushPoint(event);
      if (!point) return;
      if (lightDrag.characterId) {
        const [dx, dy] = lightDrag.offset;
        const destination = [Math.max(0, Math.min(map.width-.001, point[0]+dx)),
          Math.max(0, Math.min(map.height-.001, point[1]+dy))];
        if (moveCharacter(lightDrag.characterId, destination)) draw(lightDrag);
        return;
      }
      const light = state.config.lights.find(item => item.id === lightDrag.id);
      if (!light || !moveLight(light, point)) return;
      lightDrag.moved ||= Math.hypot(event.clientX - lightDrag.x, event.clientY - lightDrag.y) > 3;
      draw(lightDrag);
      return;
    }
    if (!stroke) return;
    const point = brushPoint(event, true);
    if (!point) return;
    paintMask(mask, stroke.point, point, stroke.radius, stroke.value);
    stroke.point = point;
    updateMaskOverlay();
  };
  svg.onpointerup = svg.onlostpointercapture = event => {
    if (lightDrag?.pointerId === event?.pointerId) {
      if (lightDrag.moved) {
        if (!lightDrag.characterId) markDirty();
        skipLightClick = true;
        requestAnimationFrame(() => { skipLightClick = false; });
      }
      lightDrag = null;
      draw();
      return;
    }
    if (!stroke) return;
    const { before } = stroke;
    stroke = null;
    commitMask(before);
  };
  svg.addEventListener('click', event => {
    if (skipLightClick) { skipLightClick = false; return; }
    if (!state.loaded || ['rooms', 'effects', 'objects'].includes(state.mode) || tool.value === 'pan') return;
    if (tool.value === 'light' && !state.layers.lights) return;
    const point = brushPoint(event);
    if (!point) return;
    const clickedMarker = event.target.closest?.('[data-light-ids]');
    if (state.mode === 'lights' && tool.value === 'light' && clickedMarker) {
      const ids = clickedMarker.dataset.lightIds.split(',').filter(Boolean);
      const selected = ids.includes(state.selected) ? state.selected : ids.find(id => state.config.lights.some(light => light.id === id));
      if (selected) select(selected);
      return;
    }
    if (state.mode === 'sight' && tool.value === 'mask') {
      if (maskMode.value === 'flood') {
        floodPoint = point;
        queueFlood();
      } else if (['add', 'subtract'].includes(maskMode.value)) { maskPoints.push(point); draw(); }
      return;
    }
    if (state.mode === 'sight' && tool.value === 'geometry') state.points.push(point);
    else if (state.mode === 'lights' && tool.value === 'position') {
      if (!state.selected) return announce('Välj en rollperson först.');
      if (event.target.closest?.('[data-character-token]')) return;
      if (!moveCharacter(state.selected, point)) return announce('Platsen blockerar rörelse.');
    } else if (state.mode === 'lights') {
      const light = state.config.lights.find(item => item.id === state.selected);
      if (light) {
        if (!moveLight(light, point)) return announce('Platsen blockerar förflyttningen.');
      }
      else addLight(point);
    }
    draw();
  });
  get('[data-save]').onclick = async () => {
    if (state.scaleConflict) return announce('Öppna kartan igen för att läsa den nya skalan.');
    if (!state.loaded || state.saving || [...opener.querySelectorAll('input[type=number]:enabled')].filter(input => input.getClientRects().length).some(input => !input.reportValidity())) return;
    if (floodPoint) return announce('Vänta tills fyllningen har slutförts.');
    if (state.points.length || maskPoints.length || stroke || lightDrag) return announce('Slutför eller ångra den påbörjade formen före sparning.');
    state.saving = true;
    const save = get('[data-save]');
    setSaveStatus('Sparar…', 'saving');
    save.disabled = true;
    const changes = [...state.changedPositions].map(character_id => ({
      character_id,
      position: state.positions.find(p => p.character_id === character_id)?.position ?? null,
    }));
    workspace.inert = settings.inert = true;
    try {
      state.revision = await dbJson('rpc/save_campaign_map_academy', {
        method: 'POST',
        body: JSON.stringify({
          p_map_id: map.id, p_campaign_id: map.campaign_id, p_configuration: state.mapScaleAtOpen === undefined ? state.config
            : { ...state.config, expectedMapScale: state.mapScaleAtOpen },
          p_revision: state.revision, p_positions: changes,
        }),
      });
      const calibrated = Number(Number(state.config.pixelsPerMeter).toFixed(4));
      map.pixels_per_meter = calibrated;
      state.mapScaleAtOpen = calibrated;
      state.config.pixelsPerMeter = calibrated;
      const listedMap = typeof campaignMaps !== 'undefined' && campaignMaps.find(row => row.id === map.id);
      if (listedMap) listedMap.pixels_per_meter = calibrated;
      state.changedPositions.clear();
      state.dirty = false;
      setSaveStatus('Sparat', 'saved');
      announce('Kartakademin sparad.');
    } catch (error) {
      setSaveStatus('Fel vid sparning', 'error');
      announce('Sparningen avbröts: ' + error.message);
    } finally {
      state.saving = false;
      workspace.inert = settings.inert = false;
      save.disabled = false;
    }
  };
}

window.aleaKartakademin = { pointIsExplored, openEditor, closeEditor, syncCampaign, clearCampaign, getEditMode: () => editor?.mode ?? null, getTool: () => editor?.tool ?? null, isLayerVisible: name => editor?.layers?.[name] ?? true, setLayer: (name, visible) => editor?.setLayer?.(name, visible), updateEditorAreas: areas => editor?.updateAreas?.(areas), hasPendingChanges: () => Boolean(editor?.dirty || editor?.saving), isSaving: () => Boolean(editor?.saving) };
