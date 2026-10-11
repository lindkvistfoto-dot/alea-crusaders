import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('legacy/app.js'),html=read('index.html'),css=read('src/styles/app.css');
const begin=app.indexOf('function characterProvisionsDays(');
const end=app.indexOf('function renderCharacterProvisions(){',begin);
if(begin<0||end<begin)throw Error('Quick-supply helper not found');
const source=app.slice(begin,end);
function scope(model){
 const el={innerHTML:''};
 const context={current:model,$:id=>id==='quickProvisions'?el:null};
 runInNewContext(source+'this.api={renderQuickProvisions,characterProvisionsDays,characterWaterDays};',context);
 return {el,context,render:context.api.renderQuickProvisions}
}
describe('Quick status food and water without growing the sidebar',()=>{
 it('replaces the old explanatory note with a narrow, live-updating strip',()=>{
  expect(html).toContain('id="quickProvisions"');
  expect(html).not.toContain('Speldata kan ändras direkt. Övriga rollpersonsdata ändras via pennan');
  expect(css).toContain('#view .quick-provisions');
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(css).toContain('min-height:30px');
  expect(css).toContain('margin-top:8px');
  expect(css).not.toContain('#view .quick-provisions{height:');
 });
 it('reads existing character food and water, without new storage or consuming supplies',()=>{
  const s=scope({provisionsDays:6,waterDays:4});
  s.render();
  expect(s.el.innerHTML).toContain('Mat: 6 dag(ar) kvar');
  expect(s.el.innerHTML).toContain('Vatten: 4 dag(ar) kvar');
  expect(s.el.innerHTML).toContain('<strong>6</strong>');
  expect(s.el.innerHTML).toContain('<strong>4</strong>');
  expect(s.context.current.provisionsDays).toBe(6);
  expect(s.context.current.waterDays).toBe(4);
 });
 it('shows zero for old characters, highlights empty stores and tracks changes immediately',()=>{
  const s=scope({provisionsDays:0});
  s.render();
  expect(s.el.innerHTML).toContain('Mat: 0 dag(ar) kvar');
  expect(s.el.innerHTML).toContain('Vatten: 0 dag(ar) kvar');
  expect(s.el.innerHTML.match(/class="quick-supply[^"]* empty"/g)).toHaveLength(2);
  s.context.current.waterDays=9;
  s.render();
  expect(s.el.innerHTML).toContain('Vatten: 9 dag(ar) kvar');
  expect(s.el.innerHTML).not.toContain('quick-supply-water empty');
 });
 it('updates on equipment changes, initial character render and existing quick-status redraw',()=>{
  expect(app).toContain("function renderCharacterProvisions(){\n renderQuickProvisions();");
  expect(app).toContain("renderQuickProvisions()}function resetWeaponScroll()");
  expect(app).toContain("save();renderCharacterProvisions()");
  expect(app).toContain("renderEquipment();setTab(activeTab,true)");
  expect(html).toContain('Snabbstatus</h2><div id="quick" class="quick"></div>');
 });
});
