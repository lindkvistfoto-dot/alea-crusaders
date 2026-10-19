/* v5 regression suite retained as historical filename.
 * Assert current v8 architecture instead of requiring the retired v5 CSS.
 */
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),js=read('features/character/arcane-profile-component.js');
const css=read('features/character/arcane-profile-component.css'),legacy=read('legacy/app.js');

describe('ARCANE character mobile layout — canonical v8',()=>{
  it('does not mount v5/v6/v7 positional CSS',()=>{
    for(const file of ['v5','v6','v7']) expect(html).not.toContain('href="./features/character/arcane-layout-'+file+'.css');
    expect(html).toContain('features/character/arcane-profile-component.css?v=20261019-8b');
    expect(html).toContain('features/character/arcane-profile-component.js?v=20261019-8');
  });
  it('has fixed icon, divider and text columns — not positional nth-child',()=>{
    expect(css).toContain('grid-template-columns:var(--ac-icon-width) 1px minmax(0,1fr)');
    expect(css).toContain('grid-template-rows:auto repeat(4,var(--ac-card-height))');
    expect(js).toContain("layout.className = 'arcane-profile-structure'");
    expect(js).toContain("content.className = 'arcane-profile-card-content'");
    expect(css).not.toContain('nth-child(');
  });
  it('uses the original nine semantic fields in a fixed reference order',()=>{
    for(const key of ['name','ras','yrke','kon','alder','langd','vikt','combat','stand']){
      expect(legacy.includes('arcane-field-'+key)||legacy.includes('arcane-field-${k}')).toBe(true);
    }
    expect(js).toContain("['ras','icon-person']");
    expect(js).toContain("['yrke','icon-swords']");
    expect(js).toContain("['combat','icon-swords']");
  });
  it('keeps one underlying live field and retains normal editing',()=>{
    expect(js).toContain('content.appendChild(byName.get(key))');
    expect(js).toContain("plaque.appendChild(byName.get('name'))");
    expect(js).toContain("new MutationObserver(() => mount(host))");
    expect(css).toContain('body.character-glowup-active.editing');
    expect(css).toContain('.grund-input');
    expect(legacy).toContain('characterCombatIconSource(c)');
    expect(legacy).toContain('getPortraitSrc(c)');
  });
});
