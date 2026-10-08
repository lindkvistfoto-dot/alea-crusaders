import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const sql=readFileSync(new URL('../supabase/migrations/20261008_seed_eldsalamander_summon_npc.sql',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');

const attrs={STY:0,FYS:0,STO:8,SMI:11,INT:0,PSY:12,KAR:0,KP:11,FORFLYTTNING:10};
function sourceStats(attributes,overrides={}){
 const start=runtime.indexOf('function combatSourceStats('),end=runtime.indexOf('async function combatLoadSceneRuntimeData(',start);
 if(start<0||end<0)throw Error('Missing combatSourceStats');
 const env={ruleSpells:[],combatStateValue:(state,...keys)=>keys.map(k=>state?.[k]).find(v=>v!=null&&v!=='')??null,
  combatNumber:(v,fallback=null)=>v==null||v===''?fallback:Number.isFinite(Number(v))?Number(v):fallback};
 runInNewContext(runtime.slice(start,end)+'\nthis.make=combatSourceStats;',env);
 const npc={attributes,weapons:[{name:'Eldberöring',damage:'1T6',fv:11}]};
 return env.make({source_type:'npc',source_id:'summon-id',state:overrides},{
  npcs:new Map([['summon-id',npc]]),monsters:new Map(),characters:new Map()
 })
}
describe('Eldsalamander as summoned NPC template',()=>{
 it('is campaign-bound, private and idempotent',()=>{
  expect(sql).toContain("name='Skelettbyns Hemlighet'");
  expect(sql).toContain("'eldsalamander_frammanad','Eldsalamander'");
  expect(sql).toContain('false,true,260');
  expect(sql).toContain('not exists');
  expect(sql).toContain('FRAMMANA/SKICKA BORT ELEMENTAR');
 });
 it('uses an explicitly documented example, not unverified Expert canon',()=>{
  expect(sql).toContain("'KP',11,'FORFLYTTNING',10");
  expect(sql).toContain("'STY',0,'FYS',0,'STO',8,'SMI',11,'INT',0,'PSY',12,'KAR',0");
  expect(sql).toContain('PROVISORISKT STRIDSVÄRDE');
  expect(sql).toContain('Det yttersta mörkret');
  expect(sql).toContain("'name','Eldberöring','fv',11,'damage','1T6'");
 });
 it('calculates summoned elemental KP from explicit override, not FYS 0+STO 8',()=>{
  const stats=sourceStats(attrs);
  expect(stats.max_kp).toBe(11);
  expect(stats.current_kp).toBe(11);
  expect(stats.movement_max).toBe(10);
  expect(stats.attack_profile.weapons[0].name).toBe('Eldberöring');
 });
 it('manual combat overrides remain authoritative',()=>{
  const stats=sourceStats(attrs,{max_kp:17,movement_max:12,current_kp:7});
  expect(stats.max_kp).toBe(17);
  expect(stats.current_kp).toBe(7);
  expect(stats.movement_max).toBe(12)
 });
 it('standard NPCs without KP overrides still derive KP normally',()=>{
  const stats=sourceStats({STY:10,FYS:11,STO:13,SMI:10,INT:9,PSY:12,KAR:10});
  expect(stats.max_kp).toBe(12);
  expect(stats.movement_max).toBe(10)
 });
 it('SLP editor preserves custom stats and lets SL change them',()=>{
  expect(legacy).toContain("out={...src}");
  expect(legacy).toContain("npcKpOverride");
  expect(legacy).toContain("npcMovementOverride");
  expect(legacy).toContain("out.FORFLYTTNING=move");
  expect(legacy).toContain("out.KP=kp");
  expect(legacy).toContain("if(special!=null&&special>0)return special")
 });
});
