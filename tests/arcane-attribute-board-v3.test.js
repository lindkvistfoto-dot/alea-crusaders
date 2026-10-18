import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const v2=read('features/character/arcane-attributes.css');
const v3=read('features/character/arcane-attributes-v3.css');
const atlasRegistry=read('features/ui/arcane-system-library.js');
const decorator=read('features/character/glowup.js');
const game=read('legacy/app.js');
const board=readFileSync(new URL('../assets/arcane/system/v3/attribute-title-plaque.webp',import.meta.url));

describe('ARCANE ATTRIBUTE BOARD v3',()=>{
  it('ships real image-generated bronze title art with alpha (not SVG or a screenshot)',()=>{
    expect(board.subarray(0,4).toString('ascii')).toBe('RIFF');
    expect(board.subarray(8,12).toString('ascii')).toBe('WEBP');
    expect(board.subarray(12,16).toString('ascii')).toBe('VP8X');
    expect(board.length).toBeGreaterThan(40000);
    expect(board.length).toBeLessThan(300000);
    expect(v3).toContain("attribute-title-plaque.webp");
    expect(v3).not.toContain('<svg');
  });
  it('loads the title board last without changing the profile or data scripts',()=>{
    expect(html).toContain('features/character/arcane-attributes-v3.css?v=3.0.0');
    expect(html.indexOf('arcane-attributes-v3.css')).toBeGreaterThan(html.indexOf('arcane-attributes.css'));
    expect(html.indexOf('arcane-attributes-v3.css')).toBeGreaterThan(html.indexOf('arcane-layout-v5.css'));
    expect(html).toContain('id="basegrid"');
    expect(html).toContain('Grundegenskaper');
  });
  it('registers versioned v3 title artwork in the system library',()=>{
    expect(atlasRegistry).toContain("const ATTRIBUTE_HEADER_V3='./assets/arcane/system/v3/attribute-title-plaque.webp'");
    expect(atlasRegistry).toContain("['attribute-title-plaque','Rubrikplakett · v3'");
    expect(atlasRegistry).toContain("version:header?'3.0.0'");
    expect(atlasRegistry).toContain("format:header?'image/webp'");
  });
  it('reuses seven distinct visual attribute motifs from the approved v2 atlas',()=>{
    const mapping=[
      ['fysik','0 0'],['styrka','14.2857% 0'],['karisma','28.5714% 0'],
      ['storlek','42.8571% 0'],['smidighet','57.1429% 0'],
      ['intelligens','71.4286% 0'],['psykisk-kraft','85.7143% 0']
    ];
    for(const [attribute,position] of mapping){
      expect(decorator).toContain(attribute);
      if(attribute!=='fysik')expect(v2).toContain('[data-arcane-attribute="'+attribute+'"] .glow-base-icon{background-position:'+position+'}');
    }
    expect(v2).toContain('attributes-atlas.png');
    expect(v3).toContain('var(--arcane-attribute-atlas)');
  });
  it('retains live numbers, group medallions, edit inputs and game calculations',()=>{
    expect(game).toContain("Object.entries(current.base).map(([k,o])");
    expect(game).toContain("setBase('${k}','v',this.value)");
    expect(game).toContain("o.g===''?'—':o.g");
    expect(v3).toContain('.glow-base-value');
    expect(v3).toContain('.glow-base-group .calculated-value');
    expect(v2).toContain('input.grund-input');
  });
  it('keeps bonus experience outside the board at the very bottom of Grundsida',()=>{
    expect(decorator).toContain('function relocateBonusExperience()');
    expect(decorator).toContain('footer.replaceChildren(bonus)');
    expect(decorator).toContain('panel.appendChild(footer)');
    expect(v2).toContain('> .arcane-bonus-footer');
    expect(v3).toContain('.arcane-bonus-footer');
  });
  it('makes decorative image intersections non-interactive and responsive',()=>{
    expect(v3).toContain('pointer-events:none');
    expect(v3).toContain('html.arcane-attributes-ready');
    expect(v3).toContain('background:var(--arcane-attribute-atlas)');
    expect(v3).toContain('@media(max-width:560px)');
    expect(v3).toContain('@media(max-width:365px)');
  });
});
