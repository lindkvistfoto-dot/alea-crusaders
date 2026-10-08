import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../features/combat/admin-effects.js',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function harness({rows=[],fields={},admin=true}={}){
 const nodes=Object.fromEntries(['adminEffectTable','adminAreaEffectTable','adminAreaEffectStatus','adminEffectStatus','adminEditorBody','adminEditorTitle','adminEditor'].map(id=>[id,{
  innerHTML:'',textContent:'',classList:{remove(){}}
 }]));
 for(const [id,value] of Object.entries(fields))nodes[id]=value&&typeof value==='object'?value:{value};
 const calls=[];let refresh=0,close=0;
 const ctx={
  ruleEffects:rows,ruleEffectsLoaded:rows.length>0,
  $:id=>nodes[id]||null,
  escAttr:v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  activeUser:()=>({admin}),
  withRuleRegistryLoad:async(_key,func)=>await func(),
  dbJson:async(path,options={})=>{
   calls.push({path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
   if(!options.method)return rows;
   if(options.method==='PATCH')return [{id:'e1'}];
   return []
  },
  closeAdminEditor:()=>{close++},
  refreshAdminRuleRegistry:async()=>{refresh++},
  alert:message=>{throw Error('Unexpected alert '+message)},
  askConfirm:async()=>true,
  crypto:{randomUUID:()=> '123e4567-e89b-42d3-a456-426614174000'}
 };
 runInNewContext(source+'\nthis.api={loadRuleEffects,renderAdminEffects,editRuleEffect,editRuleAreaEffect,ruleEffectFormData,saveRuleEffect,toggleRuleEffect,deleteRuleEffect};',ctx);
 return {ctx,api:ctx.api,nodes,calls,get refresh(){return refresh},get close(){return close}}
}
const effect={id:'e1',code:'spell_flyga',name:'FLYGA',active:true,description:'Kan flyga',category:'magic',polarity:'positive',target_type:'combatant',duration_unit:'round',expiration_condition:'duration',stacking:'refresh',default_duration_rounds:4,modifiers:{type:'flight',ignore_terrain:true},parameter_schema:{}};
const form={
 refName:'DIMMA',refDuration:'4',refCategory:'environment',refType:'area_terrain',refTarget:'area',
 refPolarity:'neutral',refUnit:'round',refEnding:'duration',refStacking:'refresh',
 refDescription:'Döljer sikten',refModifiers:'{"type":"area_terrain","sight_mode":"obscuring"}',
 refParameters:'{"radius":"integer"}',refActive:{checked:true}
};
describe('Admin · effektregister – live data and CRUD',()=>{
 test('area effects have their own editable master table',()=>{
  const area={...effect,id:'e2',name:'DIMMA',code:'area_fog',target_type:'area',modifiers:{type:'area_terrain',sight_mode:'obscuring'}};
  const x=harness({rows:[effect,area]});x.api.renderAdminEffects();
  expect(x.nodes.adminEffectTable.innerHTML).toContain('FLYGA');
  expect(x.nodes.adminEffectTable.innerHTML).not.toContain('DIMMA');
  expect(x.nodes.adminAreaEffectTable.innerHTML).toContain('DIMMA');
  expect(x.nodes.adminAreaEffectStatus.textContent).toContain('1 områdeseffekter');
  x.api.editRuleAreaEffect();expect(x.nodes.adminEditorBody.innerHTML).toContain('area_terrain');
  expect(html).toContain('id="adminAreaEffectTable"');
 });
 test('GM toolbox is after combat log and manual assignment is its last tool',()=>{
  const render=runtime.slice(runtime.indexOf('function renderCombat(){'));
  expect(render.indexOf("'+combatGmToolboxHtml()+'")).toBeGreaterThan(render.indexOf('combatTurnPanelHtml()'));
  const toolbox=runtime.slice(runtime.indexOf('function combatGmToolboxHtml(){'),runtime.indexOf('function renderCombat(){'));
  expect(toolbox.indexOf('combatAreasAdminHtml()')).toBeLessThan(toolbox.indexOf('combatEffectsAdminHtml()'));
 });

 test('register can be fetched directly from shared rule_effects table',async()=>{
  const x=harness({rows:[effect]});x.ctx.ruleEffectsLoaded=false;x.ctx.ruleEffects=[];
  expect((await x.api.loadRuleEffects()).length).toBe(1);
  expect(x.calls[0].path).toContain('rule_effects?select=*&order=name.asc');
 });
 test('table renders all columns and preserves rule codes without editing them',()=>{
  const x=harness({rows:[effect]});x.api.renderAdminEffects();
  const markup=x.nodes.adminEffectTable.innerHTML;
  for(const field of ['Namn','Kod','Kategori','Typ','Mål','Varaktighet','Avslut','Aktiv','Åtgärd','FLYGA','spell_flyga','4 SR'])
   expect(markup).toContain(field);
  expect(markup).toContain('toggleRuleEffect(');
  expect(markup).not.toContain('deleteRuleEffect(');
  expect(x.nodes.adminEffectStatus.textContent).toContain('1 effekter');
 });
 test('advanced editor retains modifiers and parameter schema',()=>{
  const x=harness({rows:[effect]});x.api.editRuleEffect('e1');
  const html=x.nodes.adminEditorBody.innerHTML;
  expect(html).not.toContain('sight_mode');
  expect(html).toContain('ignore_terrain');
  expect(html).toContain('refParameters');
  expect(html).toContain('readonly');
  expect(html).toContain('Spara effekt');
 });
 test('validated form preserves nested JSON and chosen type',()=>{
  const x=harness({fields:form});const data=x.api.ruleEffectFormData();
  expect(data).toMatchObject({name:'DIMMA',category:'environment',target_type:'area',
   default_duration_rounds:4,modifiers:{type:'area_terrain',sight_mode:'obscuring'},
   parameter_schema:{radius:'integer'},active:true});
 });
 test('invalid duration and malformed JSON are rejected before save',()=>{
  expect(()=>harness({fields:{...form,refDuration:'4.5'}}).api.ruleEffectFormData()).toThrow(/heltal/);
  expect(()=>harness({fields:{...form,refModifiers:'[]'}}).api.ruleEffectFormData()).toThrow(/JSON-objekt/);
 });
 test('saving existing definition uses PATCH and refreshes registry',async()=>{
  const x=harness({rows:[effect],fields:form});
  await x.api.saveRuleEffect('e1');
  const patch=x.calls.find(c=>c.method==='PATCH');
  expect(patch.path).toContain('rule_effects?id=eq.e1');
  expect(patch.body.modifiers).toMatchObject({type:'area_terrain',sight_mode:'obscuring'});
  expect(x.refresh).toBe(1);expect(x.close).toBe(1)
 });
 test('creating definition makes a new code but never overwrites existing codes',async()=>{
  const x=harness({fields:form});await x.api.saveRuleEffect();
  const post=x.calls.find(c=>c.method==='POST');
  expect(post.path).toBe('rule_effects');
  expect(post.body.code).toBe('custom_123e4567e89b42d3a456426614174000');
  expect(x.refresh).toBe(1);
 });
 test('activation persists and refreshes; system built-ins cannot be deleted',async()=>{
  const x=harness({rows:[effect]});await x.api.toggleRuleEffect('e1',false,{checked:true});
  expect(x.calls[0].body.active).toBe(false);
  expect(x.refresh).toBe(1);
  // The UI intentionally provides no delete action for FLYGA.
  expect(x.nodes.adminEffectTable.innerHTML).not.toContain('deleteRuleEffect(')
 });
 test('combat continues to use the same registry and manual assignment is collapsed',()=>{
  expect(runtime).toContain("dbJson('rule_effects?select=*&order=name.asc')");
  const section=runtime.slice(runtime.indexOf('function combatEffectsAdminHtml('),runtime.indexOf('async function combatApplyEffect('));
  expect(section).toContain('Manuell effekttilldelning');
  expect(section).not.toContain('Skapa effekt');
  expect(section).not.toContain('Redigera');
  expect(section).not.toContain('open><summary');
  expect(app).toContain("effects:{label:'Effekter'");
  expect(html).toContain('data-admin-section="effects"');
  expect(html).toContain('features/combat/admin-effects.js?v=0.34.57');
 });
});
