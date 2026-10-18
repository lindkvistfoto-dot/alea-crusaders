import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path,import.meta.url),'utf8');
const html = read('index.html');
const css = read('features/character/arcane-profile.css');
const legacy = read('legacy/app.js');
const art = [
  'assets/ui/arcane-character-portrait-frame.svg',
  'assets/ui/arcane-character-nameplate.svg',
  'assets/ui/arcane-character-combat-medallion.svg'
];

describe('Arcane character profile',()=>{
  it('loads after existing character and general styles without changing other app screens',()=>{
    const resource='./features/character/arcane-profile.css';
    expect(html).toContain(resource);
    expect(html.lastIndexOf(resource)).toBeGreaterThan(html.lastIndexOf('features/character/glowup.css'));
    expect(html.lastIndexOf(resource)).toBeGreaterThan(html.lastIndexOf('features/home/topbar.css'));
    expect(css).toContain('body.character-glowup-active #view #grundPanel');
    expect(css).toContain('body.character-glowup-active #view .tabs');
    expect(css).toContain('body.character-glowup-active.editing');
  });

  it('provides three transparent SVG ornamental assets with working CSS references',()=>{
    for(const path of art){
      const asset=read(path);
      expect(asset).toMatch(/^<svg\s/);
      expect(asset.trimEnd()).toMatch(/<\/svg>$/);
      expect(asset).toContain('viewBox=');
      expect(css).toContain(path.split('/').at(-1));
      expect(asset).not.toMatch(/<image\b/);
    }
  });

  it('maps all nine existing identity fields without losing dynamic editing controls',()=>{
    for(let index=1;index<=9;index++){
      expect(css).toContain('.field:nth-child('+index+')');
    }
    expect(legacy).toContain('characterCombatIconFieldHtml(current)');
    expect(legacy).toContain('function characterCombatIconFieldHtml(c)');
    expect(legacy).toContain('oninput="setIdentity(');
    expect(legacy).toContain('openCurrentEquipment()');
    expect(html).toContain('id="identity"');
    expect(html).toContain('id="portrait"');
  });

  it('retains combat token editing while hiding placeholder text in view mode',()=>{
    expect(css).toContain('body.character-glowup-active:not(.editing) #view #grundPanel .character-combat-icon-actions{display:none}');
    expect(css).toContain('body.character-glowup-active.editing #view #grundPanel .character-combat-icon-actions');
    expect(legacy).toContain('removeCharacterCombatIcon()');
    expect(legacy).toContain('combatIconFile');
  });

  it('is responsive and leaves original tab navigation wired to setTab',()=>{
    expect(css).toContain('@media (max-width:850px)');
    expect(css).toContain('@media (max-width:700px)');
    expect(css).toContain('grid-template-columns:repeat(7,minmax(0,1fr))!important');
    expect(html).toContain('onclick="setTab(\'grund\')"');
    expect(html).toContain('onclick="setTab(\'skills\')"');
    expect(html).toContain('onclick="setTab(\'magic\')"');
  });
});
