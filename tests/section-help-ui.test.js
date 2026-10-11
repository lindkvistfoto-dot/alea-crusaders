import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const help=read('features/ui/section-help.js');
const css=read('features/ui/section-help.css');
const app=read('legacy/app.js');
const html=read('index.html');
function setup(){
 const scope={window:{}};
 runInNewContext(help,scope);
 return scope.window.aleaSectionHelp
}
describe('Shared section information component',()=>{
 it('provides one reusable circular help button and registerable topics',()=>{
  const api=setup();
  expect(api.has('provisions')).toBe(true);
  expect(api.button('provisions')).toContain('class="alea-section-help-trigger"');
  expect(api.button('provisions')).toContain('aria-label="Mer information om Mat &amp; proviant"');
  expect(api.button('no_topic')).toBe('');
  api.register('other',{title:'Test <ämne>',paragraphs:['First detail']});
  expect(api.button('other')).toContain('Test &lt;ämne&gt;');
  expect(()=>api.register('bad"onclick',{title:'X'})).toThrow();
 });
 it('opens, closes, and escapes text safely in the same accessible dialog',()=>{
  const events={},dialog={
   isConnected:true,open:false,innerHTML:'',
   setAttribute(name,value){this[name]=value},
   addEventListener(name,cb){events[name]=cb},
   querySelector:()=>({focus(){}}),
   showModal(){this.open=true},close(){this.open=false;events.close?.()}
  };
  const active={isConnected:true,focus(){}};
  const doc={activeElement:active,body:{appendChild(){}},createElement:()=>dialog};
  const scope={window:{},document:doc};
  runInNewContext(help,scope);
  const api=scope.window.aleaSectionHelp;
  api.register('safe',{title:'A <script>',paragraphs:['Untrusted <img src=x>']});
  expect(api.open('safe')).toBe(true);
  expect(dialog.open).toBe(true);
  expect(dialog.innerHTML).toContain('&lt;script&gt;');
  expect(dialog.innerHTML).toContain('&lt;img src=x&gt;');
  expect(dialog.innerHTML).not.toContain('<script>');
  api.close();expect(dialog.open).toBe(false);
 });
 it('keeps each provision on one horizontal row and moves guidance behind the help icon',()=>{
  const begin=app.indexOf('function renderCharacterProvisions(){');
  const end=app.indexOf('function setCharacterProvisions(value){',begin);
  const panel=app.slice(begin,end);
  const current={provisionsDays:6,waterDays:6};
  const el={innerHTML:''},widget=setup();
  const scope={current,editing:false,campaignDayState:{day_number:9},
   window:{aleaSectionHelp:widget},canEditCharacter:()=>true,
   $:id=>id==='characterProvisions'?el:null,
   characterProvisionsDays:()=>6,characterWaterDays:()=>6,renderQuickProvisions:()=>{}};
  runInNewContext(panel+'this.render=renderCharacterProvisions;',scope);
  scope.render();
  expect(el.innerHTML.match(/class="provisions-line /g)).toHaveLength(2);
  expect(el.innerHTML).toContain('window.aleaSectionHelp.open');
  expect(el.innerHTML).not.toContain('provisions-note');
  expect(el.innerHTML).not.toContain('Mat och vatten anges separat');
  expect(el.innerHTML).toContain('stepCharacterProvisions(-1)');
  expect(el.innerHTML).toContain('stepCharacterWater(1)');
  expect(css).toContain('.alea-section-help-dialog::backdrop');
  expect(read('src/styles/app.css')).toContain('grid-template-columns:minmax(0,1fr) auto auto');
  expect(html).toContain('section-help.js?v=0.35.100');
  expect(html).toContain('section-help.css?v=0.35.100');
  expect(html.indexOf('section-help.js?v=0.35.100')).toBeLessThan(html.indexOf('legacy/app.js?v=0.35.100'));
 });
});
