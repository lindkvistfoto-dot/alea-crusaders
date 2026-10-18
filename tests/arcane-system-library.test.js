import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const legacy=read('legacy/app.js');
const library=read('features/ui/arcane-system-library.js');
const css=read('features/ui/arcane-system.css');
const assets=[
  'portrait-frame','nameplate','stat-panel','combat-medallion',
  'equipment-button','tab-active','tab-inactive','nav-active','nav-inactive',
  'icon-compass','icon-laurel','icon-swords','icon-magic',
  'icon-map','icon-die','icon-gear','icon-person','icon-female',
  'icon-hourglass','icon-height','icon-weight','icon-heart','icon-equipment'
];

describe('ARCANE system library v1',()=>{
  it('bundles all shared image-generated raster master assets, not SVG replacements',()=>{
    expect(assets.length).toBe(23);
    for(const key of assets){
      const relative='assets/arcane/system/v1/'+key+'.avif';
      const file=fileURLToPath(new URL('../'+relative,import.meta.url));
      expect(existsSync(file),relative).toBe(true);
      const bytes=readFileSync(file);
      expect(bytes.length,relative).toBeGreaterThan(900);
      expect(bytes.toString('ascii',4,12),relative).toBe('ftypavif');
      expect(library,relative).toContain("['"+key+"'");
    }
  });

  it('keeps versioned system assets separate from campaign image data',()=>{
    expect(library).toContain("const VERSION='1.0.0'");
    expect(library).toContain("const BASE='./assets/arcane/system/v1/'");
    expect(library).toContain('window.aleaArcaneSystem=Object.freeze(');
    expect(library).toContain('resolve:(id)=>');
    expect(library).toContain('preload,renderAdmin,openAdmin');
    expect(library).not.toContain('localStorage.setItem');
  });

  it('loads reusable CSS after the original character design and JS after legacy functions',()=>{
    expect(html).toContain('features/ui/arcane-system.css?v=1.0.0');
    expect(html).toContain('features/ui/arcane-system-library.js?v=1.0.0');
    expect(html.indexOf('arcane-system.css')).toBeGreaterThan(html.indexOf('arcane-profile.css'));
    expect(html.indexOf('arcane-system-library.js')).toBeGreaterThan(html.indexOf('legacy/app.js'));
    expect(css).toContain('html.arcane-system-images-ready body.character-glowup-active');
    expect(library).toContain("document.documentElement.classList.toggle('arcane-system-images-ready',ready)");
  });

  it('replaces only ornamentation while retaining live character content and actions',()=>{
    expect(html).toContain('id="portrait"');
    expect(html).toContain('id="identity"');
    expect(html).toContain('onclick="openCurrentEquipment()"');
    expect(html).toContain('arcane-equip-label');
    expect(legacy).toContain('characterCombatIconFieldHtml(current)');
    expect(legacy).toContain("oninput=\"setIdentity(");
    expect(css).toContain("icon-female.avif");
    expect(css).toContain("icon-hourglass.avif");
    expect(css).toContain("icon-height.avif");
    expect(css).toContain("icon-weight.avif");
    expect(css).toContain("icon-heart.avif");
    expect(css).toContain("icon-equipment.avif");
    expect(css).toContain("tab-active.avif");
    expect(css).toContain("tab-inactive.avif");
  });

  it('provides admin navigation, a filterable gallery and a working back path',()=>{
    expect(html).toContain("openAdminSection('arcaneSystem')");
    expect(html).toContain('id="adminArcaneSystem"');
    expect(html).toContain('id="arcaneSystemLibraryGallery"');
    expect(html).toContain('id="arcaneSystemLibrarySearch"');
    expect(html).toContain('id="arcaneSystemLibraryCategory"');
    expect(legacy).toContain("arcaneSystem:['ARCANE");
    expect(legacy).toContain("activeAdminSection==='arcaneSystem'");
    expect(library).toContain("document.getElementById('arcaneSystemLibraryGallery')");
  });
});