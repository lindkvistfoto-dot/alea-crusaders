import {describe,test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function extract(start,end){
 const a=rt.indexOf(start),b=rt.indexOf(end,a+start.length);
 if(a<0||b<a)throw Error('Missing combat quick-editor code: '+start);
 return rt.slice(a,b)
}
const npc={id:'npc-1',source_id:'base-1',source_type:'npc',updated_at:'2026-10-08T10:00:00Z',
 name_snapshot:'Orc',status:'active',current_kp:5,max_kp:10,current_psy:3,max_psy:4,movement_max:12,movement_remaining:9,
 state:{attributes:{STY:13,FYS:11,STO:10,SMI:12,INT:9,PSY:8,KAR:6},sty:13,sto:10,smi:12,
  attack_profile:{weapons:[{equipId:'sword-1',name:'Svärd',fv:12,damage:'1T6',category:'melee'}],
   armor:[{name:'Läder'}],damage_bonus:null}}};
const hostile={...npc,source_type:'monster',id:'monster-1'};
function section(context={}){
 const scope={activeCombat:{id:'combat-1'},combatants:[npc,hostile],combatCanManage:()=>true,combatNumber:(n,f)=>Number.isFinite(Number(n))?Number(n):f,
  combatEffectiveAttribute:(c,k)=>c.state.attributes[k],combatBaseAttribute:(c,k)=>c.state.attributes[k],
  combatAttackProfile:c=>c.state.attack_profile,combatParseDamageFormula:s=>/^\d+T\d+$/.test(s)?{dice:s}:null,
  escAttr:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),
  crypto:{randomUUID:()=> 'added-weapon'},...context};
 runInNewContext(extract('function combatNpcEditAllowed(', 'function combatantDetailsPopupHtml(')+
  '\nthis.quick={allowed:combatNpcEditAllowed,html:combatNpcQuickEditorHtml,parse:combatNpcEditParse,weapon:combatNpcEditWeaponRow,save:combatSaveNpcQuickEdit};',scope);
 return scope.quick
}
function form(overrides={},weapons=[{original:'0',name:'Svärd',fv:'16',damage:'2T6',category:'melee',range:''}]){
 const fields={name:'Snabb-orc',current_kp:'7',max_kp:'14',current_psy:'2',max_psy:'5',
  movement_max:'13',movement_remaining:'9',
  ...Object.fromEntries(Object.entries(npc.state.attributes).map(([k,v])=>['attr_'+k,String(v)])),...overrides};
 const rows=weapons.map(w=>({dataset:{original:w.original},
  querySelector:selector=>({value:w[/data-w="([^"]+)"/.exec(selector)?.[1]]??''})}));
 return {elements:{namedItem:name=>fields[name]===undefined?null:{value:fields[name]}},
  querySelectorAll:sel=>sel==='.combat-npc-edit-weapon'?rows:[],
  querySelector:()=>({disabled:false})};
}
describe('SL snabbeditor i stridspopup',()=>{
 test('bara SL får redigera SLP och monster; aldrig rollpersoner',()=>{
  const ok=section();
  expect(ok.allowed(npc)).toBe(true);
  expect(ok.allowed(hostile)).toBe(true);
  expect(ok.allowed({...npc,source_type:'character'})).toBe(false);
  expect(section({combatCanManage:()=>false}).allowed(npc)).toBe(false);
 });
 test('popupen visar KP, PSY, grundegenskaper, vapen och FV',()=>{
  const html=section().html(npc);
  expect(html).toContain('SL · Snabbredigering');
  expect(html).toContain('name="current_kp"');
  expect(html).toContain('name="current_psy"');
  expect(html).toContain('name="attr_STY"');
  expect(html).toContain('name="attr_KAR"');
  expect(html).toContain('data-w="fv"');
  expect(html).toContain('Spara i striden')
 });
 test('ändrar stridsvärden, bevarar övrig state och originalvapenmetadata',()=>{
  const original=structuredClone(npc);
  const result=section().parse(form(),npc);
  expect(result.name_snapshot).toBe('Snabb-orc');
  expect(result.current_kp).toBe(7);
  expect(result.max_kp).toBe(14);
  expect(result.current_psy).toBe(2);
  expect(result.state.attack_profile.weapons[0]).toMatchObject({equipId:'sword-1',fv:16,damage:'2T6'});
  expect(result.state.attack_profile.armor[0].name).toBe('Läder');
  expect(npc).toEqual(original);
 });
 test('lägger till och tar bort vapen utan att röra original-SLP:n',()=>{
  const rows=[{original:'-1',name:'Klubba',fv:'11',damage:'1T6',category:'melee',range:''}];
  const result=section().parse(form({},rows),npc);
  expect(result.state.attack_profile.weapons).toHaveLength(1);
  expect(result.state.attack_profile.weapons[0]).toMatchObject({name:'Klubba',equipId:'added-weapon',fv:11});
  expect(npc.state.attack_profile.weapons[0].name).toBe('Svärd')
 });
 test('stoppar ogiltig KP, FV och skadeformel innan databasen uppdateras',()=>{
  const edit=section();
  expect(()=>edit.parse(form({current_kp:'20'}),npc)).toThrow(/current_kp/);
  expect(()=>edit.parse(form({},[{original:'0',name:'Svärd',fv:'120',damage:'1T6',category:'melee',range:''}]),npc)).toThrow(/FV/);
  expect(()=>edit.parse(form({},[{original:'0',name:'Svärd',fv:'12',damage:'ogiltig',category:'melee',range:''}]),npc)).toThrow(/skadeformel/)
 });
 test('noll KP markerar död och återställd KP återupplivar en död kombatant',()=>{
  const edit=section();
  expect(edit.parse(form({current_kp:'0'}),npc).status).toBe('dead');
  expect(edit.parse(form(),{...npc,status:'dead'}).status).toBe('active')
 });
 test('beslutade ändringar sparas med combat_id och optimistisk låsning',async()=>{
  const patches=[],f=form();
  f.querySelector=()=>({disabled:false});
  const feedback={textContent:''};
  let reloaded=0;
  const edit=section({$:(key)=>key==='combatNpcQuickForm'?f:key==='combatNpcEditStatus'?feedback:null,
   dbJson:async(url,options)=>{patches.push({url,options});return[{id:'npc-1'}]},
   loadActiveCombat:async()=>{reloaded++}});
  await edit.save({preventDefault(){},stopPropagation(){}},'npc-1');
  expect(patches).toHaveLength(1);
  expect(patches[0].url).toContain('combat_id=eq.combat-1');
  expect(patches[0].url).toContain('updated_at=eq.');
  expect(JSON.parse(patches[0].options.body).current_kp).toBe(7);
  expect(reloaded).toBe(1)
 });
 test('redigering av registervärden kringgår inte stridens attackprofil',()=>{
  const src=extract('function combatAttackProfile(combatant){','function combatWeaponCategory(weapon){');
  const c=structuredClone(npc),external={id:'base-1',data:{weapons:[{name:'Oredigerat',fv:3}]}};
  const scope={combatNumber:(n,f)=>Number(n)||f,combatEffectiveAttribute:(c,k)=>c.state.attributes[k],
   campaignNpcs:[external]};
  runInNewContext(src+'\nthis.getAttack=combatAttackProfile',scope);
  expect(scope.getAttack(c).weapons[0].name).toBe('Svärd');
 })
});
