import { DEFAULT_HERO_FACTOR, HERO_PROFILES, heroPlacement } from './hero-class.js';

// Mounted only on demand in the existing Dockverkstan. This is a calibration preview.
export function mountHeroWorkbench(container, { resolveAsset, heightFor }) {
  container.innerHTML = `
    <div class="arcane-hero-controls">
      <label>Grundfigur<select data-hero></select></label>
      <label>Visuell skala <output data-factor-output></output>
        <input type="range" min="1" max="1.25" step="0.01" data-factor></label>
      <label>Fotankare X (%) <input type="number" min="0" max="100" step="0.1" data-x></label>
      <label>Fotankare Y (%) <input type="number" min="0" max="100" step="0.1" data-y></label>
      <button type="button" class="btn" data-reset>Återställ figur</button>
    </div>
    <div class="arcane-hero-floor">
      <svg viewBox="-140 -245 280 310" aria-label="Figur med markerat fotankare" role="img">
        <ellipse cx="0" cy="0" rx="26" ry="5" fill="#211813" opacity=".45"/>
        <image data-art preserveAspectRatio="none"/>
        <path d="M-8 0H8M0 -8V8" stroke="#ffdf70" stroke-width="1.8"/>
        <path d="M-90 36v6h120v-6" fill="none" stroke="#dbceab"/>
        <text x="-30" y="57" text-anchor="middle" fill="#fff1cb" font-size="10">1,5 m</text>
      </svg>
    </div>
    <p class="apdw-help" data-caption aria-live="polite"></p>`;
  const get = key => container.querySelector('[data-' + key + ']');
  const hero = get('hero'), factor = get('factor'), x = get('x'), y = get('y'), image = get('art');
  for (const [id, profile] of Object.entries(HERO_PROFILES)) hero.add(new Option(profile.name, id));

  function draw() {
    const id = hero.value, profile = HERO_PROFILES[id];
    const scale = Number(factor.value);
    const position = heroPlacement(id, { heightCm: heightFor(profile.name), pixelsPerMeter: 80, heroFactor: scale });
    const ax = x.valueAsNumber / 100, ay = y.valueAsNumber / 100;
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || ax < 0 || ax > 1 || ay < 0 || ay > 1) return;
    image.setAttribute('x', -ax * position.width);
    image.setAttribute('y', -ay * position.height);
    image.setAttribute('width', position.width);
    image.setAttribute('height', position.height);
    image.setAttribute('href', resolveAsset(profile.assetKey) || profile.assetUrl);
    get('factor-output').value = scale.toFixed(2).replace('.', ',') + '×';
    const heightLabel = position.usesReferenceHeight ? 'referenslängd' : 'kroppslängd';
    get('caption').textContent = profile.pose + ' · ' + position.heightCm + ' cm ' + heightLabel;
  }
  function reset() {
    const { anchor } = HERO_PROFILES[hero.value];
    x.value = String(Math.round(anchor.x * 1000) / 10);
    y.value = String(Math.round(anchor.y * 1000) / 10);
    factor.value = String(DEFAULT_HERO_FACTOR);
    draw();
  }
  image.addEventListener('click', event => {
    const svg = image.ownerSVGElement, matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const box = image.getBBox();
    if (!box.width || !box.height) return;
    const percentage = n => String(Math.round(Math.max(0, Math.min(1, n)) * 1000) / 10);
    x.value = percentage((p.x - box.x) / box.width);
    y.value = percentage((p.y - box.y) / box.height);
    draw();
  });
  hero.addEventListener('change', reset);
  get('reset').addEventListener('click', reset);
  for (const control of [factor, x, y]) control.addEventListener('input', draw);
  reset();
}
