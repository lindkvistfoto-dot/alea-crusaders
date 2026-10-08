import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261008_expert_skelett_race.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');

describe('Skelett · Expert rasregistret',()=>{
 it('registrerar Skelett i oklassificerad kategori',()=>{
  expect(sql).toContain("'skelett','Skelett','Oklassificerad'");
  expect(sql).toContain("on conflict(id) do update");
 });
 it('sparar alla sju grundegenskapernas härledda regler utan att hitta på tärningsslag',()=>{
  const expected={
   STY:'Upp till ×2',FYS:'Alltid 0',STO:'×1',SMI:'Upp till ×1',
   INT:'Upp till ×¼',PSY:'1+',KAR:'Alltid 1'
  };
  for(const [key,rule] of Object.entries(expected))
   expect(sql).toContain("('"+key+"','"+rule);
  expect(sql).toContain('source_rule');
  expect(sql).toContain('null,typical_value,sort_order');
  expect(sql).toContain("('FYS','Alltid 0',0,20)");
  expect(sql).toContain("('KAR','Alltid 1',1,70)");
 });
 it('har rätt naturliga attacker, förflyttning och färdigheter',()=>{
  expect(sql).toContain('2 nävar, GC 35 %, skada 1T3');
  expect(sql).toContain('1 spark, GC 35 %, skada 1T6');
  expect(sql).toContain('Naturligt skydd: 0');
  expect(sql).toContain('4 lägre');
  expect(sql).toContain('Smyga 95 %, SVF 35 %');
  expect(sql).toContain('Antal: 3T10');
 });
 it('beskriver immuniteter och halverad skada utan att felaktigt ändra alla monster',()=>{
  expect(sql).toContain('pilar, stickvapen och stötvapen skadar inte skelett');
  expect(sql).toContain('Huggvapen ger halv skada');
  expect(sql).toContain('Krossvapen ger normal skada');
  expect(sql).not.toContain('alter table public.campaign_monsters');
 });
 it('admin visar och sparar de särskilda härledda reglerna',()=>{
  expect(app).toContain('rrSourceRule_');
  expect(app).toContain('source_rule:a.source_rule');
  expect(app).toContain('härledda regler');
  expect(app).toContain('ange ursprungsvärden manuellt');
  expect(css).toContain('.race-attribute-row input[id^="rrSourceRule_"]')
 });
 it('gränsvärden utan fullständig uppsättning tärningsslag hindrar slumpad skelettgenerering',()=>{
  const start=app.indexOf('function raceRulesCompleteForMode(');
  expect(start).toBeGreaterThan(0);
  const source=app.slice(start,start+850);
  expect(source).toContain('roll_formula');
  expect(sql).toContain('roll_formula,typical_value');
 })
});