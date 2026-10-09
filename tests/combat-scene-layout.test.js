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

 test('kartans tre vänsterknappar erbjuder 5, 10 och hela kartan',()=>{
  const markup=runtime.slice(runtime.indexOf('function combatMapPresetsHtml(){'),runtime.indexOf('function combatRuntimeHexCells(){'));
  expect(markup).toContain("['near','Nära','5 hex runt aktuell kombatant']");
  expect(markup).toContain("['medium','Mellan','10 hex runt aktuell kombatant']");
  expect(markup).toContain("['large','Stor','Visa hela kartan']");
  expect(markup).toContain('aria-pressed');
  expect(markup).toContain('combatMapSetPreset(');
  expect(render).toContain('renderCombatMap()+combatMapPresetsHtml()');
  expect(css).toContain('.combat-map-presets{');
  expect(css).toContain('left:6px;');
  expect(css).toContain('.combat-map-preset.selected{');
 });
 test('hexradie 5 och 10 täcks i presetsens synfält',()=>{
  const a=runtime.indexOf('function combatMapPresetViewport(');
  const b=runtime.indexOf('function combatMapPresetActorPosition(',a);
  const calc=new Function('COMBAT_MAP_MIN_ZOOM','COMBAT_MAP_MAX_ZOOM',runtime.slice(a,b)+';return combatMapPresetViewport')(1,8);
  const g={width:1600,height:1000,size:20,xPitch:Math.sqrt(3)*20,rowPitch:30,offsetX:40,offsetY:25};
  const actor={q:15,r:10};
  const near=calc(g,actor,5),medium=calc(g,actor,10);
  expect(near.zoom).toBeGreaterThan(medium.zoom);
  const cx=g.xPitch*(actor.q+actor.r/2)+g.offsetX,cy=g.rowPitch*actor.r+g.offsetY;
  for(const [radius,view] of [[5,near],[10,medium]]){
   const w=g.width/view.zoom,h=g.height/view.zoom;
   for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++){
    if((Math.abs(q)+Math.abs(r)+Math.abs(q+r))/2>radius)continue;
    const x=cx+g.xPitch*(q+r/2),y=cy+g.rowPitch*r;
    expect(x).toBeGreaterThanOrEqual(view.x-1e-7);
    expect(x).toBeLessThanOrEqual(view.x+w+1e-7);
    expect(y).toBeGreaterThanOrEqual(view.y-1e-7);
    expect(y).toBeLessThanOrEqual(view.y+h+1e-7)
   }
  }
  expect(calc(g,actor,7)).toBeNull();
  expect(calc(g,null,5)).toBeNull()
 });
 test('närvy följer aktiv kombatant medan vanlig zoom får förbli fri',()=>{
  expect(runtime).toContain("let combatMapPreset='large',combatMapPresetActorKey='';");
  expect(runtime).toContain('combatMapRecenterPreset(g);');
  expect(runtime).toContain("combatMapPreset=null;combatMapPresetActorKey='';");
  expect(runtime).toContain("combatMapPreset='large';combatMapPresetActorKey='';");
  expect(runtime).toContain('combatMapSyncPresetButtons()');
 });

});
