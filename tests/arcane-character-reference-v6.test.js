import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/character/arcane-layout-v6.css');
const html=read('index.html');
const legacy=read('legacy/app.js');
const artDir='assets/arcane/system/v1/';
const icons={
  ras:'icon-person',yrke:'icon-swords',kon:'icon-female',
  alder:'icon-hourglass',langd:'icon-height',vikt:'icon-weight',
  combat:'icon-swords',stand:'icon-heart'
};

describe('ARCANE reference character profile v6',()=>{
  it('loads last, above the previous v5 layout and v3 attributes',()=>{
    expect(html).toContain('features/character/arcane-layout-v6.css?v=1');
    expect(html.indexOf('arcane-layout-v6.css')).toBeGreaterThan(html.indexOf('arcane-layout-v5.css'));
    expect(html.indexOf('arcane-layout-v6.css')).toBeGreaterThan(html.indexOf('arcane-attributes-v3.css'));
    expect(css).toContain('@media (max-width:850px)');
    expect(css).toContain('body.character-glowup-active #view #grundPanel');
  });
  it('uses the same approved raster panel and nameplate for all details',()=>{
    expect(css).toContain('var(--arcane-art-stat) center / 100% 100% no-repeat');
    expect(css).toContain('var(--arcane-art-nameplate) center / 100% 100% no-repeat');
    expect(css).toContain('var(--arcane-art-portrait)');
    expect(css).toContain('var(--arcane-art-combat)');
    expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))!important');
    expect(css).toContain('grid-template-rows:minmax(clamp(82px,23vw,104px),auto) repeat(4,minmax(clamp(56px,15vw,68px),auto))!important');
    expect(css).not.toMatch(/url\\?\([^)]*\.svg/i);
    expect(css).not.toContain('<svg');
  });
  it.each(Object.entries(icons))('shows actual AVIF raster icon for %s', (name,id)=>{
    expect(legacy.includes('arcane-field-'+name) || legacy.includes('arcane-field-${k}')).toBe(true);
    expect(css).toContain('.field.arcane-field-'+name);
    expect(css).toContain(artDir+id+'.avif');
    const path=artDir+id+'.avif';
    expect(existsSync(new URL('../'+path,import.meta.url)),path).toBe(true);
    const header=readFileSync(new URL('../'+path,import.meta.url)).toString('ascii',4,12);
    expect(header).toBe('ftypavif');
  });
  it('does not clone live fields or change identity values and editing',()=>{
    expect(css).toContain('body.character-glowup-active.editing');
    expect(css).toContain('.grund-input');
    expect(css).toContain('.arcane-field-combat .character-combat-icon-control');
    expect(legacy).toContain('characterCombatIconSource(c)');
    expect(legacy).toContain('characterCombatIconFieldHtml(current)');
    expect(legacy).toContain('setIdentity(');
    expect(legacy).toContain('class="arcane-nameplate-subtitle"');
  });
});
