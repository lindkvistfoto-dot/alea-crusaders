import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {arcaneMorphMarkup} from '../features/material/arcane-morph-markup.js';

const read = p => readFileSync(new URL('../'+p,import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');

describe('HERMES · Arcane Morphing Frame v0.1 asset acceptance',()=>{
 it('retains a verified immutable source ZIP and publishes 29 lossless sprites',()=>{
  const manifest=JSON.parse(read('features/material/arcane-morphing-assets/v01/manifest.json'));
  expect(manifest.schema).toBe(1);
  expect(manifest.target_key).toBe('arcane-gallery-kit');
  expect(manifest.preview_only).toBe(true);
  expect(manifest.supabase_activation).toBe(false);
  expect(Object.keys(manifest.sprites)).toHaveLength(29);
  const zip=read(manifest.original_path);
  expect(hash(zip)).toBe(manifest.original_sha256);
  expect(manifest.original_sha256).toBe('4878fe146bcaaf301e535b34fc9402ecaa5eff33e9caa0adfb2910984c314178');
  for(const [name,sprite] of Object.entries(manifest.sprites)){
   expect(name).toMatch(/^[a-z][a-z0-9_]+$/);
   expect(sprite.path).toBe('features/material/arcane-morphing-assets/v01/'+name+'.webp');
   expect(sprite.width).toBeGreaterThan(0);
   expect(sprite.height).toBeGreaterThan(0);
   expect(sprite.alpha_preserved).toBe(true);
   const image=read(sprite.path);
   expect(image.toString('ascii',0,4)).toBe('RIFF');
   expect(image.toString('ascii',8,12)).toBe('WEBP');
   expect(hash(image)).toBe(sprite.app_sha256);
  }
 });
 it('composes source images as independent parts without stretching decorations',()=>{
  const markup=arcaneMorphMarkup();
  const css=read('features/material/arcane-gallery-kit.css').toString();
  const mainCss=read('features/material/arcane-gallery.css').toString();
  const player=read('features/material/arcane-gallery.js').toString();
  const gm=read('features/material/arcane-gm-preview.js').toString();
  for(const file of ['upper_frame','lower_frame','gear_west','gear_east',
   'piston_closed_a','piston_extended_a','piston_closed_b','piston_extended_b',
   'side_left_top','side_left_inner','side_left_outer','side_left_bottom','side_right_top',
   'side_right_inner','side_right_outer','side_right_bottom']){
   expect(markup+css).toContain(file+'.webp');
  }
  expect(css).not.toContain('background-repeat:repeat-y');
  expect(css).toContain('.arcane-kit-side-sleeve');
  expect(css).toContain('.arcane-kit-side-repeat::before');
  expect(css).toContain('width:18%');
  expect(css).toContain('background:linear-gradient(90deg,');
  expect(css).toContain('height:calc(100% - 17cqw)!important');
  expect(css).toContain('.arcane-gallery-belt{display:none!important}');
  // Separate V01 trough must come AFTER the machine and show private tiles.
  const machineEnd=player.indexOf("arcaneMorphMarkup()+'</div>'");
  const carousel=player.indexOf('class="arcane-gallery-carousel"');
  expect(carousel).toBeGreaterThan(machineEnd);
  expect(player).toContain('arcane-gallery-carousel-frame');
  expect(player).toContain('arcane-carousel-v01.webp');
  expect(player).not.toContain('arcane-gallery-belt--parked');
  expect(player).not.toContain('if(strip&&!strip.hidden)');
  expect(css).not.toContain('#e1dccc 48%');
  expect(css).toContain('overflow:hidden');
  expect(markup.match(/arcane-kit-side-sleeve/g)).toHaveLength(2);
  expect(markup.match(/arcane-kit-side-upper/g)).toHaveLength(2);
  expect(css).toContain('.arcane-kit-side-upper');
  expect(css).toContain('position:absolute;left:0;top:0;width:100%;height:auto');
  const sideTrack=css.slice(css.indexOf('.arcane-kit-side-repeat{'),
   css.indexOf('.arcane-kit-piston{'));
  // Only the variable side track must lose the broad chrome gradient;
  // the narrow, separate mechanical piston is intentionally unchanged.
  expect(sideTrack).not.toContain('#929e9e 48%');
  expect(sideTrack).toContain('#465357 48%');
  expect(sideTrack).not.toContain('#9eaba8 42%');
  const index=read('index.html').toString();
  expect(index).toContain('telescope=03');
  expect(mainCss).toContain('arcane-gallery-kit.css?v=0.35.239&kit=4');
  expect(markup).not.toContain('side_left_middle.webp');
  expect(markup).not.toContain('side_right_middle.webp');
  expect(css).toContain('arcane-kit-actuator--closed');
  expect(css).toContain('arcane-kit-actuator--extended');
  expect(css).toContain('var(--arcane-extension,0)');
  expect(css).toContain('height:auto');
  expect(css).toContain('arcane-gear-angle');
  expect(css).toContain('prefers-reduced-motion:reduce');
  expect(mainCss).toContain('arcane-gallery-kit.css');
  expect(player).toContain('arcane-gallery-kit hidden');
  expect(gm).toContain('arcane-gallery-kit arcane-gm-gallery hidden');
  expect(player).toContain('legolas.readMedia(row,false)');
  expect(gm).toContain('legolas.readMedia(row,false)');
 });
});
