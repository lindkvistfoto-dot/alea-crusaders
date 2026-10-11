import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('features/equipment/magic-configurator.js');
const char=read('features/character/magic-items.js');
const wizard=read('features/character/magic-create.js');
const admin=read('features/equipment/magic-properties.js');
const html=read('index.html');
const migration=read('supabase/migrations/20261011031000_magic_configurator_rules.sql');
function harness(){
 const scope={window:{}};
 runInNewContext(source,scope);
 return scope.window.aleaMagicConfigurator
}
const sword={
 kind:'spell',property_key:'cast_spell',spell_key:'frammana-skicka-bort-elementar-eld',
 effect_grade:1,effect_multiplier:4,cast_mode:'fixed',fixed_fv:5,
 recharge_rule:'next_day',charge_cost:0,uses_per_day:null,max_charges:null
};
describe('Generell konfigurator för magiska föremål',()=>{
 it('behåller EG 1 åtskilt från multiplikator 4 och fast FV 5',()=>{
  const c=harness(),v=c.preview(sword);
  expect(v.effect_grade).toBe(1);
  expect(v.effect_multiplier).toBe(4);
  expect(v.result_units).toBe(4);
  expect(v.fixed_fv).toBe(5);
  expect(v.recharge_rule).toBe('next_day');
 });
 it('registrering spärrar samma dag och återhämtar efter ny kampanjdag',()=>{
  const c=harness();
  expect(c.state(sword,10).ready).toBe(true);
  const used=c.markUsed(sword,10);
  expect(used.last_used_day).toBe(10);
  expect(c.state(used,10).ready).toBe(false);
  expect(c.state(used,10).reason).toContain('nästa kampanjdag');
  expect(c.state(used,11).ready).toBe(true);
  expect(c.state(used,null).ready).toBe(false);
  const usedAgain=c.markUsed(used,11);
  expect(usedAgain.last_used_day).toBe(11);
  expect(usedAgain.effect_multiplier).toBe(4);
 });
 it('hanterar laddningar, dagsgränser och manuell återställning',()=>{
  const c=harness(),limited={...sword,recharge_rule:'none',max_charges:2,charge_cost:1,uses_per_day:2};
  const one=c.markUsed(limited,4),two=c.markUsed(one,4);
  expect(two.charges_remaining).toBe(0);
  expect(c.state(two,4).ready).toBe(false);
  expect(c.state(two,5).ready).toBe(false);
  const manual={...sword,recharge_rule:'manual'};
  const used=c.markUsed(manual,7);
  expect(c.state(used,8).ready).toBe(false);
  expect(c.state(c.reset(used),8).ready).toBe(true);
 });
 it('dagbyte återställer laddningar enbart för next_day',()=>{
  const c=harness(),power={...sword,max_charges:2,charge_cost:2};
  const after=c.markUsed(power,3);
  expect(after.charges_remaining).toBe(0);
  expect(c.state(after,3).ready).toBe(false);
  expect(c.state(after,4).charges).toBe(2);
 });
 it('avvisar ogiltig FV, EG och multiplikator även utan formulär',()=>{
  const c=harness();
  expect(()=>c.normalize({...sword,effect_multiplier:0})).toThrow();
  expect(()=>c.normalize({...sword,effect_grade:51})).toThrow();
  expect(()=>c.normalize({...sword,fixed_fv:-5})).toThrow();
  expect(()=>c.normalize({...sword,recharge_rule:'unknown'})).toThrow();
 });
 it('samma inställningar finns på både adminmallar och personliga exemplar',()=>{
  for(const key of ['effect_multiplier','fixed_fv','cast_mode','recharge_rule']){
   expect(migration).toContain(key);
   expect(char).toContain(key);
   expect(admin).toContain(key);
  }
  expect(html).toContain('features/equipment/magic-configurator.js?v=');
  expect(html).toContain('features/character/magic-create.js?v=');
  expect(html).toContain('id="magicCreateBtn"');
  expect(wizard).toContain('copyRuleWeaponToInstance');
  expect(wizard).toContain('applyCharacterShieldMaster');
  expect(wizard).toContain('magicPowers:[]');
 });
});
