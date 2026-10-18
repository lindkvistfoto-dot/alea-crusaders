import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=file('index.html');
const registry=file('features/ui/arcane-system-library.js');
const glow=file('features/character/glowup.js');
const css=file('features/character/arcane-attributes.css');
const legacy=file('legacy/app.js');

const keys=['fysik','styrka','karisma','storlek','smidighet','intelligens','psykisk-kraft'];
const atlas='assets/arcane/system/v2/attributes-atlas.png';

describe('ARCANE Grundegenskaper · isolated v2 raster components',()=>{
  it('ships an actual transparent PNG atlas and no custom SVG',()=>{
    const p=fileURLToPath(new URL('../'+atlas,import.meta.url));
    expect(existsSync(p)).toBe(true);
    const bytes=readFileSync(p);
    expect(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(bytes.readUInt32BE(16)).toBe(512);
    expect(bytes.readUInt32BE(20)).toBe(192);
    expect(bytes[25]).toBe(6); // RGBA
    expect(css).toContain('attributes-atlas.png');
    expect(css).not.toMatch(/<svg\b/i);
  });

  it('indexes the seven emblems and reusable elements in Systembibliotek',()=>{
    keys.forEach(k=>expect(registry).toContain("'attribute-"+k+"'"));
    for(const item of ['group-medallion','title-medallion','corner-tl','corner-tr','corner-bl','corner-br','header-jewel']){
      expect(registry).toContain("'attribute-"+item+"'");
    }
    expect(registry).toContain("const ATTRIBUTE_ATLAS=");
    expect(registry).toContain("version:header?'3.0.0':sprite?'2.0.0':VERSION");
    expect(registry).toContain("columns:8,rows:3");
    expect(registry).toContain("classList.toggle('arcane-attributes-ready',ok)");
    expect(html).toContain('<option value="Grundegenskaper">Grundegenskaper</option>');
    expect(html).toContain('features/character/arcane-attributes.css?v=2.0.0');
  });

  it('decorates the live matrix using actual picture sprites and keeps original rule values',()=>{
    expect(glow).toContain('nameCell.dataset.arcaneAttribute');
    keys.forEach(k=>expect(glow).toContain('"'+k+'"'));
    expect(css).toContain('.glow-base-icon');
    expect(css).toContain('.glow-base-group .calculated-value');
    expect(css).toContain('.glow-base-value');
    expect(legacy).toContain("Object.entries(current.base).map");
    expect(legacy).toContain("setBase('");
    expect(css).toContain('input.grund-input');
  });

  it('relocates bonus experience to the character tab footer without touching game state',()=>{
    expect(glow).toContain('function relocateBonusExperience()');
    expect(glow).toContain('grid.querySelector(":scope > .bonus-exp-row")');
    expect(glow).toContain('footer.replaceChildren(bonus)');
    expect(glow).toContain('panel.appendChild(footer)');
    expect(glow).toContain('relocateBonusExperience();');
    expect(css).toContain('#grundPanel > .arcane-bonus-footer');
    expect(legacy).toContain("liveStepper('bonusExp',current.live.bonusExp)");
    expect(legacy).toContain("stepLive('");
    expect(legacy).toContain('if(!canEditCharacter(current))return');
    expect(glow).not.toContain('current.live.bonusExp=');
  });
});
