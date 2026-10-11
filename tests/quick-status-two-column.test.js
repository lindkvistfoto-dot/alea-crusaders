import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('src/styles/app.css'),app=read('legacy/app.js'),html=read('index.html');
const from=css.indexOf('/* v0.35.100 — KP/PSY side-by-side');
const finalRules=css.slice(from);
describe('Snabbstatus KP and PSY share one compact row',()=>{
 it('overrides the older mobile single-column rule with a final two-column layout',()=>{
  expect(from).toBeGreaterThan(0);
  expect(css.slice(0,from)).toContain('#view .quick{grid-template-columns:1fr;gap:8px}');
  expect(finalRules).toContain('#view .quick{');
  expect(finalRules).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(finalRules).not.toContain('grid-template-columns:1fr');
 });
 it('keeps health indicators and minus/plus operable in both narrow cards',()=>{
  expect(app).toContain("let q=[['KP','❤️'],['PSY','🔮']]");
  expect(app).toContain("onclick=\"step('${k}',-1)\"");
  expect(app).toContain("onclick=\"step('${k}',1)\"");
  expect(app).toContain('healthbar');
  expect(finalRules).toContain('grid-template-columns:30px minmax(0,1fr) 30px');
  expect(finalRules).toContain('grid-template-columns:27px minmax(0,1fr) 27px');
  expect(finalRules).toContain('white-space:nowrap');
 });
 it('preserves the same status container and existing compact food/water strip',()=>{
  expect(html).toContain('id="quick" class="quick"');
  expect(html).toContain('id="quickProvisions" class="quick-provisions"');
  expect(css).toContain('#view .quick-provisions');
  expect(finalRules).not.toMatch(/(?:height|min-height):\s*(?:9[0-9]|1[0-9][0-9])px/);
  expect(html).toContain('Alea Crusaders v0.35.100');
 });
});
