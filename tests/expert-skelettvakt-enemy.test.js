import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261008_seed_skelettvakt_enemy.sql',import.meta.url),'utf8');
describe('Skelettvakt – fiendemall Expert',()=>{
 it('tillhör Skelettbyn och skapar en återanvändbar fiende',()=>{
  expect(sql).toContain("name='Skelettbyns Hemlighet'");
  expect(sql).toContain("'skelettvakt','Skelettvakt','enemy','Odöd',1");
  expect(sql).toContain("'Förfallen vakt','Skelett'");
  expect(sql).toContain('where not exists');
  expect(sql).toContain("existing.monster_key='skelettvakt'");
 });
 it('slumpar mänskliga grundegenskaper och härleder reglernas skelettvärden',()=>{
  expect(sql).toContain('from generate_series(1,3)');
  expect(sql).toContain('from generate_series(1,2)');
  expect(sql).toContain("'FYS',0");
  expect(sql).toContain("'STO',s.sto");
  expect(sql).toContain("'KAR',1");
  expect(sql).toContain('sty+floor(random()*(sty+1))');
  expect(sql).toContain('1+floor(random()*smi)');
  expect(sql).toContain('floor(intel/4.0)');
  expect(sql).toContain('1+floor(random()*psy)');
  expect(sql).toContain('skeleton as materialized');
  expect(sql).toContain('ursprunglig människa slumpades');
 });
 it('har Enhandssvärd FV 8 och ett masterbundet kortsvärd FV 8',()=>{
  expect(sql).toContain("where name='Kortsvärd' and skill_id='enhandssvard'");
  expect(sql).toContain("'skill_id','enhandssvard','name','Enhandssvärd','fv',8");
  expect(sql).toContain("'weapon_id',w.id");
  expect(sql).toContain("'weaponTypeId',w.id");
  expect(sql).toContain("'name',w.name,'fv',8");
  expect(sql).toContain("'damage',w.damage");
  expect(sql).toContain("'weaponCategory',w.category");
 });
 it('är hemlig för spelarna och sparar särskilda regler för SL',()=>{
  expect(sql).toContain('false,true,');
  expect(sql).toContain("'skill_id','smyga','name','Smyga','fv',95");
  expect(sql).toContain('Pilar, stick- och stötvapen ingen skada');
  expect(sql).toContain('huggvapen halv');
  expect(sql).toContain('krossvapen normal skada');
  expect(sql).toContain('stridsmotorn');
 });
});
