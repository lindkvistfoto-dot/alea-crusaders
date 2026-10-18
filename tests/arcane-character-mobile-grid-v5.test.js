import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/character/arcane-layout-v5.css');
const html=read('index.html');
const legacy=read('legacy/app.js');
const fields=[
  ['name','1 / -1',1],
  ['ras','1',2],
  ['yrke','2',2],
  ['kon','1',3],
  ['alder','2',3],
  ['langd','1',4],
  ['vikt','2',4],
  ['combat','1',5],
  ['stand','2',5]
];

describe('ARCANE mobile character grid v5 — fixed positions',()=>{
  it('loads after the old ARCANE styles and busts the character script cache',()=>{
    expect(html).toContain('features/character/arcane-layout-v5.css?v=1');
    expect(html.indexOf('arcane-layout-v5.css')).toBeGreaterThan(html.indexOf('arcane-system.css'));
    expect(html).toContain('legacy/app.js?v=0.35.267&arcane-grid=5');
  });
  it('uses two explicit tracks and no implicit named grid areas on phones and tablets',()=>{
    expect(css).toContain('@media (max-width: 850px)');
    expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))!important');
    expect(css).toContain('grid-template-areas:none!important');
    expect(css).toContain('grid-area:auto!important');
    expect(css).toContain('grid-auto-flow:row!important');
    expect(css).not.toMatch(/:nth-child\s*\(/);
  });
  it.each(fields)('%s occupies column %s of row %i regardless of DOM order',(key,col,row)=>{
    if(['kon','alder','langd','vikt'].includes(key)){
      // These four stable classes are produced by the existing identity map.
      expect(legacy).toContain('arcane-field-${k}');
      expect(legacy).toContain("'"+key+"'");
    }else{
      expect(legacy).toContain('arcane-field-'+key);
    }
    const regex=new RegExp('> \\.field\\.arcane-field-'+key+' \\{\\s*grid-column:'+col.replaceAll('/','\\/')+'!important;\\s*grid-row:'+row+'!important;');
    expect(css).toMatch(regex);
  });
  it('keeps title and subtitle inside the lion plaque with readable one-line sizes',()=>{
    expect(css).toContain('min-height:100px!important');
    expect(css).toContain('font:700 clamp(17px,4.9vw,22px)');
    expect(css).toContain('white-space:nowrap!important');
    expect(css).toContain('text-overflow:ellipsis!important');
    expect(css).toContain('arcane-nameplate-subtitle');
    expect(legacy).toContain('escAttr(i.ras||"—")');
    expect(legacy).toContain('escAttr(i.yrke||"—")');
  });
  it('keeps actual race and profession fields visible, even while editing',()=>{
    expect(css).toContain('> .field.arcane-field-ras,');
    expect(css).toContain('> .field.arcane-field-yrke {');
    expect(css).toContain('display:flex!important');
    expect(css).toContain('body.character-glowup-active.editing');
    expect(css).toContain('.grund-input');
    expect(legacy).toContain('class="field wide arcane-field-ras"');
    expect(legacy).toContain('class="field wide arcane-field-yrke"');
  });
  it('places the portrait-based miniature beside social standing in standard sized cards',()=>{
    expect(css).toContain('> .field.arcane-field-combat {');
    expect(css).toContain('flex-direction:row!important');
    expect(css).toContain('flex:0 0 45px!important');
    expect(css).toContain('width:27px!important');
    expect(css).toContain('height:31px!important');
    expect(legacy).toContain('characterCombatIconSource(c)');
    expect(legacy).toContain('getPortraitSrc(c)');
  });
});
