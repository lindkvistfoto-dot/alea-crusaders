import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const feature=readFileSync(new URL('../features/character/figure-images.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../features/character/figure-images.css',import.meta.url),'utf8');

describe('rollfigurens helfigursbilder',()=>{
  it('loads the existing image manager in its own Bilder tab after Utrustning',()=>{
    expect(page).toContain('features/character/figure-images.css?v=0.35.50');
    expect(page).toContain('features/character/figure-images.js?v=0.35.50');
    expect(app).toContain('window.aleaRenderCharacterFigureGallery?.()');
    expect(page).toMatch(/id="tabEquipment"[^>]*>Utrustning<\/button><button id="tabImages"[^>]*>Bilder<\/button>/);
    expect(page).toContain('id="imagesPanel"');
    expect(page).toContain('id="characterFigureGallery"');
    expect(app).toContain("$('imagesPanel').classList.toggle('hidden',t!=='images')");
    expect(feature).toContain("document.getElementById('characterFigureGallery')");
    expect(feature).not.toContain("hero.insertAdjacentElement('afterend',host)");
    expect(feature).toContain('Helfigur');
    expect(feature).toContain('Helfigur (rustning)');
  });
  it('keeps photo separate from clothed and armored full figures',()=>{
    expect(app).toContain("function getPortraitSrc(c){return c.portrait");
    expect(feature).toContain("figureImages?.[key]");
    expect(feature).toContain("{key:'base'");
    expect(feature).toContain("{key:'armored'");
    expect(feature).toContain('target.figureImages=');
    expect(feature).toContain("delete target.figureImages[key]");
  });
  it('preserves cutout transparency with WebP and PNG fallback',()=>{
    expect(feature).toContain("canvas.toDataURL('image/webp'");
    expect(feature).toContain("canvas.toDataURL('image/png')");
    expect(feature).toContain('const MAX_UPLOAD=12*1024*1024');
    expect(feature).toContain('const MAX_IMAGE_DATA=');
    expect(feature).toContain("ALLOWED_MIME=['image/png','image/jpeg','image/webp']");
  });
  it('guards editing, saves via the existing character sync, and permits preview',()=>{
    expect(feature).toContain('canEditCharacter(current)');
    expect(feature).toContain('canEditCharacter(target)');
    expect(feature).toContain('save()');
    expect(app).toContain('data:cleanCharacterForDb(c)');
    expect(feature).toContain('aleaFigureShow');
    expect(feature).toContain('aleaFigureRemove');
    expect(feature).toContain('Escape');
    expect(styles).toContain('.character-figure-viewer');
    expect(styles).toContain('object-fit:contain');
  });
});
