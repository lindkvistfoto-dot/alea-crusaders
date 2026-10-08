import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const begin=runtime.indexOf('function combatLatestResolvedSpellAction(){');
const finish=runtime.indexOf('function combatAttackPanelHtml(){',begin);
if(begin<0||finish<begin)throw Error('Besvärjelsens resultatpanel saknas');
const panelCode=runtime.slice(begin,finish);

function fixture(overrides={}){
 const mage={id:'mage1',name_snapshot:'Eldra',current_psy:8};
 const newActor={id:'fighter',name_snapshot:'Krigaren'};
 const source_data={action_key:'spell_cast',spell_prepared:true,casting_spell:true,
  spell_name:'FINNA VATTEN',spell_fv:15,effect_grade:2,
  magic_binding:{kind:'manual'},magic_rule:{effect_per_eg:'Visar var vatten finns.'},
  magic_casting:{quick:false},range_text:'Beröring',duration_text:'1 timme'};
 const action={id:'spell1',round_number:3,status:'resolved',combatant_id:'mage1',
  source_data,result:{outcome:'success',success:true,roll:8,fv:13,effect_grade:2,
   psy_cost:2,gm_resolution_required:true,manual_effect:true},
  updated_at:'2026-10-08T13:00:00Z'};
 const context={
  activeCombat:{round_number:3},combatants:[mage,newActor],combatActions:[action],
  combatSelectedTargetId:null,
  combatActiveActor:()=>mage,combatChosenAction:()=>action,
  combatActionDefinition:a=>a?.source_data?.action_key==='spell_cast'?{key:'spell_cast'}:{key:'attack'},
  combatOutcomeMeta:o=>({label:{fail:'MISSLYCKAT SLAG',success:'LYCKAT SLAG',
   special:'SÄRSKILT SLAG',perfect:'PERFEKT SLAG',fumble:'FUMMELSLAG'}[o],icon:'✦'}),
  combatDamageResultHtml:d=>d?'<div class="damage">Skada tilldelad</div>':'',
  escAttr:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
 };
 Object.assign(context,overrides);
 runInNewContext(panelCode+
  'this.spellResult=combatSpellResultHtml;this.spellPanel=combatSpellCastPanelHtml;',context);
 return {context,mage,newActor,action};
}

describe('Besvärjelsens resultat i stridsrutan',()=>{
 test.each([
  ['fail',false,'MISSLYCKAT SLAG',1],
  ['success',true,'LYCKAT SLAG',2],
  ['special',true,'SÄRSKILT SLAG',2],
  ['perfect',true,'PERFEKT SLAG',1],
  ['fumble',false,'FUMMELSLAG',1]
 ])('%s syns även utan skada eller automatisk effekt',(outcome,success,label,psy)=>{
  const {context,action}=fixture();
  action.result={...action.result,outcome,success,psy_cost:psy,confirmation_roll:outcome==='perfect'?2:null};
  const html=context.spellPanel();
  expect(html).toContain('FINNA VATTEN');
  expect(html).toContain(label);
  expect(html).toContain('T20 <b>8</b> mot FV <b>13</b>');
  expect(html).toContain('EG <b>2</b>');
  expect(html).toContain('PSY −<b>'+psy+'</b>');
  expect(html).toContain('Visar var vatten finns.');
  expect(html).toContain('Räckvidd Beröring');
  if(success)expect(html).toContain('SL avgör effekten');
  else expect(html).toContain('Ingen magisk effekt tilldelas');
  if(outcome==='perfect')expect(html).toContain('Kontrollslag <b>2</b>');
  expect(html).not.toContain('Skada tilldelad');
 });
 test('resultat visas även när stridsrundan går vidare, men aldrig ovanpå en ny attack',()=>{
  const {context,newActor,action}=fixture();
  context.combatActiveActor=()=>newActor;
  context.combatChosenAction=()=>null;
  context.activeCombat.round_number=4; // Normal spell from prior SR.
  expect(context.spellPanel()).toContain('LYCKAT SLAG');
  context.combatChosenAction=()=>({action_type:'attack',status:'planned',source_data:{action_key:'attack'}});
  expect(context.spellPanel()).toBe('');
  action.round_number=2;
  expect(context.spellPanel()).toBe('');
 });
 test('slagen återger tydligt effekter och motstånd utan att ändra mekaniken',()=>{
  const {context,action}=fixture();
  action.source_data.magic_binding.kind='status';
  action.result={...action.result,gm_resolution_required:false,resisted:true};
  expect(context.spellResult(action)).toContain('målet stod emot effekten');
  action.result.resisted=false;action.result.effect_applied=true;
  expect(context.spellResult(action)).toContain('effekten har tilldelats');
  action.source_data.magic_binding.kind='damage';
  action.result.effect_applied=false;action.result.damage={total:5};
  expect(context.spellResult(action)).toContain('Skada tilldelad');
 });
 test('regeltext escapes, inte HTML-injicering',()=>{
  const {context,action}=fixture();
  action.source_data.magic_rule.effect_per_eg='<script>bad()</script>';
  const html=context.spellResult(action);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
 });
});
