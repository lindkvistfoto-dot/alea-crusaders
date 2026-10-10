import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('legacy/app.js');
const css=read('src/styles/app.css');
const start=js.indexOf('function renderAdminArmors(){');
const end=js.indexOf('function editRuleArmor(',start);
const code=js.slice(start,end);
const responsive=css.slice(css.lastIndexOf('/* v0.35.52: armor admin'));

function renderArmors(){
 const table={innerHTML:''},status={textContent:''};
 const sample=(id,name)=>({
  id,name,type_key:'hardened-leather',category:'leather',absorption:2,weight_code:'B',
  bep:1,price_per_bep:12,canonical_expert:true,source_label:'Expert',
  description:'Rivförstärkt läder',image_torso_path:null
 });
 const rows=[sample('aaaaaaaa-1111-4444-9999-aaaaaaaaaaaa','Härdat läder'),sample('bbbbbbbb-2222-4444-9999-bbbbbbbbbbbb','Läder med nitar')];
 const ctx={
  $:id=>id==='adminArmorTable'?table:id==='adminArmorStatus'?status:null,
  ruleArmorLoaded:true,ruleArmorTypes:rows,ruleArmorMaterials:[],
  asBool:Boolean,escAttr:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  ruleArmorCategoryLabel:()=> 'Läder',ruleArmorIconHtml:()=>'<span>Ikon</span>'
 };
 runInNewContext(code+'\nrenderAdminArmors()',ctx);
 return {html:table.innerHTML,status:status.textContent};
}
describe('Rustningsadmin på mobil',()=>{
 it('groups all 11 values into one row so responsive CSS never splits edit actions from the item',()=>{
  const {html,status}=renderArmors();
  expect(status).toContain('2 rustningstyper');
  expect(html.match(/class="armor-admin-row armor-admin-record"/g)).toHaveLength(2);
  expect(html.match(/class="ahead"/g)).toHaveLength(11);
  expect(html.match(/class="armor-cell-actions adminactions"/g)).toHaveLength(2);
  expect(html.match(/class="armor-cell-name"/g)).toHaveLength(2);
  for(const id of ['aaaaaaaa-1111-4444-9999-aaaaaaaaaaaa','bbbbbbbb-2222-4444-9999-bbbbbbbbbbbb']){
   expect(html).toContain("editRuleArmor('"+id+"')");
   expect(html).toContain("deleteRuleArmor('"+id+"')");
  }
 });
 it('mobile view uses fully visible card actions beside the armor name without horizontal scrolling',()=>{
  expect(responsive).toContain('@media(max-width:700px)');
  expect(responsive).toContain('overflow:visible');
  expect(responsive).toContain('min-width:0');
  expect(responsive).toContain('.armor-admin-header{display:none}');
  expect(responsive).toContain('.armor-admin-record .armor-cell-name{');
  expect(responsive).toContain('.armor-admin-record .armor-cell-actions{');
  expect(responsive).toContain('grid-column:3;');
  expect(responsive).toContain('min-height:42px');
  expect(responsive).toContain('touch-action:manipulation');
 });
 it('desktop row keeps all 11 columns and an independently scrollable table where needed',()=>{
  expect(responsive).toContain('grid-template-columns:64px minmax(155px,1.4fr)');
  expect(responsive).toContain('min-width:1100px');
  expect(responsive).toContain('overflow-x:auto');
 });
});
