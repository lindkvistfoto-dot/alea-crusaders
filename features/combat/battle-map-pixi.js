import { Container, Sprite, Texture } from 'pixi.js';

// All positions, sizes and velocities here are in the same intrinsic map pixels as the lightmap.
export function createBattleEffects(world, radialTexture, map) {
  const atmosphere = new Container();
  const magic = new Container();
  atmosphere.eventMode = magic.eventMode = 'none';
  world.addChild(atmosphere, magic);
  let weather = '';
  let particles = [];
  let casts = [];
  let ppm = 1;

  function makeSprite(layer, texture, color) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(.5);
    sprite.tint = color;
    layer.addChild(sprite);
    return sprite;
  }

  function createWeather() {
    for (const sprite of atmosphere.removeChildren()) sprite.destroy();
    particles = [];
    if (!weather) return;
    // Rain streaks, drifting flakes and moving mist from the effect workshop.
    // Reuse the two existing textures; animate sprite transforms instead of redrawing geometry.
    const count = weather === 'fog' ? 6 : 72;
    for (let i = 0; i < count; i++) {
      const particle = makeSprite(atmosphere, weather === 'rain' ? Texture.WHITE : radialTexture,
        weather === 'rain' ? 0xb9d8e9 : weather === 'snow' ? 0xf4f2e5 : 0xd5e1df);
      particle.alpha = weather === 'fog' ? .23 : weather === 'rain' ? .45 : .8;
      if (weather === 'fog') {
        particle.width = map.width * .58;
        particle.height = map.height * .26;
      } else if (weather === 'rain') {
        particle.width = Math.max(1, .023 * ppm);
        particle.height = .28 * ppm;
        particle.angle = -15;
      } else {
        particle.width = particle.height = Math.max(2, ppm * (.065 + .025 * Math.sin(i)));
      }
      particles.push(particle);
    }
  }

  function clearCasts() {
    for (const cast of casts) cast.sprite.destroy();
    casts = [];
  }

  function update(nextWeather, cues, pixelsPerMeter, reset) {
    const changed = nextWeather !== weather || ppm !== pixelsPerMeter;
    if (changed) {
      weather = nextWeather;
      ppm = pixelsPerMeter;
      createWeather();
    }
    const removed = reset && casts.length > 0;
    if (removed) clearCasts();
    for (const cue of cues) {
      const duration = Math.max(220, Math.min(1000, 85 * Math.hypot(cue.to[0] - cue.from[0], cue.to[1] - cue.from[1]) / ppm));
      const sprite = makeSprite(magic, radialTexture, cue.color);
      sprite.blendMode = 'add';
      casts.push({ ...cue, sprite, started: performance.now(), duration });
    }
    return changed || removed || cues.length > 0;
  }

  function paint(now) {
    const t = now / 1000;
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const x = ((i * .618034) % 1) * map.width, y = ((i * .754878) % 1) * map.height;
      if (weather === 'fog') {
        particle.position.set(((x + t * ppm * .22) % (map.width + particle.width)) - particle.width / 2,
          y + Math.sin(t * .3 + i) * ppm * .12);
      } else if (weather === 'rain') {
        particle.position.set((x + t * ppm * .8) % map.width, (y + t * ppm * 3) % map.height);
      } else {
        particle.position.set(x + Math.sin(t + i) * ppm * .3, (y + t * ppm * .45) % map.height);
      }
    }
    for (let i = casts.length - 1; i >= 0; i--) {
      const cast = casts[i], elapsed = now - cast.started;
      if (elapsed >= cast.duration + 280) {
        cast.sprite.destroy();
        casts.splice(i, 1);
        continue;
      }
      const progress = Math.max(0, Math.min(1, elapsed / cast.duration));
      const impact = Math.max(0, (elapsed - cast.duration) / 280);
      cast.sprite.position.set(cast.from[0] + (cast.to[0] - cast.from[0]) * progress,
        cast.from[1] + (cast.to[1] - cast.from[1]) * progress);
      cast.sprite.width = cast.sprite.height = ppm * (.85 + 1.8 * impact);
      cast.sprite.alpha = 1 - impact;
    }
  }
  return { update, paint, animated: () => particles.length > 0 || casts.length > 0 };
}
