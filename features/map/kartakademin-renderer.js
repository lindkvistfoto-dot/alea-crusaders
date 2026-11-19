import { Application, BlurFilter, Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import { bakeFlameParts, flames, flameWeights } from './kartakademin-flame.js';
import { isFree, prepareFreeSight } from './kartakademin-mask.js';
import { blockers, directionalReach, isBlocked, parallelBeamQuads, resolveOrigin, roomVisibility, visibilityPolygon } from './kartakademin-geometry.js';

export async function mountLighting(host, map) {
  const app = new Application();
  let lightTexture, target, frame, imageTexture;
  let destroyed = false;
  const projections = new Map();
  function releaseProjection(entry) {
    for (const part of entry.parts) part.texture.destroy(true);
  }
  const beamTextures = new Map();
  function beamTexture(shape, softness) {
    const key = shape + ':' + softness;
    if (!beamTextures.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const pixels = ctx.createImageData(128, 128);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const nx = (x + .5) / 64 - 1, ny = (y + .5) / 64 - 1;
        const edge = shape === 'parallel' ? Math.max(Math.abs(ny), nx) : Math.hypot(nx, ny);
        const alpha = Math.max(0, Math.min(1, (1 - edge) / Math.max(.015, softness)));
        const offset = (y * 128 + x) * 4;
        pixels.data.fill(255, offset, offset + 3);
        pixels.data[offset + 3] = 255 * alpha;
      }
      ctx.putImageData(pixels, 0, 0);
      if (beamTextures.size >= 24) {
        const oldest = beamTextures.keys().next().value;
        // Evict after the currently assembled frame has discarded its sprites.
        retiredTextures.push(beamTextures.get(oldest));
        beamTextures.delete(oldest);
      }
      beamTextures.set(key, Texture.from(canvas));
    }
    return beamTextures.get(key);
  }
  const retiredTextures = [];
  const output = document.createElement('canvas');
  output.width = output.height = 128;
  const context = output.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  try {
    const scale = Math.min(1, 2048 / Math.max(map.width, map.height));
    const width = Math.max(1, Math.round(map.width * scale));
    const height = Math.max(1, Math.round(map.height * scale));
    await app.init({ width, height, preference: 'webgl', background: 0, autoStart: false, sharedTicker: false });
    const bitmap = await createImageBitmap(await (await fetch(map.image_url)).blob());
    imageTexture = Texture.from(bitmap);
    lightTexture = Texture.from(output);
    target = RenderTexture.create({ width, height });
    const world = new Container();
    world.scale.set(width / map.width, height / map.height);
    const background = new Sprite(imageTexture);
    background.width = map.width;
    background.height = map.height;
    world.addChild(background);
    const shade = new Sprite(target);
    shade.width = map.width;
    shade.height = map.height;
    shade.blendMode = 'multiply';
    world.addChild(shade);
    const discovery = new Graphics();
    world.addChild(discovery);
    world.mask = discovery;
    const blurLayer = new Container();
    blurLayer.scale.copyFrom(world.scale);
    const blurred = new Sprite(imageTexture);
    blurred.width = map.width;
    blurred.height = map.height;

    blurred.filters = [new BlurFilter({ strength: 7, quality: 2 })];
    const unexplored = new Graphics();
    blurred.tint = 0xdddddd;
    blurLayer.addChild(blurred, unexplored);
    blurLayer.mask = unexplored;
    const unknown = new Graphics();
    unknown.scale.copyFrom(world.scale);
    app.stage.addChild(world, blurLayer, unknown);
    const lightmap = new Container();
    lightmap.scale.copyFrom(world.scale);
    const ambient = new Graphics();
    lightmap.addChild(ambient);
    let lights = [];
    app.canvas.className = 'kartakademin-canvas';
    app.canvas.setAttribute('aria-hidden', 'true');

    function paint(time) {
      for (const { sprites, light, flame } of lights) {
        const magic = light.type === 'magiskt';
        const phase = time / (magic ? 1250 : light.type === 'eldstad' ? 93 : 140);
        const wave = (1 + Math.sin(phase)) / 2;
        const motion = light.motion || 0;
        const power = light.intensity * (1 - motion * wave);
        const weights = flame && flameWeights(phase, motion, flame);
        for (const { sprite, index, sample } of sprites) {
          sprite.alpha = Math.min(1, Math.max(0, power - index)) * (weights ? weights[sample] : 1);
        }

      }
      app.renderer.render({ container: lightmap, target, clear: true });
      app.render();
    }

    function update(config, areas, positions, previewAll = false, moving = null) {
      cancelAnimationFrame(frame);
      // PixiJS 8 validates the optional end index against the current child
      // count. Repeated updates can otherwise leave an invalid range behind.
      while (lightmap.children.length > 1) {
        const child = lightmap.removeChildAt(lightmap.children.length - 1);
        child.destroy({ children: true });
      }
      for (const texture of retiredTextures.splice(0)) texture.destroy(true);
      lights = [];
      discovery.clear();
      unexplored.clear();
      unknown.clear();
      if (previewAll) discovery.rect(0, 0, map.width, map.height).fill(0xffffff);
      else for (const area of areas) {
        const presentation = roomVisibility(area.status);
        const layer = presentation === 'sharp' ? discovery : presentation === 'blur' ? unexplored : unknown;
        const d = area.shape_data;
        const color = layer === unknown ? 0 : 0xffffff;
        if (area.shape_type === 'rect') layer.rect(d.x, d.y, d.width, d.height).fill(color);
        else if (d?.points?.length >= 3) layer.poly(d.points.flat()).fill(color);
      }
      const level = Math.round(255 * (1 - config.darkness));
      ambient.clear().rect(0, 0, map.width, map.height).fill(level * 0x010101);
      const freeSight = prepareFreeSight(map.width, map.height, config.freeSight);
      const edges = blockers(config.geometry, 'light');
      const wallKey = JSON.stringify(edges);
      const activeProjections = new Set();
      // The player RPC intentionally omits light IDs.
      for (const [slot, light] of config.lights.entries()) {
        const origin = resolveOrigin(light, positions);
        if (!light.on || !origin || !freeSight || !isFree(freeSight, origin) || isBlocked(config.geometry, origin, 'light')) continue;
        const directional = ['solljus', 'manljus'].includes(light.type);
        const beam = directional ? light.beam : '';
        const direction = directional && Number.isFinite(config.north)
          ? light.direction + config.north - 90
          : light.direction;
        const range = (beam ? light.range : directionalReach(light)) * config.pixelsPerMeter;
        if (!(range >= .01) || !(light.intensity > 0)) continue;
        const width = (light.beamWidth ?? light.range) * config.pixelsPerMeter;
        const softness = (light.edgeSoftness ?? (light.type === 'manljus' ? 45 : 25)) / 100;
        const layer = new Container();
        // During a drag the existing single projection follows the pointer.
        // Bake the final penumbra once on drop; other flames keep their shading.
        const beingMoved = moving && ((moving.id && light.id === moving.id) ||
          (moving.characterId && light.characterId === moving.characterId));
        const flame = !beingMoved && flames[light.type];
        const sprites = [];
        if (flame) {
          const key = JSON.stringify([light.type, origin, range, light.direction, light.aperture, config.pixelsPerMeter]);
          let entry = projections.get(slot);
          if (!entry || entry.key !== key || entry.mask !== freeSight || entry.wallKey !== wallKey) {
            if (entry) releaseProjection(entry);
            const parts = bakeFlameParts(origin, range, light, edges, freeSight, map, scale, output, config.pixelsPerMeter)
              .map(({ canvas, x, y }) => ({ texture: Texture.from(canvas), x, y }));
            entry = { key, mask: freeSight, wallKey, parts };
            projections.set(slot, entry);
          }
          activeProjections.add(slot);
          for (const [sample, part] of entry.parts.entries()) {
            for (let index = 0; index < Math.ceil(Math.min(3, light.intensity)); index++) {
              const sprite = new Sprite(part.texture);
              sprite.position.set(part.x, part.y);
              sprite.scale.set(1 / scale);
              sprite.tint = light.color;
              sprite.blendMode = 'add';
              layer.addChild(sprite);
              sprites.push({ sprite, index, sample });
            }
          }
          lightmap.addChild(layer);
          lights.push({ sprites, light, flame });
          continue;
        }
        const mask = new Graphics();
        if (beam === 'parallel') {
          const quads = parallelBeamQuads(origin, range, width, direction, edges, freeSight);
          if (!quads.length) { mask.destroy(); layer.destroy(); continue; }
          for (const quad of quads) mask.poly(quad).fill(0xffffff);
        } else {
          const overhead = beam === 'overhead';
          const radius = overhead ? Math.max(range, width) : range;
          mask.poly(visibilityPolygon(origin, radius, edges, direction, overhead ? 360 : light.aperture, freeSight, Boolean(beingMoved)).flat()).fill(0xffffff);
        }
        const magic = light.type === 'magiskt';
        for (let index = 0; index < Math.ceil(Math.min(3, light.intensity)); index++) {
          const sprite = new Sprite(beam ? beamTexture(beam, softness) : lightTexture);
          sprite.anchor.set(beam === 'parallel' ? 0 : .5, .5);
          sprite.position.set(...origin);
          sprite.width = beam === 'parallel' ? range : range * 2;
          sprite.height = beam === 'parallel' || beam === 'overhead' ? width : range * 2;
          if (beam === 'parallel' || beam === 'overhead') sprite.angle = direction;
          sprite.tint = light.color;
          sprite.blendMode = 'add';
          layer.addChild(sprite);
          sprites.push({ sprite, index });
        }
        if (magic && light.motion > 0) {
          const aura = new Sprite(lightTexture);
          aura.anchor.set(.5);
          aura.position.set(...origin);
          aura.width = aura.height = range * 1.08;
          aura.tint = '#f0dcff';
          aura.alpha = Math.min(.4, light.intensity * light.motion * 2);
          aura.blendMode = 'add';
          layer.addChild(aura);
        }
        layer.addChild(mask);
        layer.mask = mask;
        lightmap.addChild(layer);
        lights.push({ sprites, light });
      }
      for (const [id, entry] of projections) {
        if (!activeProjections.has(id)) {
          releaseProjection(entry);
          projections.delete(id);
        }
      }
      paint(performance.now());
      if (lights.some(({ light }) => light.motion > 0)) {
        const tick = time => {
          if (destroyed || !app.canvas.isConnected) return;
          if (!document.hidden) paint(time);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }
    }

    function destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      lightmap.destroy({ children: true });
      app.destroy({ removeView: true }, { children: true });
      for (const entry of projections.values()) releaseProjection(entry);
      projections.clear();
      target.destroy(true);
      lightTexture.destroy(true);
      for (const texture of [...beamTextures.values(), ...retiredTextures]) texture.destroy(true);
      imageTexture.destroy(true);
      bitmap.close();
    }

    host.prepend(app.canvas);
    return { update, destroy };
  } catch (error) {
    if (app.renderer) app.destroy({ removeView: true }, { children: true });
    target?.destroy(true);
    lightTexture?.destroy(true);
    imageTexture?.destroy(true);
    throw error;
  }
}
