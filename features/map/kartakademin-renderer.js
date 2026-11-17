import { Application, BlurFilter, Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import { isFree, prepareFreeSight } from './kartakademin-mask.js';
import { blockers, directionalReach, isBlocked, resolveOrigin, roomVisibility, visibilityPolygon } from './kartakademin-geometry.js';

export async function mountLighting(host, map) {
  const app = new Application();
  let lightTexture, target, frame, imageTexture;
  let destroyed = false;
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
      for (const { sprite, light } of lights) {
        const wave = (1 + Math.sin(time / (light.type === 'eldstad' ? 93 : 140))) / 2;
        sprite.alpha = light.intensity * (1 - light.motion * wave);
      }
      app.renderer.render({ container: lightmap, target, clear: true });
      app.render();
    }

    function update(config, areas, positions, previewAll = false) {
      cancelAnimationFrame(frame);
      lightmap.removeChildren(1).forEach(child => child.destroy({ children: true }));
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
      for (const light of config.lights) {
        const origin = resolveOrigin(light, positions);
        if (!light.on || !origin || !freeSight || !isFree(freeSight, origin) || isBlocked(config.geometry, origin, 'light')) continue;
        const range = directionalReach(light) * config.pixelsPerMeter;
        if (range < .01) continue;
        const layer = new Container();
        const mask = new Graphics().poly(visibilityPolygon(origin, range, edges, light.direction, light.aperture, freeSight).flat()).fill(0xffffff);
        const sprite = new Sprite(lightTexture);
        sprite.anchor.set(0.5);
        sprite.position.set(...origin);
        sprite.width = sprite.height = range * 2;
        sprite.tint = light.color;
        sprite.blendMode = 'add';
        layer.addChild(mask, sprite);
        sprite.mask = mask;
        lightmap.addChild(layer);
        lights.push({ sprite, light });
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
      target.destroy(true);
      lightTexture.destroy(true);
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
