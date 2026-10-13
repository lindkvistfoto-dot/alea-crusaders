import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const begin=runtime.indexOf('function combatLatestResolvedSpellAction(){');
const finish=runtime.indexOf('function combatAttackPanelHtml(){',begin);
if(begin<0||finish<begin)throw Error('Besvärjelsens resultatpanel saknas');
const panelCode=runtime.slice(begin,finish);
const participants=runtime.slice(runtime.indexOf('function combatMiniParticipantHtml('),runtime.indexOf('// Spell feedback is presentation-only'));
const artHelpers=runtime.slice(runtime.indexOf('function combatSpellArtPath('),runtime.indexOf('function combatSpellChooserHtml('));

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
  combatIsActiveTurn:()=>true,combatCannotAct:()=>false,
  combatFireballTargets:()=>new Map([['fighter',{mode:'magic',distance:1}]]),
  combatSpellEffectTargets:()=>[newActor],combatAxialDistance:()=>1,
  window:{matchMedia:()=>({matches:false})},
  combatActionDefinition:a=>a?.source_data?.action_key==='spell_cast'?{key:'spell_cast'}:{key:'attack'},
  combatOutcomeMeta:o=>({label:{fail:'MISSLYCKAT SLAG',success:'LYCKAT SLAG',
   special:'SÄRSKILT SLAG',perfect:'PERFEKT SLAG',fumble:'FUMMELSLAG'}[o],icon:'✦'}),
  combatDamageResultHtml:d=>d?'<div class="damage">Skada tilldelad</div>':'',
  combatRowPortraitUrl:c=>c?.portrait||'',
  combatTokenInitials:name=>String(name).split(' ').map(part=>part[0]).join(''),
  escAttr:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
 };
 Object.assign(context,overrides);
 runInNewContext(artHelpers+participants+panelCode+
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
  expect(html).not.toContain('combat-attack-result-rolls');
  expect(html).not.toContain('mot FV');
  expect(html).not.toContain('combat-magic-facts');
  expect(html).toContain('Visar var vatten finns.');
  expect(html).not.toContain('combat-magic-detail-values');
  expect(html).not.toContain('combat-magic-prepared');
  if(success)expect(html).toContain('SL avgör effekten');
  else expect(html).toContain('Ingen magisk effekt tilldelas');
  if(outcome==='perfect')expect(html).not.toContain('Kontrollslag');
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

 test('mobilkortet visar kastare och status utan FV/EG/CL/PSY-rutor',()=>{
  const {context,action}=fixture();
  action.status='planned';action.source_data.casting_spell=true;
  action.source_data.magic_binding.kind='damage';
  action.source_data.spell_name='ELD (F)';
  action.source_data.effect_grade=1;
  action.source_data.spell_fv=15;
  action.source_data.range_text='Sx10 rutor';
  action.source_data.duration_text='Sx1 minut';
  action.source_data.ready_round=4;
  const waiting=context.spellPanel();
  expect(waiting).toContain('MAGI · ELD (F)');
  expect(waiting).toContain('Förbereder');
  expect(waiting).toContain('Klar i SR 4');
  expect(waiting).not.toContain('combat-magic-facts');
  expect(waiting).not.toContain('combat-magic-detail-values');
  expect(waiting).not.toContain('Målet är valt');
  context.activeCombat.round_number=4;
  expect(context.spellPanel()).toContain('Välj ett mål på kartan');
  context.combatSelectedTargetId='fighter';
  const ready=context.spellPanel();
  expect(ready).toContain('Klar att kasta');
  expect(ready).toContain('combat-magic-duel');
  expect(ready).toContain('>MAGIKER</span>');
  expect(ready).toContain('>MÅL</span>');
  expect(ready).toContain('Krigaren');
  expect(ready).toContain('combat-mini-arrow combat-magic-arrow');
  expect(ready).toContain('Målet är valt. Tryck ✦ igen');
  expect(ready).not.toContain('combat-spell-result');
 });
 test('vald, manuell och områdesbesvärjelse visar korrekt nästa steg',()=>{
  const {context,action}=fixture();
  action.status='planned';action.source_data.casting_spell=false;
  expect(context.spellPanel()).toContain('Vald besvärjelse');
  expect(context.spellPanel()).toContain('Tryck ✦ för att förbereda');
  action.source_data.casting_spell=true;
  action.source_data.ready_round=3;
  expect(context.spellPanel()).toContain('SL avgör effekten efter slaget');
  action.source_data.magic_binding.kind='area';
  expect(context.spellPanel()).toContain('Välj centrum på kartan');
  action.source_data.area_center={q:2,r:3};
  expect(context.spellPanel()).toContain('Klar att kasta');
  action.source_data.magic_binding.cube=true;
  expect(context.spellPanel()).toContain('Väntar på SL');
 });
 test('efter slaget visas resultatstatus utan detaljrutor',()=>{
  const {context,action}=fixture();
  action.result.outcome='perfect';action.result.psy_cost=1;
  expect(context.spellPanel()).toContain('combat-spell-result perfect');
  expect(context.spellPanel()).toContain('PERFEKT SLAG');
  expect(context.spellPanel()).not.toContain('PSY använd');
  expect(context.spellPanel()).not.toContain('combat-magic-detail-values');
  action.result.outcome='fail';
  expect(context.spellPanel()).toContain('combat-spell-result fail');
 });
 test('magirutan visar samma porträttkort som attack och ett kompakt resultat',()=>{
  const {context,mage,newActor,action}=fixture();
  mage.portrait='https://example.test/mage.png';
  newActor.portrait='https://example.test/target.png';
  action.target_combatant_id='fighter';
  const html=context.spellPanel();
  expect(html).toContain('combat-duelist-card attacker');
  expect(html).toContain('combat-duelist-card defender');
  expect(html).toContain('src="https://example.test/mage.png"');
  expect(html).toContain('src="https://example.test/target.png"');
  expect(html).toContain('>MAGIKER</span>');
  expect(html).toContain('>MÅL</span>');
  expect(html.indexOf('combat-magic-duel')).toBeLessThan(html.indexOf('combat-spell-result'));
  expect(html).not.toContain('combat-magic-detail-values');
  expect(html).toContain('combat-spell-outcome-banner');
  expect(html).toContain('combat-spell-effect-surface');
  expect(html).toContain('EFFEKT');
 });
 test('kvadratisk effektbild använder egen fil och eget utsnitt, aldrig ikonen',()=>{
  const {context,action}=fixture();
  const prefix='spell/11111111-1111-4111-8111-111111111111/';
  const icon=prefix+'22222222-2222-4222-8222-222222222222.webp';
  const effect=prefix+'33333333-3333-4333-8333-333333333333.webp';
  Object.assign(action.source_data,{
   spell_icon_path:icon,spell_effect_image_path:effect,
   spell_effect_focus_x:78,spell_effect_focus_y:64,spell_effect_zoom:160
  });
  const result=context.spellPanel();
  expect(result).toContain('combat-spell-effect-artwork');
  expect(result).toContain('data-spell-art-path="'+effect+'"');
  expect(result).toContain('data-focus-x="78"');
  expect(result).toContain('data-focus-y="64"');
  expect(result).toContain('data-zoom="160"');
  expect(result).not.toContain(icon);
 });
 test('magisk skada visar skada minus rustning utan SB, vanlig attack påverkas inte',()=>{
  const begin=runtime.indexOf('function combatDamageResultHtml(');
  const end=runtime.indexOf('function combatParryResultHtml(',begin);
  const context={escAttr:String,combatParseDamageFormula:()=>null};
  runInNewContext(runtime.slice(begin,end)+';this.damageHtml=combatDamageResultHtml;',context);
  const damage={
   weapon_formula:'1T6',weapon_damage_value:4,damage_bonus:'Ingen',damage_bonus_value:0,
   armor_absorption:1,net_damage:3,kp_before:18,kp_after:15
  };
  const magic=context.damageHtml(damage,true);
  expect(magic).toContain('>Skada</span>');
  expect(magic).toContain('>Rustning</span>');
  expect(magic).toContain('>Totalt</span>');
  expect(magic).not.toContain('>SB</span>');
  expect(magic).not.toContain('combat-damage-op">+</i>');
  const physical=context.damageHtml(damage);
  expect(physical).toContain('>SB</span>');
 });
 test('besvärjelser visar inte längre den separata resultatpopupen',()=>{
  const spells=runtime.slice(runtime.indexOf('async function combatCastManualSpell('),runtime.indexOf('function combatLatestResolvedSpellAction()'));
  expect(spells).not.toContain("combatShowOutcomeOverlay(rolled.outcome,spellName+");
  const damage=runtime.slice(runtime.indexOf('async function combatResolveDamage('),runtime.indexOf('function combatParryResultHtml('));
  expect(damage).toContain("if(weapon?._spell_damage)if(typeof combatHideMagicResultPopup==='function')combatHideMagicResultPopup()");
 });
 test('helmagirutan använder vald effektbild före ikonen och behåller beskärningen',()=>{
  const {context,action}=fixture();
  const prefix='spell/11111111-1111-4111-8111-111111111111/';
  const icon=prefix+'22222222-2222-4222-8222-222222222222.webp';
  const effect=prefix+'33333333-3333-4333-8333-333333333333.webp';
  Object.assign(action.source_data,{
   spell_icon_path:icon,spell_icon_focus_x:20,spell_icon_focus_y:30,spell_icon_zoom:130,
   spell_effect_image_path:effect,spell_effect_focus_x:75,spell_effect_focus_y:60,spell_effect_zoom:170
  });
  const html=context.spellPanel();
  expect(html).toContain('combat-mini-magic resolved has-spell-backdrop');
  expect(html).toContain('class="combat-magic-backdrop" data-spell-art-path="'+effect+'" data-focus-x="75" data-focus-y="60" data-zoom="170"');
  expect(html.indexOf('combat-magic-backdrop')).toBeLessThan(html.indexOf('combat-magic-heading'));
  expect(html).toContain('MAGIKER');
  expect(html).toContain('MÅL');
  expect(html).toContain('combat-spell-result');
 });
 test('utan effektbild fyller ikonen magirutan både vid förberedelse och efter kast',()=>{
  const {context,action}=fixture();
  const icon='spell/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp';
  Object.assign(action.source_data,{
   spell_icon_path:icon,spell_effect_image_path:null,
   spell_icon_focus_x:85,spell_icon_focus_y:15,spell_icon_zoom:145
  });
  action.status='planned';action.source_data.casting_spell=false;
  const pending=context.spellPanel();
  expect(pending).toContain('combat-mini-magic planning has-spell-backdrop');
  expect(pending).toContain('class="combat-magic-backdrop" data-spell-art-path="'+icon+'" data-focus-x="85" data-focus-y="15" data-zoom="145"');
  expect(pending).toContain('Tryck ✦ för att förbereda');
  action.status='resolved';action.source_data.casting_spell=true;
  expect(context.spellPanel()).toContain('class="combat-magic-backdrop" data-spell-art-path="'+icon+'"');
 });
 test('förberedd äldre ELD får bakgrund från master trots att stridshandlingen saknar bildfält',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const icon='spell/'+id+'/22222222-2222-4222-8222-222222222222.webp';
  const effect='spell/'+id+'/33333333-3333-4333-8333-333333333333.webp';
  const {context,action}=fixture({ruleSpells:[{
   id,spell_key:'eld',name:'ELD (F)',
   icon_path:icon,icon_focus_x:40,icon_focus_y:60,icon_zoom:125,
   effect_image_path:effect,effect_focus_x:65,effect_focus_y:80,effect_zoom:170
  }]});
  action.status='planned';
  action.source_data.spell_name='ELD (F)';
  action.source_data.spell_id=id;
  action.source_data.spell_key=id;
  action.source_data.casting_spell=true;
  const html=context.spellPanel();
  expect(html).toContain('combat-mini-magic planning has-spell-backdrop');
  expect(html).toContain('class="combat-magic-backdrop" data-spell-art-path="'+effect+'" data-focus-x="65" data-focus-y="80" data-zoom="170"');
  // A result can still display artwork when a battle was prepared before
  // the artwork feature existed; normal modern snapshots remain immutable.
  action.status='resolved';
  expect(context.spellPanel()).toContain('class="combat-magic-backdrop" data-spell-art-path="'+effect+'"');
  action.source_data.spell_icon_path=icon;
  action.source_data.spell_icon_focus_x=12;
  action.source_data.spell_icon_focus_y=34;
  action.source_data.spell_icon_zoom=140;
  expect(context.spellPanel()).toContain('class="combat-magic-backdrop" data-spell-art-path="'+icon+'" data-focus-x="12" data-focus-y="34" data-zoom="140"');
 });
 test('historisk besvärjelse kan matchas på namn när master-ID saknas',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const icon='spell/'+id+'/22222222-2222-4222-8222-222222222222.webp';
  const {context,action}=fixture({ruleSpells:[{id,name:'ELD (F)',spell_key:'eld',icon_path:icon,icon_focus_x:90,icon_focus_y:10,icon_zoom:150}]});
  action.source_data.spell_name='eld (f)';
  expect(context.spellPanel()).toContain('class="combat-magic-backdrop" data-spell-art-path="'+icon+'" data-focus-x="90" data-focus-y="10" data-zoom="150"');
 });
 test('Eld visar inte magikern som sitt eget mål vid återupptagen strid',()=>{
  const {context,action}=fixture();
  action.status='planned';
  action.source_data.casting_spell=true;
  action.source_data.spell_name='ELD (F)';
  action.source_data.magic_binding.kind='damage';
  action.source_data.ready_round=3;
  context.combatSelectedTargetId='mage1'; // The loaded battle initially selects the active actor.
  const html=context.spellPanel();
  expect(html).toContain('Välj mål');
  expect(html).not.toContain('Klar att kasta');
  expect(html).toContain('magic-empty-target');
  context.combatSelectedTargetId='fighter';
  expect(context.spellPanel()).toContain('Klar att kasta');
 });
 test('gamla stridshändelser fungerar med historisk bild och utan bild',()=>{
  const {context,action}=fixture();
  const old='spell/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp';
  action.source_data.spell_image_path=old;
  expect(context.spellPanel()).toContain('class="combat-magic-backdrop" data-spell-art-path="'+old+'"');
  action.source_data.spell_image_path='https://example.com/evil.png';
  expect(context.spellPanel()).not.toContain('class="combat-magic-backdrop"');
  expect(context.spellPanel()).not.toContain('has-spell-backdrop');
 });
 test('områdesmagi och magi utan individuellt mål använder platshållarkort',()=>{
  const {context,action}=fixture();
  action.status='planned';
  action.source_data.magic_binding.kind='area';
  action.source_data.casting_spell=true;
  action.source_data.area_center={q:1,r:2};
  const html=context.spellPanel();
  expect(html).toContain('Område valt');
  expect(html).toContain('magic-empty-target');
  expect(html).toContain('Markera centrum på kartan');
  action.source_data.magic_binding.kind='manual';
  const manual=context.spellPanel();
  expect(manual).toContain('Inget särskilt mål');
  expect(manual).not.toContain('KP — ·');
 });
 test('spelarnamn och besvärjelser escapes i det nya kortet',()=>{
  const {context,action,newActor}=fixture();
  action.source_data.spell_name='<img src=x>';
  action.status='planned';action.source_data.casting_spell=true;
  action.source_data.magic_binding.kind='damage';
  action.source_data.ready_round=3;
  newActor.name_snapshot='<svg onload=attack()>';
  context.combatSelectedTargetId='fighter';
  const html=context.spellPanel();
  expect(html).not.toContain('<img src=x>');
  expect(html).not.toContain('<svg onload=attack()>');
  expect(html).toContain('&lt;img src=x&gt;');
  expect(html).toContain('&lt;svg onload=attack()&gt;');
 });
});
