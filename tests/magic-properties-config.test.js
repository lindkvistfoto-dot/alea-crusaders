import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const moduleSource=read('features/equipment/magic-properties.js');
const migration=read('supabase/migrations/20261011024500_magic_property_powers.sql');
const html=read('index.html');
const app=read('legacy/app.js');
const css=read('features/equipment/magic-properties.css');
const artifactJs=read('features/equipment/magic-artifacts.js');
const aid='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const did='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const sid='cccccccc-3333-4333-8333-cccccccccccc';
const pid='dddddddd-4444-4444-8444-dddddddddddd';

function harness(admin=true){
 const rows=[
  {id:did,property_key:'cast_spell',name:'Kasta besvärjelse',kind:'spell',active:true,sort_order:1}
 ];
 const bound=[{
  id:pid,artifact_id:aid,property_id:did,spell_id:sid,
  effect_grade:3,psy_source:'artifact',charge_cost:2,activation:'action',
  active:true,bonus_value:0,uses_per_day:2,sort_order:1
 }];
 const nodes={
  adminMagicPropertiesTable:{innerHTML:''},
  adminMagicPropertiesStatus:{textContent:''},
  adminMagicPropertySearch:{value:''},
  adminEditor:{classList:{remove:vi.fn()}},
  adminEditorTitle:{textContent:''},
  adminEditorBody:{innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null},
  mapProperty:{value:did},
  mapSpell:{value:sid},
  mapActivation:{value:'action'},
  mapEg:{value:'4'},
  mapMultiplier:{value:'4'},
  mapCastMode:{value:'fixed'},
  mapFixedFv:{value:'5'},
  mapRecharge:{value:'next_day'},
  mapPsy:{value:'wearer'},
  mapChargeCost:{value:'1'},
  mapUses:{value:'2'},
  mapTarget:{value:'En fiende'},
  mapDuration:{value:'3 SR'},
  mapDetails:{value:'EG anger styrkan'},
  mapSort:{value:'10'},
  mapActive:{checked:true}
 };
 const calls=[];
 const scope={
  document:{getElementById:id=>nodes[id]||null},
  activeUser:()=>({admin}),
  dbJson:vi.fn(async (url,options={})=>{
   calls.push({url,options});
   if(url.includes('rule_magic_property_definitions?'))return rows;
   if(url.includes('rule_magic_artifact_powers?'))return bound;
   return [];
  }),
  ruleSpells:[{id:sid,name:'Eldpil',spell_key:'eldpil'}],
  loadRuleMagicRegistry:vi.fn(async()=>[]),
  window:{
   aleaMagicArtifacts:{
    get:()=>({id:aid,name:'Eldstav'}),
    render:vi.fn()
   }
  },
  crypto:{randomUUID:()=>'eeeeeeee-5555-4555-8555-eeeeeeeeeeee'},
  console,alert:vi.fn(),
  closeAdminEditor:vi.fn(),
  askConfirm:vi.fn(async()=>true)
 };
 runInNewContext(moduleSource,scope);
 return {scope,nodes,calls,api:scope.window.aleaMagicProperties,rows,bound};
}
describe('Magiska egenskaper som återanvändbara förmågor',()=>{
 it('har säker datamodell med flera egenskaper per artefakt och länk till besvärjelser',()=>{
  expect(migration).toContain('public.rule_magic_property_definitions');
  expect(migration).toContain('public.rule_magic_artifact_powers');
  expect(migration).toContain('references public.rule_spells(id) on delete restrict');
  expect(migration).toContain('references public.rule_magic_artifacts(id) on delete cascade');
  expect(migration).toContain('references public.rule_magic_property_definitions(id) on delete restrict');
  expect(migration).toContain("power_kind='spell' and new.spell_id is null");
  expect(migration).toContain('protect_magic_property_kind');
  expect(migration).toContain('private.is_admin()');
  expect(migration).toContain("('cast_spell','Kasta besvärjelse','spell'");
 });
 it('visar ett återanvändbart register och egenskaper för varje artefakt på mobilen',()=>{
  expect(html).toContain('id="adminMagicPropertiesTable"');
  expect(html).toContain('onclick="editMagicProperty()"');
  expect(html).toContain('features/equipment/magic-properties.js?v=');
  expect(html).toContain('features/equipment/magic-properties.css?v=');
  expect(css).toContain('@media(max-width:700px)');
  expect(app).toContain('window.aleaMagicProperties?.refresh?.()');
  expect(artifactJs).toContain('openArtifactPowers(');
  expect(artifactJs).toContain('window.aleaMagicProperties?.summary?.(row.id)');
 });
 it('hämtar både egenskapstyper och tilldelade förmågor och sammanfattar besvärjelsen',async()=>{
  const t=harness();
  await t.api.refresh();
  expect(t.calls.map(x=>x.url)).toEqual([
   'rule_magic_property_definitions?select=*&order=sort_order.asc,name.asc',
   'rule_magic_artifact_powers?select=*&order=sort_order.asc,created_at.asc'
  ]);
  expect(t.api.summary(aid)).toContain('Kasta besvärjelse: Eldpil');
  expect(t.api.powersFor(aid)).toHaveLength(1);
  expect(t.nodes.adminMagicPropertiesTable.innerHTML).toContain('Kasta besvärjelse');
  expect(t.nodes.adminMagicPropertiesTable.innerHTML).toContain('Används');
 });
 it('skyddar anropen när användaren inte är administratör',async()=>{
  const t=harness(false);
  await t.api.load();
  expect(t.calls).toHaveLength(0);
  expect(t.api.powersFor(aid)).toHaveLength(0);
 });
 it('visar rätt formulär för att konfigurera Eldpil, EG, PSY och laddningskostnad',async()=>{
  const t=harness();await t.api.load();
  await t.scope.window.editArtifactPower(aid,pid);
  expect(t.scope.loadRuleMagicRegistry).toHaveBeenCalled();
  const editor=t.nodes.adminEditorBody.innerHTML;
  expect(editor).toContain('Eldpil');
  expect(editor).toContain('id="mapSpell"');
  expect(editor).toContain('id="mapEg"');
  expect(editor).toContain('id="mapPsy"');
  expect(editor).toContain('id="mapChargeCost"');
  expect(editor).toContain('id="mapTargetAttribute"');
  expect(editor).toContain('id="mapBonus"');
  expect(editor).toContain('saveArtifactPower(');
 });
 it('sparar kopplad besvärjelse med egen effektgrad och användningsvillkor',async()=>{
  const t=harness();await t.api.load();
  await t.scope.window.saveArtifactPower(aid,pid);
  const patch=t.calls.find(x=>x.options.method==='PATCH');
  expect(patch.url).toContain('rule_magic_artifact_powers?id=eq.');
  const body=JSON.parse(patch.options.body);
  expect(body.artifact_id).toBe(aid);
  expect(body.property_id).toBe(did);
  expect(body.spell_id).toBe(sid);
  expect(body.effect_grade).toBe(4);
  expect(body.effect_multiplier).toBe(4);
  expect(body.fixed_fv).toBe(5);
  expect(body.recharge_rule).toBe('next_day');
  expect(body.psy_source).toBe('wearer');
  expect(body.charge_cost).toBe(1);
  expect(body.uses_per_day).toBe(2);
  expect(body.target_text).toBe('En fiende');
 });
 it('kräver besvärjelse för egenskapstypen Besvärjelse',async()=>{
  const t=harness();await t.api.load();
  t.nodes.mapSpell.value='';
  await t.scope.window.saveArtifactPower(aid,pid);
  expect(t.scope.alert).toHaveBeenCalledWith(expect.stringContaining('Välj en besvärjelse'));
  expect(t.calls.filter(x=>x.options.method==='PATCH')).toHaveLength(0);
 });
});
