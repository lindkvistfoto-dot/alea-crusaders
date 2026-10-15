import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

describe("Animism ÖKA/MINSKA Expert restore",()=>{
 test("the registry seed has the verified Expert rules",()=>{
  const sql=read("supabase/migrations/20261015213500_restore_oka_minska_animism.sql");
  expect(sql).toContain("'minska','MINSKA','animism',6,'Beröring','S/4 minuter'");
  expect(sql).toContain("'oka','ÖKA','animism',6,'Beröring','S/4 minuter'");
  expect(sql).toContain("sänkas under 1");
  expect(sql).toContain("'spell_oka'");
  expect(sql).toContain("'spell_minska'");
 });
 test("casting requires an allowed attribute and persists the exact 1-per-EG effect",()=>{
  const s=read("features/combat/runtime.js");
  expect(s).toContain("attribute_spell:true");
  expect(s).toContain("function combatChooseSpellAttribute(actorId,attribute)");
  expect(s).toContain("['STY','FYS','STO','SMI','KAR']");
  expect(s).toContain("parameters:attributeSpell?{attribute,points_per_eg:1}:{}");
  expect(s).toContain("eg*15000");
 });
 test("MINSKA never reduces a basic attribute below one",()=>{
  const s=read("features/combat/runtime.js");
  const src=s.slice(s.indexOf("function combatEffectAttributeDelta("),s.indexOf("function combatBaseAttribute("));
  const create=new Function("combatActiveEffects","combatEffectIsActive","combatEffectDefinition","combatBaseAttribute","COMBAT_EFFECT_ATTRIBUTES",src+"\nreturn combatEffectAttributeDelta;");
  const e=[{combatant_id:"c",effect_id:"e",strength:8,parameters:{attribute:"STY",points_per_eg:1}}];
  const delta=create(e,()=>true,()=>({active:true,modifiers:{type:"attribute_delta",direction:-1}}),()=>4,["STY","FYS","STO","SMI","INT","PSY","KAR"]);
  expect(delta({id:"c"},"STY")).toBe(-3);
  expect(delta({id:"c"},"FYS")).toBe(0);
 });
});
