import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
const render=runtime.slice(runtime.indexOf('function renderCombat(){'),runtime.indexOf("document.addEventListener('keydown'",runtime.indexOf('function renderCombat(){')));
describe('SL stridscen under turordningslistan',()=>{
 test('SL-rutan finns inte kvar ovanför stridsvyn i index',()=>{
  expect(html).not.toContain('id="combatGmControls"');
 });
 test('rutan skapas efter turordningslistan under både aktiv strid och före Play',()=>{
  expect((render.match(/id="combatGmControls"/g)||[])).toHaveLength(2);
  const active=render.indexOf("'+participantHtml+'</div><div id=");
  expect(active).toBeGreaterThan(-1);
  expect(render.slice(active,active+125)).toContain('combatGmControls');
  expect(render).toContain('combat-shell combat-shell-idle');
  expect(render).toContain('renderCombatGmControls();return');
 });
 test('SL stridskontroll visas direkt under SL stridsscen i samma sidokolumn',()=>{
  expect((render.match(/combatGmToolboxHtml\(\)/g)||[])).toHaveLength(1);
  expect(render).toContain(`id="combatGmControls" class="combat-gm-controls hidden"></div>'+combatGmToolboxHtml()+'</aside>`);
  expect(render).not.toContain(`+'</div></section>'+combatGmToolboxHtml()+'</div>'`);
  expect(css).toContain('.combat-participants .combat-gm-toolbox{');
  expect(css).toContain('grid-template-columns:minmax(0,1fr);');
 });
 test('SL-kontrollerna återskapas vid varje omrendering',()=>{
  expect(render).toContain(' renderCombatGmControls();\n requestAnimationFrame(');
  expect(css).toContain('.combat-participants .combat-gm-controls{');
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
 });
});
