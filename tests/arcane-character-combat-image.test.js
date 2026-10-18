import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const legacy=read('legacy/app.js');
const html=read('index.html');
const css=read('features/ui/arcane-system.css');
const start=legacy.indexOf('function characterCombatIconSource(c){');
const end=legacy.indexOf('async function handleCharacterCombatIconFile(',start);
const methods=legacy.slice(start,end);
function setup(c,allowed=true){
 const gallery={innerHTML:''};
 const ctx={
  current:c,
  $:name=>name==='characterPortraitCombatGallery'?gallery:null,
  getPortraitSrc:x=>x?.portrait||'',
  combatIconCachedUrl:path=>path==='custom-token.webp'?'blob:custom-token':'',
  combatIconHexHtml:url=>'<span class="token">'+String(url)+'</span>',
  canEditCharacter:()=>allowed,
  escAttr:v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 };
 runInNewContext(methods+';globalThis.api={characterCombatIconSource,characterCombatIconFieldHtml,renderCharacterCombatIconGallery};',ctx);
 return {...ctx.api,gallery};
}
describe('ARCANE character: portrait default and compact combat icon',()=>{
 it('reuses the portrait as the default token, with no custom icon',()=>{
  const c={portrait:'data:image/jpeg;base64,portrait',identity:{namn:'Astrid'},combatIconPath:''};
  const api=setup(c);
  expect(api.characterCombatIconSource(c)).toBe(c.portrait);
  expect(api.characterCombatIconFieldHtml(c)).toContain(c.portrait);
  api.renderCharacterCombatIconGallery();
  expect(api.gallery.innerHTML).toContain('Porträttbilden används som standard på stridskartan.');
  expect(api.gallery.innerHTML).toContain('Välj annan bild');
  expect(api.gallery.innerHTML).not.toContain('Använd porträttbild');
  expect(api.gallery.innerHTML).toContain('Byt porträttbild');
  expect(api.characterCombatIconFieldHtml(c)).not.toContain('Schablon');
 });
 it('uses the custom token if one exists, with a reset to portrait under Bilder',()=>{
  const c={portrait:'data:image/jpeg;base64,portrait',identity:{namn:'Astrid'},combatIconPath:'custom-token.webp'};
  const api=setup(c);
  expect(api.characterCombatIconSource(c)).toBe('blob:custom-token');
  api.renderCharacterCombatIconGallery();
  expect(api.gallery.innerHTML).toContain('Egen bild används på stridskartan.');
  expect(api.gallery.innerHTML).toContain('Använd porträttbild');
  expect(api.gallery.innerHTML).toContain('blob:custom-token');
 });
 it('never offers image uploads to users without character edit rights',()=>{
  const c={portrait:'data:image/jpeg;base64,portrait',identity:{namn:'Astrid'},combatIconPath:''};
  const api=setup(c,false);api.renderCharacterCombatIconGallery();
  expect(api.gallery.innerHTML).not.toContain('Välj annan bild');
  expect(api.gallery.innerHTML).not.toContain('Byt porträttbild');
 });
 it('keeps separate race and profession controls and centered plaque subtitle',()=>{
  expect(legacy).toContain('class="arcane-nameplate-subtitle"');
  expect(legacy).toContain('escAttr(i.ras||"—")');
  expect(legacy).toContain('escAttr(i.yrke||"—")');
  expect(legacy).toContain('<div class="field wide"><div class="label">Ras</div>');
  expect(legacy).toContain('<div class="field wide"><div class="label">Yrke / titel</div>');
  const v4=css.slice(css.indexOf('ARCANE identity v4'));
  expect(v4).toContain("'race race title title'");
  expect(v4).toContain('display:flex!important');
  expect(v4).toContain('font-size:clamp(18px,4.6vw,25px)');
  expect(v4).toContain('font-size:clamp(11px,3.1vw,15px)');
 });
 it('displays dedicated image-management cards and tiny token on mobile',()=>{
  expect(html).toContain('id="characterPortraitCombatGallery"');
  expect(html).toContain('id="combatIconFile"');
  expect(html).toContain("onchange=\"handleCharacterCombatIconFile(this.files&&this.files[0])\"");
  expect(css).toContain('width:52px!important');
  expect(css).toContain('height:34px!important');
  expect(css).toContain('arcane-character-image-grid');
  expect(legacy).toContain('renderCharacterCombatIconGallery();');
  expect(legacy).toContain('if(!file||!current||!canEditCharacter(current))return;');
  expect(legacy).toContain('if(!current?.combatIconPath||!canEditCharacter(current))return;');
 });
});