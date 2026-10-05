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

  test("SLP identity includes race gender and profession", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain('id="cnRace"');
    expect(legacy).toContain('raceOptions(x?.race||\'\')');
    expect(legacy).toContain('id="cnGender"');
    expect(legacy).toContain('id="cnProfession"');
    expect(legacy).toContain('professionOptions(x?.profession||\'\')');
    expect(legacy).toContain("race:$('cnRace')?.value||''");
    expect(legacy).toContain("gender:$('cnGender')?.value.trim()||''");
    expect(legacy).toContain("profession:$('cnProfession')?.value||''");
  });

  test("race admin edits roll formulas and typical values", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("rule_race_attributes?select=*");
    expect(legacy).toContain("function ruleRaceAttributeEditorHtml");
    expect(legacy).toContain("function collectRuleRaceAttributes");
    expect(legacy).toContain("rrRoll_");
    expect(legacy).toContain("rrTypical_");
  });

  test("SLP can generate attributes from selected race", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("Slumpa enligt ras");
    expect(legacy).toContain("applyNpcRaceAttributes");
    expect(legacy).toContain("rollRaceAttributeFormula");
    expect(legacy).toContain("npcRaceTypicalBtn");
    expect(legacy).toContain("updateNpcRaceRuleAvailability");
  });

  test("SLP mobile editor avoids fixed-width overflowing rows", () => {
    const css = read("src/styles/app.css");
    expect(css).toContain("#adminEditor.modalback{padding:8px}");
    expect(css).toContain(".slp-skill-row{grid-template-columns:minmax(0,1fr) 64px 36px}");
    expect(css).toContain(".slp-weapon-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px}");
  });

  test("administration overview shows the current app version", () => {
    const html = read("index.html");
    const legacy = read("legacy/app.js");
    expect(html).toContain('id="adminOverviewVersion"');
    expect(html).toMatch(/adminOverviewVersion[^>]*>Version v\d+\.\d+\.\d+/);
    expect(legacy).toContain("adminOverviewVersion");
  });

  test("mobile home shows the current app version below Administration", () => {
    const html = read("index.html");
    const legacy = read("legacy/app.js");
    expect(html).toContain('id="mobileHomeVersion"');
    expect(html).toMatch(/Version v\d+\.\d+\.\d+/);
    expect(legacy).toContain("let label='Version '+src.textContent");
  });

  test("SLP admin supports full mini-character editing", () => {
    const html = read("index.html");
    const legacy = read("legacy/app.js");
    expect(html).toContain("<b>SLP</b>");
    expect(html).toContain("+ Ny SLP");
    expect(legacy).toContain("function adminNpcEditorHtml");
    expect(legacy).toContain("function addAdminNpcSkill");
    expect(legacy).toContain("function addAdminNpcWeapon");
    expect(legacy).toContain("function persistAdminNpcPortrait");
    expect(legacy).toContain("attributes:collectAdminNpcAttributes()");
    expect(legacy).toContain("skills:sanitizeNpcSkills");
    expect(legacy).toContain("weapons:sanitizeNpcWeapons");
    expect(legacy).toContain("shield:collectAdminNpcShield()");
    expect(legacy).toContain("armor:collectAdminNpcArmor()");
  });

  test("combat icons are sourced from actors and rendered as hex tokens", () => {
    const legacy = read("legacy/app.js");
    const combat = read("features/combat/admin-scenes.js");
    expect(legacy).toContain("combat-icons");
    expect(legacy).toContain("function handleCharacterCombatIconFile");
    expect(legacy).toContain("function adminCombatIconPickerHtml");
    expect(legacy).toContain("combat_icon_path");
    expect(combat).toContain("function sceneCombatantIconPath");
    expect(combat).toContain("function loadEventCombatCombatantIcons");
    expect(combat).toContain("ec-token-border");
    expect(combat).toContain("eventCombatHexPolygon(0,0,tokenSize)");
  });

  test("combat scene editor uses compact map controls and reserve strip", () => {
    const combat = read("features/combat/admin-scenes.js");
    expect(combat).toContain("event-combat-compact-toolbar");
    expect(combat).toContain("event-combat-terrain-row");
    expect(combat).toContain("scene-combatant-strip");
    expect(combat).toContain("Reserv");
    expect(combat).toContain("function eventCombatTokenDropHighlight");
    expect(combat).toContain("tokenDrag");
    expect(combat.indexOf('id="eventCombatCanvas"')).toBeLessThan(combat.indexOf('id="sceneCombatantsMount"'));
  });

  test("combat scene start positions support drag and click placement", () => {
    const combat = read("features/combat/admin-scenes.js");
    expect(combat).toContain("start_q");
    expect(combat).toContain("start_r");
    expect(combat).toContain("function sceneCombatantDragStart");
    expect(combat).toContain("function sceneCombatantMapDrop");
    expect(combat).toContain("function placeSceneCombatantAtHex");
    expect(combat).toContain("ec-combatant-token");
    expect(combat).toContain("Dra en ikon till en hex");
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
