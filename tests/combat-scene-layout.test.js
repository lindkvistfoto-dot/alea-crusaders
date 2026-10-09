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
 test('markerat mål-rutan är borttagen men målmarkering och stridslogg finns kvar',()=>{
  expect(render).not.toContain('<h3>Markerat mål</h3>');
  expect(render).not.toContain('combat-panel combat-target');
  expect(render).not.toContain('combatTargetHtml()');
  expect(runtime).toContain('combatSelectedTargetId');
  expect(render).toContain('<h3>Stridslogg</h3>');
  expect(render).toContain('combatAttackPanelHtml()');
  expect(css).toContain('.combat-shell{grid-template-columns:360px minmax(0,1fr)}');
  expect(css).toContain('.combat-participants{order:2}.combat-board-wrap{order:1}.combat-log{order:3}');
 });

 test('hexkartans panel har ordnade kontroller och separata terräng- och stridsförklaringar',()=>{
  const footer=runtime.slice(runtime.indexOf('function combatMapFooterHtml(){'),runtime.indexOf('function combatRuntimeHexCells(){'));
  expect(footer).toContain('combat-board-footer-head');
  expect(footer).toContain('role="group" aria-label="Kartans zoom och position"');
  for(const command of ['combatMapZoomStep(-1)','combatMapZoomStep(1)','combatMapFitCombatants()','combatMapResetView()'])
   expect(footer).toContain(command);
  expect(footer).toContain('combat-board-legend-title">Terräng');
  expect(footer).toContain('combat-board-legend-title">Under strid');
  expect(footer.indexOf('combat-board-terrain')).toBeLessThan(footer.indexOf('combat-board-status'));
  expect(css).toContain('.combat-board-footer-head{');
  expect(css).toContain('.combat-board-footer .combat-board-legend-group{');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) minmax(0,1.45fr) repeat(3,minmax(0,1fr));');
 });
 test('kartpanelen visar aldrig det tekniska fil-ID:t som titel',()=>{
  const footer=runtime.slice(runtime.indexOf('function combatMapFooterHtml(){'),runtime.indexOf('function combatRuntimeHexCells(){'));
  const renderFooter=new Function('combatRuntimeMapMeta','activeCombat','combatMapView','escAttr',footer+'; return combatMapFooterHtml()');
  const renderName=(name,sceneName='Skelettbyn')=>renderFooter({name},{name:sceneName},{zoom:1},value=>String(value));
  const technical='file 000000004660820ab1143ad0e745c8ca';
  expect(renderName(technical)).not.toContain(technical);
  expect(renderName(technical)).toContain('Skelettbyn');
  expect(renderName('Övervuxen bygata')).toContain('Övervuxen bygata');
  expect(renderName('',technical)).toContain('Aktiv stridsscen');
 });

});
