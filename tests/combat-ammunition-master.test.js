import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const registry=read('supabase/migrations/20261009120000_combat_ammunition_registry.sql');
const recovery=read('supabase/migrations/20261009120100_combat_ammunition_recovery.sql');
const runtime=read('features/combat/runtime.js');
const app=read('legacy/app.js');
const index=read('index.html');
const shop=read('features/shop/store.js');
describe('Ammo registry / range weapon linkage',()=>{
 it('types and exactly matching Master tags link arrows, bolts, stones, darts and thrown weapons',()=>{
  for(const kind of ['arrow','bolt','stone','dart','throwing_axe','javelin','throwing_knife','throwing_star','bola'])
   expect(registry).toContain("('"+kind+"'");
  for(const tag of ["'bow'=any(tags)","'crossbow'=any(tags)","'sling'=any(tags)","'staff_sling'=any(tags)","'blowgun'=any(tags)"])
   expect(registry).toContain(tag);
  for(const w of ['Kastyxa','Kastspjut','Kastkniv','Kaststjärna'])
   expect(registry).toContain("name='"+w+"'");
  expect(registry).toContain('alter table public.rule_weapons add column if not exists projectile_key');
  expect(registry).toContain("when lower(coalesce(p->>'name','')) ~ 'skäkt|armborst'");
 });
 it('one shot is atomically taken only after validating original weapon, stock and SL rights',()=>{
  expect(registry).toContain("create or replace function public.combat_spend_ammunition");
  expect(registry).toContain("from public.combat_actions where id=p_action_id for update");
  expect(registry).toContain("private.is_campaign_gm(a.campaign_id)");
  expect(registry).toContain("v_rule_key<>p_projectile_key");
  expect(registry).toContain("v_count<=0 then raise exception 'Slut på ammunition!'");
  expect(registry).toContain("set status='resolving'");
  expect(registry).toContain('action_id uuid primary key references public.combat_actions');
  expect(registry).toContain('create or replace function public.combat_refund_ammunition');
  expect(runtime).toContain("rpc/combat_spend_ammunition");
  expect(runtime).toContain("rpc/combat_refund_ammunition");
  expect(runtime).toContain("info.mode==='ranged'?combatWeaponProjectileKey(weapon):''");
  expect(runtime).toContain("await combatResolveAttackAction(actor,target,action,weapon,info.mode)");
  const consume=runtime.indexOf("rpc/combat_spend_ammunition");
  const roll=runtime.indexOf("await combatResolveAttackAction(actor,target,action,weapon,info.mode)",consume);
  expect(roll).toBeGreaterThan(consume);
 });
 it('GM can choose if projectile recovery is possible, with 80-90 % chance, once per shot',()=>{
  expect(recovery).toContain('create or replace function public.combat_finish_and_recover');
  expect(recovery).toContain('p_percent<80 or p_percent>90');
  expect(recovery).toContain("coalesce(p_allow_recovery,false) and v_roll<=p_percent");
  expect(recovery).toContain("select * from public.combat_ammunition_spends where combat_id=p_combat_id");
  expect(recovery).toContain("update public.combat_ammunition_spends set recovered=v_ok,recovery_attempted=true");
  expect(recovery).toContain("set status='completed'");
  expect(runtime).toContain('id="combatAmmoRecoverAllowed"');
  expect(runtime).toContain('id="combatAmmoRecoverChance"');
  expect(runtime).toContain('Avsluta strid & sammanfatta');
  expect(runtime).toContain("rpc/combat_finish_and_recover");
  expect(runtime).toContain("combatAmmoSummaryHtml()+'</section>'");
 });
 it('old characters are recognized and new equipment uses master selection',()=>{
  expect(app).toContain("loadRuleProjectileTypes()");
  expect(app).toContain('projectileKeyFromName(name)');
  expect(app).toContain("'skäkt'");
  expect(app).toContain('projectileMasterOptions(x)');
  expect(app).toContain('setProjectileMaster(');
  expect(app).toContain('projectile_key:');
  expect(index).toContain('data-admin-section="projectiles"');
  expect(index).toContain('id="adminProjectileTable"');
  expect(index).toContain('id="adminCountProjectiles"');
  expect(shop).toContain('projectileKey:projectileKey||null');
  expect(shop).toContain("if(rule?.category==='thrown'&&rule.projectile_key)");
 });
});
