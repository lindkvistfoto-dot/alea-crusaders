import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("application architecture smoke checks", () => {
  test("index is a slim shell", () => {
    const html = read("index.html");
    expect(html.length).toBeLessThan(150_000);
    expect(html).not.toMatch(/<style[\\s>]/i);
    expect(html).toContain("./features/combat/admin-scenes.js");
    expect(html).toContain("./features/combat/runtime.js");
    expect(html).toContain("./legacy/app.js");
    expect(html).toContain("./src/main.js");
  });

  test("classic application scripts are syntactically valid", () => {
    const files = [
      "features/combat/admin-scenes.js",
      "features/combat/runtime.js",
      "legacy/app.js",
    ];
    for (const file of files) {
      expect(() => new Function(read(file)), file).not.toThrow();
    }
  });

  test("elf races use the two-hour ERF rest rule", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("function characterErfRestHours");
    expect(legacy).toContain("rr?.category==='Älvfolk'?2:6");
    expect(legacy).toContain("ERF-vila per rollperson");
    expect(legacy).toContain("Alla raser i kategorin <b>Älvfolk</b> behöver bara <b>2 timmar</b>");
  });

  test("race registry is wired into character editing", () => {
    const html = read("index.html");
    const legacy = read("legacy/app.js");
    expect(html).toContain("data-admin-section=\"races\"");
    expect(html).toContain("adminCountRaces");
    expect(legacy).toContain("function loadRuleRaces");
    expect(legacy).toContain("rule_races?select=*&order=sort_order.asc,name.asc");
    expect(legacy).toContain("raceOptions(i.ras)");
    expect(legacy).toContain("function renderAdminRaces");
  });

  test("profession registry is wired into character editing", () => {
    const html = read("index.html");
    const legacy = read("legacy/app.js");
    expect(html).toContain("data-admin-section=\"professions\"");
    expect(html).toContain("adminCountProfessions");
    expect(legacy).toContain("function loadRuleProfessions");
    expect(legacy).toContain("rule_professions?select=*&order=sort_order.asc,name.asc");
    expect(legacy).toContain("professionOptions(i.yrke)");
    expect(legacy).toContain("function renderAdminProfessions");
  });

  test("combat code is owned by combat packages", () => {
    const legacy = read("legacy/app.js");
    const admin = read("features/combat/admin-scenes.js");
    const runtime = read("features/combat/runtime.js");
    expect(legacy).not.toContain("function eventCombatHexGeometry");
    expect(legacy).not.toContain("function renderCombatMap");
    expect(admin).toContain("function eventCombatHexGeometry");
    expect(runtime).toContain("function renderCombatMap");
  });
});
