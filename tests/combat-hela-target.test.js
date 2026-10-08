import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function excerpt(start,end){
 const begin=source.indexOf(start),finish=source.indexOf(end,begin+start.length);
 if(begin<0||finish<begin)throw Error('HELA-funktion saknas: '+start);
 return source.slice(begin,finish)
}
function script(start,end,ctx,exports){
 const scope={...ctx};
 runInNewContext(excerpt(start,end)+'\n'+Object.entries(exports).map(([alias,name])=>'this.'+alias+'='+name+';').join('\n'),scope);
 return scope
}
const caster={id:'caster',q:0,r:0,status:'active',name_snapshot:'Nox',current_kp:10,max_kp:10};
const ally={id:'ally',q:1,r:0,status:'active',name_snapshot:'Astrid',current_kp:3,max_kp:10};
const far={id:'far',q:3,r:0,status:'active',name_snapshot:'Utanför'};
const dead={id:'dead',q:0,r:1,status:'dead',name_snapshot:'Död'};
const fighter=[caster,ally,far,dead];
const action={id:'a1',status:'planned',source_data:{action_key:'spell_cast',spell_name:'HELA',spell_fv:15,effect_grade:1,
 magic_binding:{kind:'heal'},range_text:'Beröring',casting_spell:true,spell_prepared:true}};
const dist=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));

function binding(){
 return script('function combatMagicBinding(spell){','function combatMagicDamageFormula',{}, {binding:'combatMagicBinding'}).binding
}
function targets(){
 return script('function combatSpellEffectTargets(actor,action){','async function combatCastManualSpell',{
  combatants:fighter,combatCanManage:()=>true,combatAxialDistance:dist,combatSpellRangeHexes:()=>1,combatHasLineOfSight:()=>true
 },{targets:'combatSpellEffectTargets'}).targets
}

describe('HELA får måltavla i striden',()=>{
 it('är en riktad läkning, medan andra besvärjelser förblir oförändrade',()=>{
  expect(binding()({name:'HELA'}).kind).toBe('heal');
  expect(binding()({name:'DIMMA'}).kind).toBe('area')
 });
 it('kan riktas mot sig själv och intilliggande mål, men inte avlägsna eller döda',()=>{
  expect(targets()(caster,action).map(c=>c.id)).toEqual(['caster','ally'])
 });
 it('visar kombatanternas namn och KP som målalternativ',()=>{
  const view=script('function combatMagicTargetChooserHtml(actor,action){','async function combatSetMagicResistance',{
   combatSpellEffectTargets:targets(),combatSelectedTargetId:null,escAttr:String,
  },{chooser:'combatMagicTargetChooserHtml'}).chooser(caster,action);
  expect(view).toContain('HELA · välj mål');
  expect(view).toContain('Nox · KP 10/10');
  expect(view).toContain('Astrid · KP 3/10');
  expect(view).not.toContain('Utanför')
 });
 it('tillåter målklick på magikern själv',()=>{
  const ctx=script('function selectCombatTarget(id){','function combatTokenInitials',{
   combatActionMenuId:null,combatSelectedTargetId:null,combatActiveActor:()=>caster,combatChosenAction:()=>action,
   combatActionDefinition:()=>({type:'spell_cast'}),combatCurrentAttackTargets:()=>new Map([['caster',{}],['ally',{}]]),
   renderCombat:()=>{},
  },{select:'selectCombatTarget'});
  ctx.select('caster');expect(ctx.combatSelectedTargetId).toBe('caster')
 });
 it('vägrar HELA utan mål och sparar mål i både handling och logg',async()=>{
  const writes=[];let rolls=0;
  const ctx=script('async function combatCastManualSpell(actor,action,target=null){','async function combatCastStatusSpell',{
   combatCannotAct:()=>false,combatSpellEffectTargets:targets(),
   combatExpertRoll:async()=>{rolls++;return {outcome:'success',success:true,roll:8,fv:15}},
   combatMagicPsyCost:()=>1,combatSpendMagicPsy:async()=>{},combatAwardSpellErf:async()=>null,
   combatResolveBeskyddarePassage:async()=>({blocked:false,checks:[]}),combatShowOutcomeOverlay:()=>{},
   activeCombat:{round_number:2,id:'battle1'},centralCampaignId:'camp1',
   dbJson:async(url,opts)=>{writes.push({url,body:JSON.parse(opts.body)});return []},
   combatOutcomeLabel:()=> 'LYCKAT',loadActiveCombat:async()=>{},
  },{cast:'combatCastManualSpell'});
  await expect(ctx.cast(caster,action,null)).rejects.toThrow(/giltigt mål/);
  expect(rolls).toBe(0);
  await ctx.cast(caster,action,ally);
  expect(rolls).toBe(1);
  const saved=writes.find(w=>w.url.includes('combat_actions'));
  const log=writes.find(w=>w.url==='combat_log');
  expect(saved.body.target_combatant_id).toBe('ally');
  expect(saved.body.result.healing_target_id).toBe('ally');
  expect(saved.body.result.healing_applied).toBe(false);
  expect(log.body.target_id).toBe('ally');
  expect(log.body.message).toContain('HELA på Astrid');
 })
});
