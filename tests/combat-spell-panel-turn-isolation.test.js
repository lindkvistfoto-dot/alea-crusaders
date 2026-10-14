import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const first=runtime.indexOf('function combatSpellCastPanelHtml(){');
const last=runtime.indexOf('/* Compact reaction renderer',first);
if(first<0||last<=first)throw Error('Missing spell-panel renderer');
const renderer=runtime.slice(first,last);

const lyra={id:'lyra',name_snapshot:'Lyra Gråväv'};
const johan={id:'johan',name_snapshot:'Riddar Johan'};
const foe={id:'foe',name_snapshot:'Kva\'argh'};
const spell=(status='resolved')=>({
 id:'spell-lyra',combatant_id:'lyra',round_number:2,status,
 source_data:{
  action_key:'spell_cast',spell_prepared:true,casting_spell:false,
  spell_name:'ELD (F)',magic_binding:{kind:'damage'},
  magic_casting:{quick:false},ready_round:2
 },
 result:status==='resolved'?{outcome:'success'}:null
});
const other={id:'attack-johan',combatant_id:'johan',round_number:2,status:'planned',
 source_data:{action_key:'attack'}};

function view(current,action,previous=spell()){
 let legacyFallbackCalls=0;
 const context={
  activeCombat:{round_number:2},
  combatants:[lyra,johan,foe],
  combatSelectedTargetId:null,
  combatActiveActor:()=>current,
  combatChosenAction:()=>action,
  combatLatestResolvedSpellAction:()=>{legacyFallbackCalls++;return previous},
  combatActionDefinition:a=>a?{key:a.source_data?.action_key}:null,
  combatSpellArtworkForAction:()=>({path:'',x:50,y:50,zoom:100}),
  combatMagicTargetIsReady:()=>false,
  combatMagicHeaderHtml:actor=>'<div class="caster">'+actor.name_snapshot+'</div>',
  combatMagicTargetPickerHtml:()=>'<div class="target-picker"></div>',
  combatSpellResultHtml:()=>'<div class="spell-result">Lyckat</div>',
  combatMagicStatusHtml:label=>'<div class="magic-status">'+label+'</div>',
  combatMagicConfirmHtml:()=>'<button>Förbered</button>',
  escAttr:String
 };
 runInNewContext(renderer+'\nthis.renderSpellPanel=combatSpellCastPanelHtml;',context);
 return {html:context.renderSpellPanel(),legacyFallbackCalls};
}
describe('Magirutan följer aktiv kombatant',()=>{
 it('visar inte en gammal besvärjelse på en ny tur utan handling',()=>{
  const result=view(johan,null);
  expect(result.html).toBe('');
  expect(result.legacyFallbackCalls).toBe(0);
 });
 it('visar inte den gamla magikern när nästa kombatant valt attack',()=>{
  expect(view(johan,other).html).toBe('');
 });
 it('visar fortfarande magi för den aktiva magikerns egen pågående kastning',()=>{
  const active=spell('planned');
  const result=view(lyra,active);
  expect(result.html).toContain('combat-mini-magic');
  expect(result.html).toContain('Lyra Gråväv');
  // Preparation no longer duplicates the action caption in a separate row.
  expect(result.html).toContain('<button>Förbered</button>');
  expect(result.legacyFallbackCalls).toBe(0);
 });
 it('visar det avslutade magislaget på magikerns tur men inte nästa',()=>{
  const done=spell();
  expect(view(lyra,done).html).toContain('spell-result');
  expect(view(johan,null,done).html).toBe('');
 });
 it('ignorerar en felaktigt kopplad magihandling från annan kombatant',()=>{
  expect(view(johan,spell('planned')).html).toBe('');
 });
 it('visar ingen magipanel när det inte finns en aktiv kombatant',()=>{
  expect(view(null,null).html).toBe('');
 });
});
