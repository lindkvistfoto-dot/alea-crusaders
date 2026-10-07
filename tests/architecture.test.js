import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("application architecture smoke checks", () => {
  test("index is a slim shell", () => {
    const html = read("index.html");
    expect(html.length).toBeLessThan(150_000);
    expect(html).not.toMatch(/<style[\\s>]/i);
    expect(html).not.toContain("model-viewer");
    expect(html).toContain("./features/combat/admin-scenes.js");
    expect(html).toContain("./features/combat/runtime.js");
    expect(html).toContain("./legacy/app.js");
    expect(html).toContain("./src/main.js");
    expect(html).toContain("./features/character/glowup.css?v=0.33.42");
    expect(html).toContain("./features/character/glowup.js?v=0.33.42");
    expect(html).toContain("./features/map/glowup.css?v=0.33.42");
  });

  test("classic application scripts are syntactically valid", () => {
    const files = [
      "features/combat/admin-scenes.js",
      "features/combat/runtime.js",
      "features/shop/store.js",
      "features/character/glowup.js",
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

  test("race admin shows and saves roll formulas plus typical values", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("rule_race_attributes?select=*");
    expect(legacy).toContain("function ruleRaceAttributeEditorHtml");
    expect(legacy).toContain("Egenskap</span><span>Tärningsslag</span><span>Typvärde</span>");
    expect(legacy).toContain("function collectRuleRaceAttributes");
    expect(legacy).toContain("rrRoll_");
    expect(legacy).toContain("rrTypical_");
    expect(legacy).toContain("rule_race_attributes?race_id=eq.");
  });

  test("SLP can apply race typical values without partial updates", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("Använd typvärden");
    expect(legacy).toContain("npcRaceTypicalBtn");
    expect(legacy).toContain("mode==='random'?rollRaceAttributeFormula(r.roll_formula):Number(r.typical_value)");
    const guard = legacy.indexOf("if(!raceRulesCompleteForMode(info.rows,mode))");
    const write = legacy.indexOf("info.rows.forEach(r=>", guard);
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guard);
    expect(legacy).toContain("updateNpcKpPreview();");
    expect(legacy).toContain("ofullständiga rasregler – inga värden ändras");
  });

  test("SLP rolls supported race formulas through secureDie", () => {
    const legacy = read("legacy/app.js");
    const start = legacy.indexOf("function normalizeRaceRollFormula");
    const end = legacy.indexOf("function raceRulesCompleteForMode", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const parserSource = legacy.slice(start, end);
    const makeParser = new Function(
      "secureDie",
      parserSource + ";return {normalizeRaceRollFormula,rollRaceAttributeFormula};"
    );
    const parser = makeParser((sides) => sides);
    const expected = new Map([
      ["3T6", 18],
      ["4T6", 24],
      ["2T6+6", 18],
      ["2T6+5", 17],
      ["2T6+4", 16],
      ["2T6+3", 15],
      ["2T6+1", 13],
      ["1T4+2", 6],
      ["2T4+2", 10],
      ["2T3+4", 10],
      ["2T6-1", 11],
    ]);
    for (const [formula, total] of expected) {
      expect(parser.normalizeRaceRollFormula(formula)).toBe(formula);
      expect(parser.rollRaceAttributeFormula(formula)).toBe(total);
    }
    expect(parserSource).toContain("secureDie(sides)");
  });

  test("SLP mobile editor prevents horizontal overflow", () => {
    const css = read("src/styles/app.css");
    const zones = read("features/combat/hit-body-zones.js");
    const main = read("src/main.js");
    expect(css).toContain("#adminEditor.modalback{padding:8px}");
    expect(css).toContain("width:100%;max-width:1080px;min-width:0;box-sizing:border-box;overflow-x:hidden");
    expect(css).toContain(".slp-admin-form input,.slp-admin-form select,.slp-admin-form textarea{min-width:0;width:100%;max-width:100%;box-sizing:border-box}");
    expect(css).toContain(".slp-attribute-grid{grid-template-columns:repeat(2,minmax(0,1fr))}");
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
  test("additional race source data is versioned", () => {
    const sql = read("supabase/migrations/20261005_additional_race_attribute_rules.sql");
    expect(sql).toContain("('svartalf','STY','2T6+2',9)");
    expect(sql).toContain("('svartnisse','STO','1T2+1',3)");
    expect(sql).toContain("('skogsalv','SMI','3T6+3',14)");
    expect(sql).toContain("('graalv','KAR','3T6+2',13)");
    expect(sql).toContain("('karkion','INT','3T6+6',17)");
    expect(sql).toContain("('kentaur','STO','4T6+12',26)");
    expect(sql).toContain("('rese','STY','3T6+24',35)");
  });

  test("SLP admin list fits mobile viewport without horizontal scrolling", () => {
    const legacy = read("legacy/app.js");
    const css = read("src/styles/app.css");
    expect(legacy).toContain('class="ahead npc-col-title"');
    expect(legacy).toContain('class="npc-admin-mobile-title"');
    expect(css).toContain(".npcadmintable .npc-col-title{display:none}");
    expect(css).toContain("grid-template-columns:minmax(0,1fr) 64px 72px");
    expect(css).toContain("max-width:100%");
    expect(css).toContain("overflow:hidden");
  });

  test("combat scene map surface is the image picker", () => {
    const combat = read("features/combat/admin-scenes.js");
    expect(combat).toContain('class="event-combat-map-picker"');
    expect(combat).toContain(">Välj kartbild</b>");
    expect(combat).toContain(">Byt kartbild</button>");
    expect(combat).toContain("ecSceneMapFile");
    expect(combat).not.toContain("Eller välj befintlig karta");
  });

  test("combat scene mobile editor avoids horizontal scrolling", () => {
    const css = read("src/styles/app.css");
    expect(css).toContain(".admineditor.event-combat-editor{\n width:100%;");
    expect(css).toContain("overflow-x:hidden");
    expect(css).toContain(".event-combat-compact-toolbar,\n .event-combat-terrain-row{\n  flex-wrap:wrap;");
    expect(css).toContain(".scene-combatant-strip{\n  flex-wrap:wrap;\n  overflow-x:hidden;");
    expect(css).toContain(".scene-combatant-chip{\n  flex:1 1 120px;\n  min-width:0;");
  });

  test("SLP editor uses blue character-sheet styling and player view uses green", () => {
    const css = read("src/styles/app.css");
    expect(css).toContain("#view .tab.active,");
    expect(css).toContain("background:#1f5138");
    expect(css).toContain("#admin [data-admin-section=\"people\"].adminbox");
    expect(css).toContain(".admineditor.slp-editor{\n --slp-bg:#09131c;");
    expect(css).toContain("--slp-accent:#24678f");
  });

  test("SLP equipment uses dropdowns and FV defaults to ten", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("function npcKnownWeaponPresets");
    expect(legacy).toContain("— Välj vapen —");
    expect(legacy).toContain("function npcShieldOptions");
    expect(legacy).toContain("— Ingen sköld —");
    expect(legacy).toContain("adminNpcDraft.skills.push({skill_id:'',name:'',fv:10})");
    expect(legacy).toContain("adminNpcDraft.weapons.push({weapon_id:'',name:'',fv:10");
    expect(legacy).toContain("fv:fv==null?10:fv");
    expect(legacy).toContain("Nya FV börjar alltid på 10.");
  });


  test("enemy and monster admin use separate profile tables", () => {
    const html = read("index.html");
    const legacy = read("legacy/app.js");
    const css = read("src/styles/app.css");
    expect(html).toContain('id="adminEnemyTable"');
    expect(html).toContain('id="adminMonsterTable"');
    expect(html).toContain("editCampaignMonster('','enemy')");
    expect(html).toContain("editCampaignMonster('','monster')");
    expect(legacy).toContain("function renderAdminActorTable");
    expect(legacy).toContain("actor_kind:actorKind");
    expect(legacy).toContain("adminNpcEditorHtml(x,id,{actorKind})");
    expect(css).toContain(".admineditor.slp-editor.enemy-editor");
  });

  test("enemy and monster profiles reuse SLP combat data and portraits", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("campaignNpcs.concat(campaignMonsters)");
    expect(legacy).toContain("attributes:collectAdminNpcAttributes()");
    expect(legacy).toContain("skills:sanitizeNpcSkills");
    expect(legacy).toContain("weapons:sanitizeNpcWeapons");
    expect(legacy).toContain("shield:collectAdminNpcShield()");
    expect(legacy).toContain("armor:collectAdminNpcArmor()");
    expect(legacy).toContain("persistAdminNpcPortrait(savedId)");
    expect(legacy).toContain("storageKind=['npc','enemy','monster']");
  });

  test("combat picker respects stored enemy or monster kind", () => {
    const combat = read("features/combat/admin-scenes.js");
    expect(combat).toContain("m.actor_kind||'enemy'");
    expect(combat).toContain("data-kind=\"'+kind+'\"");
    expect(combat).toContain("let enemies=templateRows('enemy'),monsters=templateRows('monster')");
    expect(combat).toContain("let kind=cb.dataset.kind||m.actor_kind||'enemy'");
    expect(combat).not.toContain("data-combatant-kind");
  });

  test("enemy and monster profile migration is versioned", () => {
    const sql = read("supabase/migrations/20261005171018_enemy_monster_admin_profiles.sql");
    expect(sql).toContain("actor_kind text not null default 'enemy'");
    expect(sql).toContain("attributes jsonb");
    expect(sql).toContain("skills jsonb");
    expect(sql).toContain("weapons jsonb");
    expect(sql).toContain("shield jsonb");
    expect(sql).toContain("armor jsonb");
    expect(sql).toContain("campaign_actor_images_select");
    expect(sql).toContain("from public.campaign_monsters m");
  });

  test("weapon registry is manageable from administration", () => {
    const html = read("index.html");
    const legacy = read("legacy/app.js");
    const css = read("src/styles/app.css");
    expect(html).toContain("openAdminSection('weapons')");
    expect(html).toContain('id="adminCountWeapons"');
    expect(html).toContain('data-admin-section="weapons"');
    expect(html).toContain('id="adminWeaponTable"');
    expect(html).toContain("editRuleWeapon()");
    expect(legacy).toContain("function renderAdminWeapons");
    expect(legacy).toContain("function editRuleWeapon");
    expect(legacy).toContain("async function saveRuleWeapon");
    expect(legacy).toContain("async function deleteRuleWeapon");
    expect(legacy).toContain("rule_weapons?id=eq.");
    expect(legacy).toContain("await loadRuleWeapons(true)");
    expect(legacy).toContain("set('adminCountWeapons',ruleWeapons.length)");
    expect(css).toContain(".adminweapontable{display:grid");
  });

  test("weapon master list seeds Expert melee weapon data", () => {
    const sql = read("supabase/migrations/20261005184111_seed_rule_weapons_melee_master.sql");
    expect(sql).toContain("('melee','1H',1,'Dolk','1T4+1',0,0.5,9,'L',40");
    expect(sql).toContain("('melee','1-2H',1,'Kortspjut','1T6+1',2,2,11,'L',75");
    expect(sql).toContain("('melee','1-2H',4,'Morgonstjärna','2T8+2',1,3,11,'T',250");
    expect(sql).toContain("('melee','2H',4,'Tvåhandssvärd','2T10',3,2,11,'T',560");
    expect(sql).toContain("('melee','2H',4,'Pålyxa','3T6',4,3,11,'T',125");
    expect(sql).toContain("on conflict (category,name) do update");
  });

  test("actors copy weapon master data into independently editable instances", () => {
    const legacy = read("legacy/app.js");
    const css = read("src/styles/app.css");
    expect(legacy).toContain("function copyRuleWeaponToInstance");
    expect(legacy).toContain("target.handling=rule.handling");
    expect(legacy).toContain("target.strengthGroup=rule.strength_group");
    expect(legacy).toContain("target.bep=rule.bep");
    expect(legacy).toContain("target.weaponType=rule.weapon_type");
    expect(legacy).toContain("function setCharacterWeaponMaster");
    expect(legacy).toContain("copyRuleWeaponToInstance(w,rule)");
    expect(legacy).toContain("if(rule)copyRuleWeaponToInstance(r,rule)");
    expect(legacy).toContain("function openWeaponInstanceEditor");
    expect(legacy).toContain("function saveWeaponInstanceEditor");
    expect(legacy).toContain("weapon_id:r.weapon_id||r.weaponTypeId||''");
    expect(css).toContain("#skillModal.weapon-instance-modal{z-index:1400}");
  });

  test("weapon master links character FV and combat ERF to skills", () => {
    const legacy = read("legacy/app.js");
    const combat = read("features/combat/runtime.js");
    const linkSql = read("supabase/migrations/20261007045327_link_weapon_master_to_skills.sql");
    const migrateSql = read("supabase/migrations/20261007045409_migrate_character_weapon_fv_to_skills.sql");
    const enforceSql = read("supabase/migrations/20261007050300_enforce_weapon_skill_link.sql");
    expect(linkSql).toContain("add column if not exists skill_id text");
    expect(linkSql).toContain("when 'dagger'=any(tags) then 'dolkar'");
    expect(linkSql).toContain("when 'bow'=any(tags) then 'pilbagar'");
    expect(migrateSql).toContain("jsonb_build_object('skillId',rw.skill_id,'skillName',rs.name)");
    expect(enforceSql).toContain("alter column skill_id set not null");
    expect(enforceSql).toContain("on delete restrict");
    expect(legacy).toContain("function characterWeaponSkillTarget");
    expect(legacy).toContain("target.skillId=rule.skill_id");
    expect(legacy).toContain("skill_id:skillId");
    expect(legacy).toContain("Färdighet måste anges för varje vapen.");
    expect(legacy).toContain("function weaponLinkedFvHtml");
    expect(combat).toContain("function combatWeaponSkillTarget");
    expect(combat).toContain("const fv=combatAttackFv(weapon,actor)");
    expect(combat).toContain("item_group:'skills'");
    expect(combat).toContain("awardCharacterErfItem(actor.source_id,itemGroup,itemKey");
  });

  test("weapon instance grip overrides master values", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("handling:item?.handling||r?.handling||''");
    expect(legacy).toContain("let r=ruleWeaponForItem(item),ownGroup=Number(item?.strengthGroup)");
    expect(legacy).toContain("Number.isFinite(ownGroup)?ownGroup");
  });

  test("weapon master includes projectile, thrown and campaign weapon data", () => {
    const sql = read("supabase/migrations/20261005185112_complete_weapon_master_projectile_thrown.sql");
    expect(sql).toContain("('projectile','2H',2,'Kortbåge','1T6+1'");
    expect(sql).toContain("('projectile','2H',3,'Arbalest','3T6+3'");
    expect(sql).toContain("('thrown','1H',1,'Kastspjut','1T6+1'");
    expect(sql).toContain("('melee','1-2H',4,'Bastardsvärd','1T10+1'");
    expect(sql).toContain("'Stavslunga','1T8'");
    expect(sql).toContain(",1,'',60,array['staff_sling','projectile']");
  });

  test("legacy Stav resolves to Trästav master without renaming the instance", () => {
    const legacy = read("legacy/app.js");
    expect(legacy).toContain("let alias=({'stav':'Trästav'})");
    expect(legacy).toContain("let id=String(row?.weapon_id||row?.weaponTypeId||''),name=String(row?.name||'').trim(),rule=ruleWeaponForItem(row)");
    expect(legacy).toContain("if(rule)return 'rule:'+rule.id");
  });

  test("legacy actor weapons are backfilled from master without replacing overrides", () => {
    const sql = read("supabase/migrations/20261005185623_backfill_weapon_master_instances.sql");
    expect(sql).toContain("'weaponTypeId', r.id");
    expect(sql).toContain("coalesce(nullif(e.item->>'damage',''),r.damage)");
    expect(sql).toContain("when lower(e.item->>'name')='stav' then 'trästav'");
    expect(sql).toContain("update public.characters");
    expect(sql).toContain("update public.campaign_npcs");
    expect(sql).toContain("update public.campaign_monsters");
  });

  test("weapon master and instance update bumps cache version", () => {
    const html = read("index.html");
    expect(html).toContain("Alea Crusaders v0.33.74");
    expect(html).toContain("app.css?v=0.33.74");
    expect(html).toContain("legacy/app.js?v=0.33.74");
  });


  test("GM can select, play and reset a combat scene", () => {
    const html = read("index.html");
    const combat = read("features/combat/runtime.js");
    const legacy = read("legacy/app.js");
    const css = read("src/styles/app.css");
    const zones = read("features/combat/hit-body-zones.js");
    const main = read("src/main.js");
    expect(html).toContain('id="combatGmControls"');
    expect(combat).toContain("async function loadCombatSceneChoices");
    expect(combat).toContain("function renderCombatGmControls");
    expect(combat).toContain('id="combatScenePicker"');
    expect(html).toContain("./features/combat/hit-body-model.js?v=0.33.74");
    expect(html).toContain("./features/combat/hit-body-zones.js?v=0.33.74");
    expect(html).toContain("./features/combat/runtime.js?v=0.33.74");
    expect(combat).toContain("async function playCombatScene");
    expect(combat).toContain("async function resetCombatScene");
    expect(combat).toContain("async function combatCreateRuntimeFromScene");
    expect(combat).toContain("function combatRollD10");
    expect(combat).toContain("function combatBuildInitiative");
    expect(combat).toContain("formula:'SMI+1T10'");
    expect(combat).toContain("b.total-a.total||b.smi-a.smi");
    expect(combat).toContain("visible_to_players!==false");
    expect(combat).toContain("initiative:pendingInitiative,active_actor_id:null");
    expect(combat).toContain("JSON.stringify({initiative,active_actor_id:firstActorId,phase:'movement'");
    expect(combat).toContain("initiative_roll:result.die");
    expect(combat).toContain("initiative_total:result.total");
    expect(combat).toContain("initiative_rank:rank");
    expect(combat).toContain("event_type:'initiative'");
    expect(combat).toContain("SMI '+result.smi+' + T10 '+result.die+' = '+result.total");
    expect(combat).toContain("phase:'movement'");
    expect(combat).toContain("scene_id:scene.id");
    expect(combat).toContain("campaign_combat_scene_combatants?scene_id=eq.");
    expect(combat).toContain("campaign_combat_scene_hexes?scene_id=eq.");
    expect(combat).toContain("async function loadCombatRuntimeBackground");
    expect(combat).toContain("getMapImageUrl(map)");
    expect(combat).toContain("getCombatSceneBackgroundUrl(settings.background_image_path)");
    expect(combat).toContain("function combatRuntimeHexCells");
    expect(combat).toContain("function combatReachableHexes");
    expect(combat).toContain("function combatHalfMoveLimit");
    expect(combat).toContain("function combatMovementAllowance");
    expect(combat).toContain("function combatMovementHasUsedMoreThanHalf");
    expect(combat).toContain("Math.min(remaining,halfLeft)");
    expect(combat).toContain("automatic:true");
    expect(combat).toContain("const COMBAT_PRIMARY_ACTIONS=[");
    expect(combat).toContain("reactive:true");
    expect(combat).toContain("def.automatic||def.reactive");
    expect(combat).toContain("!def.automatic&&!def.reactive");
    expect(combat).toContain("function combatPrimaryActionIsSpent");
    expect(combat).toContain("function combatHasUnusedAction");
    expect(combat).toContain("function combatSuccessfulMeleeAttack");
    expect(combat).toContain("function combatPendingParryOpportunity");
    expect(combat).toContain("async function chooseCombatParry");
    expect(combat).toContain("async function declineCombatParry");
    expect(combat).toContain("parry_decision:rolled.success?'parried':'failed'");
    expect(combat).toContain("parry_decision:'declined'");
    expect(combat).toContain("status:'resolving'");
    expect(combat).toContain("combatReactionPromptHtml()");
    expect(combat).toContain("async function combatRollDice");
    expect(combat).toContain("status=in.(setup,active,paused)");
    expect(combat).toContain("combatConfirmReplaceActiveRuntime");
    expect(combat).toContain("combatIsResetReadyForPlay");
    expect(combat).toContain("reset_ready_for_play:resetReady===true");
    expect(combat).toContain("resetReady:reset");
    expect(combat).toContain("Återställd · redo för Play");
    expect(combat).toContain("combatInitiativeTransferToOrder");
    expect(combat).toContain("combatFadeInitiativeDice");
    expect(combat).toContain("combatWaitForInitiativeDiceToSettle");
    expect(combat).toContain("const minimum=reduced?350:2300");
    expect(combat).toContain("await combatWaitForInitiativeDiceToSettle");
    expect(combat).toContain("round_number:initiativeRound");
    expect(combat).toContain("phase:'initiative'");
    expect(combat).toContain("initiative:pendingInitiative");
    expect(combat).toContain("await combatRollAndApplyInitiative(combatId,{roundNumber:round})");
    expect(combat).toContain("if(index===0)combatFadeInitiativeDice()");
    expect(combat).toContain("combatShowDiceHost");
    expect(combat).toContain("duration:780");
    expect(combat).toContain("offset:.94");
    expect(combat).toContain("setTimeout(()=>transferOne(0),reduced?700:3000)");
    expect(combat).toContain("data-combatant-id");
    expect(combat).toContain("<small>SMI ");
    expect(combat).toContain("<small>Initiativ</small>");
    expect(combat).toContain("initiative-arrival");
    expect(combat).toContain("function combatCaptureInitiativeForReset");
    expect(combat).toContain("const initiativeSnapshot=reset?combatCaptureInitiativeForReset():null");
    expect(combat).toContain("if(!reset)await combatRollAndApplyInitiative(replacementCombatId)");
    expect(combat).toContain("active_actor_id:null");
    expect(combat).toContain("if(startActorId)");
    expect(combat).toContain("await loadActiveCombat(replacementCombatId)");
    expect(combat).toContain("if(previousCombatId&&String(previousCombatId)!==String(replacementCombatId))await combatDeleteRuntime(previousCombatId)");
    expect(combat).toContain("if(replacementCombatId&&!replacementCommitted)");
    expect(combat).toContain("await combatDeleteRuntime(replacementCombatId)");
    expect(combat).toContain("Reset återställer aktiv scen utan nytt initiativ");
    expect(combat).toContain("Pågående strid återupptas automatiskt");
    expect(combat).toContain("Sparad strid");
    expect(combat).toContain("if(activeSceneId&&!combatSceneFromId(combatSelectedSceneId)&&combatSceneFromId(activeSceneId))combatSelectedSceneId=activeSceneId");
    expect(combat).toContain("const selectedExists=scenes.some");
    expect(combat).not.toContain("else if(!reset&&activeCombat?.id)return");
    expect(combat).toContain("replacementCombatId=await combatCreateRuntimeFromScene");
    expect(combat).toContain("activeCombat&&!combatIsResetReadyForPlay(scene)");
    expect(combat).toContain("function combatantCard(c,index=0)");
    expect(combat).toContain("function combatRowPortraitUrl");
    expect(combat).toContain("function combatRowPortraitHtml");
    expect(combat).toContain("combat-row-portrait");
    expect(combat).toContain("combat-row-inline-vitals");
    expect(combat).toContain("combat-row-init");
    expect(combat).toContain("KP ");
    expect(combat).toContain("PSY ");
    expect(combat).toContain("combat-order-number");
    expect(combat).toContain("combatMovementButton");
    expect(combat).toContain("combatPlayBtn");
    expect(combat).toContain("activeCombat&&!combatIsResetReadyForPlay(scene)");
    expect(combat).toContain("combatAttackButton");
    expect(combat).toContain("toggleCombatOtherActionsMenu");
    expect(combat).toContain("combatRowAttackMenuHtml");
    expect(combat).toContain("combatRowActionMenuHtml");
    expect(combat).toContain("chooseCombatRowAction");
    expect(combat).toContain("combatActionMenuKind");
    expect(combat).toContain("def.key!=='attack'");
    expect(combat).toContain('title="Attack"');
    expect(combat).toContain('title="Andra handlingar"');
    expect(combat).toContain('title="Avsluta drag"');
    expect(combat).toContain("endCombatTurn");
    expect(combat).toContain("combatTurnOrderIds");
    expect(combat).toContain("commitCombatMovementPlan");
    expect(combat).toContain("previewCombatMovementToHex");
    expect(combat).toContain("combatMovementDragStart");
    expect(combat).toContain("combatMovementDragMove");
    expect(combat).toContain("combatMovementDragEnd");
    expect(combat).toContain("combatAnimateCommittedMovement");
    expect(combat).toContain("Lås förflyttning");
    expect(combat).toContain("(SMI");
    expect(combat).toContain("combat-row-inline-vitals");
    expect(combat).toContain("player-row");
    expect(combat).toContain("npc-row");
    expect(combat).toContain("enemy-row");
    expect(combat).toContain("<h3>Turordning</h3>");
    expect(combat).toContain("function combatFumbleTableKey");
    expect(combat).toContain("function combatFumbleRule");
    expect(combat).toContain("async function combatResolveFumbleChain");
    expect(combat).toContain("async function combatApplyFumbleEntries");
    expect(combat).toContain("async function combatResolveFumbleParams");
    expect(combat).toContain("function combatFumbleResultHtml");
    expect(combat).toContain("if(outcome==='fumble')");
    expect(combat).toContain("result.fumble=await combatResolveFumbleChain");
    expect(combat).toContain("pendingRolls+=Math.max(2");
    expect(combat).toContain("sequence>=20");
    expect(combat).toContain("broken_weapon_keys");
    expect(combat).toContain("dropped_weapon_keys");
    expect(combat).toContain("state.prone=true");
    expect(combat).toContain("state.fumble_movement_penalty");
    expect(combat).toContain("return 'natural'");
    expect(combat).toContain("return 'ranged'");
    expect(combat).toContain("return 'melee'");
    expect(combat).toContain("function combatAttackFv");
    expect(combat).toContain("function combatOutcomeMeta");
    expect(combat).toContain("function combatShowOutcomeOverlay");
    expect(combat).toContain("combatShowOutcomeOverlay(outcome");
    expect(combat).toContain("combat-result-icon");
    expect(combat).toContain("async function combatResolveAttackAction");
    expect(combat).toContain("async function combatAwardAttackErf");
    expect(combat).toContain("awardCharacterErfItem(actor.source_id,itemGroup,itemKey,outcome,{amount})");
    expect(combat).toContain("combatRollDice([{qty:1,sides:3}]");
    expect(combat).toContain("ERF redan erhållet under aktuell viloperiod.");
    expect(combat).toContain("result.erf=erf");
    expect(combat).toContain("combatSyncAttackErfLocal");
    expect(combat).toContain("async function rollCombatAttack");
    expect(legacy).toContain("async function awardCharacterErfItem");
    expect(legacy).toContain("async function loadRuleCombatFumbles");
    expect(legacy).toContain("async function loadRuleSocialStands");
    expect(legacy).toContain("function socialStandOptions");
    expect(legacy).toContain("rule_social_stands?ruleset=eq.dod_expert");
    expect(legacy).toContain("socialStandOptions(i.stand)");
    expect(legacy).toContain("function renderAdminSocialStands");
    expect(legacy).toContain("function editRuleSocialStand");
    expect(legacy).toContain("function saveRuleSocialStand");
    expect(legacy).toContain("function ruleCombatFumble");
    expect(legacy).toContain("rule_combat_fumbles?ruleset=eq.dod_expert");
    expect(legacy).toContain("loadRuleCombatFumbles()");
    expect(legacy).toContain("function expertOutcomePresentation");
    expect(legacy).toContain("function expertOutcomeHtml");
    expect(legacy).toContain("outcome-icon");
    expect(legacy).toContain("expertOutcomeHtml(outcome)");
    expect(legacy).toContain("awardCharacterErfItem(current._dbId,group,key,reason,{amount})");
    expect(combat).toContain("expertSkillInitialResolution(ctx,roll)");
    expect(combat).toContain("expertSkillConfirmationResolution(ctx,confirmationRoll)");
    expect(combat).toContain("full_damage:fullDamage");
    expect(combat).toContain("damage_mode:fullDamage?'full':'roll'");
    expect(combat).toContain("rule_engine:'expert_skill'");
    expect(combat).toContain("function combatMapTouchGate");
    expect(combat).toContain("if(event.pointerType===\'touch\')");
    expect(combat).toContain("if(combatMapPointers.size<2)return;");
    expect(combat).toContain("svg.setPointerCapture?.(pointerId)");
    expect(combat).toContain("if((tracked.pointerType||event.pointerType)===\'touch\')return;");
    expect(combat).toContain("lastCenterX:centerX,lastCenterY:centerY");
    expect(combat).toContain("function combatAttackPanelHtml");
    expect(combat).toContain("function combatTurnPanelHtml");
    expect(combat).toContain("combat-turn-portrait");
    expect(combat).toContain("combat-turn-actions");
    expect(combat).toContain("combat-turn-stats");
    expect(combat).toContain("Förflyttning");
    expect(combat).toContain("förbrukat / max");
    expect(combat).toContain("combatAttackWeaponOptions(combatant,'auto').find");
    expect(combat).toContain("combatAttackPanelHtml()");
    expect(combat).toContain("async function combatResolveDamage");
    expect(combat).toContain("weapon_damage_value");
    expect(combat).toContain("damage_bonus_value");
    expect(combat).toContain("combat-damage-grid");
    expect(combat).toContain("combat-damage-col");
    expect(combat).toContain("combat-damage-op");
    expect(combat).toContain("<span>Totalt</span>");
    expect(combat).toContain("combat-damage-kp");
    expect(combat).toContain("const COMBAT_HIT_LOCATION_TABLES=");
    expect(combat).toContain("async function combatResolveHitLocation");
    expect(combat).toContain("return attackMode==='melee'&&defenseMode==='parry_failed'?'B':'A'");
    expect(combat).toContain("result.hit_location=await combatResolveHitLocation");
    expect(combat).toContain("attackResult.hit_location=await combatResolveHitLocation");
    expect(combat).toContain("combatHitLocationResultHtml(result.hit_location)");
    expect(combat).toContain("function combatHitLocationFigureHtml");
    expect(combat).toContain("const COMBAT_HIT_CAMERA=");
    expect(combat).toContain("class=\"combat-hit-camera\"");
    expect(combat).toContain("--hit-scale:");
    expect(combat).toContain("--hit-tx:");
    expect(combat).toContain("--hit-ty:");
    expect(combat).toContain("window.ALEA_HIT_BODY_MODEL?.src");
    expect(combat).toContain("window.ALEA_HIT_BODY_ZONES||null");
    expect(combat).toContain("combat-hit-model-image");
    expect(combat).toContain("combat-hit-model-overlay");
    expect(combat).toContain("combat-hit-zone-fill");
    expect(combat).toContain("clipPath id=");
    expect(combat).not.toContain("mask=\"url(#");
    expect(css).toContain(".combat-hit-model-stage{");
    expect(css).toContain(".combat-hit-model-image{");
    expect(css).toContain(".combat-hit-model-image-svg{");
    expect(css).toContain("v0.33.65 — image-only hit location label");
    expect(css).toContain("v0.33.66 — compact attack result layout");
    expect(css).toContain("v0.33.67 — full damage under attack outcome");
    expect(css).toContain("v0.33.68 — GM undo under round status");
    expect(css).toContain("v0.33.71 — four-row damage equation");
    expect(css).toContain("v0.33.72 — four aligned damage columns and tighter hit camera");
    expect(css).toContain("v0.33.73 — centered hit camera");
    expect(css).toContain("v0.33.74 — active combatant round panel");
    expect(css).toContain(".combat-turn-panel{");
    expect(css).toContain(".combat-turn-undo-btn{");
    expect(css).toContain(".combat-turn-portrait{");
    expect(css).toContain(".combat-turn-stats{");
    expect(css).toContain("justify-items:center;");
    expect(css).toContain(".combat-damage-grid{");
    expect(css).toContain(".combat-damage-col{");
    expect(css).toContain(".combat-damage-op{");
    expect(css).toContain(".combat-damage-kp{");
    expect(css).toContain(".combat-undo-btn{");
    expect(css).toContain(".combat-full-damage-inline{");
    expect(css).toContain(".combat-hit-full-damage{");
    expect(css).toContain(".combat-hit-location-label{");
    expect(css).toContain("v0.33.64 — frilagd kropp direkt på attackradens bakgrund");
    expect(css).toContain(".combat-attack-hit-camera{");
    expect(css).toContain("background:transparent;");
    expect(css).toContain(".combat-hit-zone-fill{");
    expect(css).toContain(".combat-hit-camera{");
    expect(css).toContain("@keyframes combatHitCameraReveal");
    expect(css).toContain("@keyframes combatHitZoneReveal");
    expect(css).toContain("grid-template-columns:minmax(0,1fr) 126px");
    expect(css).toContain(".combat-attack-result.has-hit-camera{");
    expect(css).toContain(".combat-attack-hit-camera{");
    expect(css).toContain("justify-self:end;");
    expect(css).toContain("fill-opacity:.38");
    expect(zones).toContain("window.ALEA_HIT_BODY_ZONES=");
    expect(zones).toContain("MuscleMap");
    expect(zones).toContain("\"left_arm\"");
    expect(zones).toContain("\"right_arm\"");
    expect(zones).toContain("\"left_leg\"");
    expect(zones).toContain("\"right_leg\"");
    expect(zones).toContain("\"outline\"");
    expect(combat).toContain("function combatHitLocationCameraHtml");
    expect(combat).toContain("class=\"combat-attack-hit-camera\"");
    expect(combat).toContain("class=\"combat-attack-result-main\"");
    expect(combat).toContain("has-hit-camera");
    expect(combat).toContain("combatHitLocationCameraHtml(result.hit_location)");
    expect(html).toContain("./src/main.js?v=0.33.74");
    expect(main).toContain("window.combatHitLocationFigureHtml=function");
    expect(main).toContain("window.combatHitLocationResultHtml=function");
    expect(main).toContain("window.combatHitLocationCameraHtml=function");
    expect(main).toContain("combat-hit-location-label");
    expect(main).toContain("combat-full-damage-inline");
    expect(main).toContain("combat-attack-result-heading outcome-only");
    expect(main).toContain("COMBAT_UNDO_CURRENT_KEY");
    expect(main).toContain("window.undoLastCombatTurn=async function");
    expect(main).toContain("combatUndoObserver.observe(combatUndoBody,{childList:true});");
    expect(main).not.toContain("combatUndoObserver.observe(combatUndoBody,{childList:true,subtree:true});");
    expect(main).toContain("v0.33.70 — prevent combat undo observer feedback loop");
    expect(main).toContain("window.endCombatTurn=async function");
    expect(main).toContain("turn_undo_last");
    expect(main).toContain("SL ångrade");
    expect(main).toContain("combat-hit-model-image-svg");
    expect(main).toContain("clipPathUnits=\"userSpaceOnUse\"");
    expect(main).toContain("clip-path=\"url(#");
    expect(css).toContain(".combat-hit-location-result{");
    expect(combat).toContain("function combatParryOptions");
    expect(combat).toContain("async function combatExpertRoll");
    expect(combat).toContain("status='dead'");
    expect(combat).toContain("combat-token-skull");
    expect(combat).toContain("const COMBAT_INITIATIVE_COLORS=");
    expect(combat).toContain("function combatBuildInitiative");
    expect(combat).toContain("function combatInitiativeDiceMap");
    expect(combat).toContain("async function combatRollAndApplyInitiative");
    expect(combat).toContain("themeColor:entry.color");
    expect(combat).toContain("phase:'initiative'");
    expect(combat).toContain("await combatRollAndApplyInitiative(replacementCombatId)");
    expect(combat).toContain("groupId:index");
    expect(html).toContain('id="combatInitiativeLegend"');
    expect(combat).toContain("function combatPositionDiceLayer");
    expect(combat).toContain("function combatResolveDiceRows");
    expect(combat).toContain("window.alea3dCombatRoll");
    expect(combat).toContain("combatDiceLastRoll");
    expect(html).toContain('data-admin-section="stands"');
    expect(html).toContain('id="adminSocialStandTable"');
    expect(html).toContain('id="adminCountStands"');
    expect(html).toContain('id="combatDiceHost"');
    expect(html).toContain('id="combatDiceReadout"');
    expect(combat).toContain("key:'spell_prepare',type:'spell',label:'Förbereda besvärjelse'");
    expect(combat).toContain("key:'spell_cast',type:'spell',label:'Lägg besvärjelse'");
    expect(combat).toContain("mode:'cast'");
    expect(combat).toContain("function combatIsActiveTurn");
    expect(combat).toContain("function combatChosenAction");
    expect(combat).toContain("async function chooseCombatPrimaryAction");
    expect(combat).toContain("slot_key:'primary'");
    expect(combat).toContain("action_type:def.type");
    expect(combat).toContain("status:def.type==='parry'?'reserved':'planned'");
    expect(combat).toContain("combatSelectedTargetId=preserveSelectedTarget&&selectedTargetStillExists?selectedTargetBeforeLoad:(activeCombat.active_actor_id||null)");
    expect(combat).toContain("combatRowActionMenuHtml(actor)");
    expect(combat).toContain("combatPlayerMiniatureKind");
    expect(combat).toContain("combatMiniatureWarrior");
    expect(combat).toContain("combatMiniatureWizard");
    expect(combat).toContain("combatMiniatureDuck");
    expect(combat).toContain("combatPlayerMiniatureSvg");
    expect(combat).toContain("function combatPlayerPortraitSource");
    expect(combat).toContain("typeof getPortraitSrc===\'function\'");
    expect(combat).toContain("combatPortraitClip_");
    expect(combat).toContain("combat-portrait-depth");
    expect(combat).toContain("combat-portrait-green-ring");
    expect(combat).toContain("preserveAspectRatio=\"xMidYMid slice\"");
    expect(combat).toContain("combatMapZoomAt");
    expect(combat).toContain("COMBAT_MAP_MAX_ZOOM=8");
    expect(combat).toContain("const depthOffset=2.5");
    expect(combat).toContain("transform=\"translate('+cell.x+' '+cell.y+') scale");
    expect(combat).toContain("combat-portrait-visual");
    expect(combat).toContain("combatMapWheel");
    expect(combat).toContain("combatMapPointerDown");
    expect(combat).toContain("combatMapPointerMove");
    expect(combat).toContain("combatMapPointerEnd");
    expect(combat).toContain("combatMapResetView");
    expect(combat).toContain("function combatMapFitCombatants");
    expect(combat).toContain("function combatMapCombatantCenters");
    expect(combat).toContain("const marginX=g.xPitch,marginY=g.rowPitch");
    expect(combat).toContain("Math.min(COMBAT_MAP_MAX_ZOOM,zoomX,zoomY)");
    expect(combat).toContain('title="Fokusera alla kombatanter"');
    expect(combat).toContain("onwheel=\"combatMapWheel(event)\"");
    expect(combat).toContain("ondblclick=\"combatMapResetView()\"");
    expect(combat).toContain("Math.min(COMBAT_MAP_MAX_ZOOM");
    expect(combat).toContain("if(event.target?.closest?.('.combat-token-group'))return");
    expect(combat).toContain("name.includes('astrid')");
    expect(combat).toContain("name.includes('lyra')");
    expect(combat).toContain("name.includes('evalin')");
    expect(combat).toContain("function combatHasLineOfSight");
    expect(combat).toContain("function combatPossibleAttackTargets");
    expect(combat).toContain("async function moveActiveCombatantToHex");
    expect(combat).toContain("async function combatRecordFullMoveAction");
    expect(combat).toContain("auto_wait:true");
    expect(combat).toContain("wait_rest_of_turn:true");
    expect(combat).toContain("previewCombatMovementToHex(event");
    expect(combat).toContain("move-occupied");
    expect(combat).toContain("function combatWeaponRangeHexes");
    expect(combat).toContain("function combatMeleeReachHexesForWeapon");
    expect(combat).toContain("function combatWeaponKey");
    expect(combat).toContain("function combatAttackWeaponOptions");
    expect(combat).toContain("key:'attack',type:'attack',label:'Attack',icon:'⚔',mode:'auto'");
    expect(combat).toContain("function combatWeaponCategory");
    expect(combat).toContain("function combatAttackModeForTarget");
    expect(combat).toContain("if(category==='thrown')return distance===1?'melee':'ranged'");
    expect(combat).toContain("function combatAttackTargetInfo");
    expect(combat).toContain("attack_mode:attackMode");
    expect(combat).not.toContain("attack_melee");
    expect(combat).not.toContain("attack_ranged");
    expect(combat).toContain("function combatActionWeapon");
    expect(combat).toContain("async function chooseCombatAttackWeapon");
    expect(combat).toContain("function combatAttackWeaponChooserHtml");
    expect(combat).toContain("sourceData.weapon_key=combatWeaponKey(autoWeapon)");
    expect(combat).toContain("options.length>1&&!weapon");
    expect(combat).toContain("combatPossibleAttackTargets(combatant,mode,weapon)");
    expect(combat).toContain("function combatMeleeRangeHexes");
    expect(combat).toContain("weapon?.weapon_length??weapon?.length");
    expect(combat).toContain("if(length<=1)return 1");
    expect(combat).toContain("if(length<=3)return 2");
    expect(combat).toContain("return 3");
    expect(combat).toContain("if(mode==='melee')return combatMeleeRangeHexes(combatant,weapon)");
    expect(combat).toContain("Närkontakt = närstrid · annars avstånd");
    expect(combat).toContain("cell?.sight_mode==='blocked'");
    expect(combat).toContain("target.side===actor.side");
    expect(combat).toContain("attack-target");
    expect(combat).toContain("function combatCurrentAttackTargets");
    expect(combat).toContain("preserveSelectedTarget:def.type===\'attack\'");
    expect(combat).toContain("loadActiveCombat(null,{preserveSelectedTarget:true})");
    expect(combat).toContain("panelTargetId=action.status===\'resolved\'");
    expect(combat).toContain("function combatAttackPanelHtml");
    expect(combat).toContain("function combatDestinationKeepsAction");
    expect(combat).toContain("Math.floor(combatMovementMaximum(combatant)/2)");
    expect(combat).toContain("combatMovementSpent(combatant)+Number(pathCost)<=combatHalfMoveLimit(combatant)");
    expect(combat).toContain("const stepCost=cell.movement_mode==='difficult'?2:1");
    expect(combat).toContain("if(!cell||cell.movement_mode==='blocked')continue");
    expect(combat).toContain("if(nextCost>budget)continue");
    expect(combat).toContain("cls.push('move-reachable')");
    expect(combat).toContain("'move-action-kept':'move-action-spent'");
    expect(combat).toContain("cls.push('move-origin')");
    expect(combat).toContain("movement_mode:terrain?.movement_mode||'free'");
    expect(combat).toContain('class="combat-map-background"');
    expect(combat).toContain("const image=combatRuntimeMapUrl");
    expect(combat).toContain("movement_remaining:stats.movement_remaining");
    expect(combat).toContain("replacementCombatId=await combatCreateRuntimeFromScene");
    expect(css).toContain(".combat-gm-controls{");
    expect(css).toContain(".combat-play-btn{");
    expect(css).toContain(".combat-reset-btn{");
    expect(css).toContain(".combat-map-background{");
    expect(css).toContain(".combat-map-svg{");
    expect(css).toContain(".combat-hex.move-reachable{");
    expect(css).toContain(".combat-hex.move-reachable.difficult{");
    expect(css).toContain(".combat-hex.move-reachable.move-action-kept{");
    expect(css).toContain(".combat-hex.move-reachable.move-action-spent{");
    expect(css).toContain(".combat-move-legend{");
    expect(css).toContain(".combat-action-box{");
    expect(css).toContain(".combat-reaction-prompt{");
    expect(css).toContain(".combat-dice-layer{");
    expect(css).toContain(".combat-initiative-legend{");
    expect(css).toContain(".combat-initiative-chip{");
    expect(css).toContain("--initiative-color");
    expect(css).toContain(".combat-dice-host{");
    expect(css).toContain(".combat-dice-host.initiative-fading{opacity:0}");
    expect(css).toContain("transition:opacity .82s ease");
    expect(css).toContain(".combat-dice-readout{");
    expect(css).toContain(".combat-parry-btn{");
    expect(css).toContain(".combat-take-hit-btn{");
    expect(css).toContain(".combat-action-grid{");
    expect(css).toContain(".combat-action-btn.active{");
    expect(css).toContain(".combatant-card.active-turn{");
    expect(css).toContain(".combat-token.attack-target{");
    expect(css).toContain(".combatant-card.attack-target{");
    expect(css).toContain(".combat-attack-summary{");
    expect(css).toContain(".combat-attack-execute{");
    expect(css).toContain(".combat-attack-result{");
    expect(css).toContain(".combat-mini-attack{");
    expect(css).toContain(".combat-mini-duel{");
    expect(css).toContain(".combat-mini-parry{");
    expect(css).toContain(".combat-damage-result{");
    expect(css).toContain(".combat-token.defeated{");
    expect(css).toContain(".combat-fumble-results{");
    expect(css).toContain(".combatant-card.player-row{");
    expect(css).toContain(".combatant-card.npc-row{");
    expect(css).toContain(".combatant-card.enemy-row{");
    expect(css).toContain(".combat-order-number{");
    expect(css).toContain(".combat-row-move{");
    expect(css).toContain(".combat-row-tool-btn{");
    expect(css).toContain(".combat-row-portrait{");
    expect(css).toContain(".combat-row-inline-vitals{");
    expect(css).toContain(".combatant-card.player-row,");
    expect(css).toContain("grid-template-areas:");
    expect(css).toContain('"rank portrait copy init"');
    expect(css).toContain("isolation:isolate");
    expect(css).toContain("linear-gradient(180deg,#211a14 0%,#17120e 58%,#120f0c 100%)");
    expect(css).toContain(".combat-row-init{");
    expect(css).toContain("--side:#3ca95a");
    expect(css).toContain("--side:#3984c6");
    expect(css).toContain("--side:#bd493e");
    expect(css).toContain("color-mix(in srgb,var(--side)");
    expect(css).toContain(".combat-row-action-menu{");
    expect(css).toContain(".combat-row-attack.chosen");
    expect(css).toContain(".combat-row-action-menu.combat-row-attack-menu{");
    expect(css).toContain("grid-template-columns:44px minmax(0,1fr) 140px 48px");
    expect(css).toContain(".combat-row-action-option{");
    expect(css).toContain(".combat-play-btn:disabled{");
    expect(css).toContain(".combat-row-vitals{");
    expect(css).toContain(".combat-miniature{");
    expect(css).toContain(".combat-miniature.combat-portrait-hex{");
    expect(css).toContain(".combat-portrait-depth{");
    expect(css).toContain(".combat-portrait-green-ring{");
    expect(css).toContain("stroke:url(#portraitHexGreen)");
    expect(css).toContain(".combat-mini-base-ring{");
    expect(combat).toContain("function combatMapFrameStyle");
    expect(combat).toContain("function combatMapFooterHtml");
    expect(combat).toContain("style=\"'+combatMapFrameStyle()+'");
    expect(combat).toContain("combatMapFooterHtml()");
    expect(css).toContain(".combat-board-footer{");
    expect(css).toContain(".combat-board-description{");
    expect(css).toContain("height:auto;min-height:0");
    expect(css).not.toContain("height:620px");
    expect(css).not.toContain("height:66vh;min-height:480px");
    expect(css).not.toContain("height:62vh;min-height:420px");
    expect(css).toContain(".combat-map-zoom-controls{");
    expect(css).toContain(".combat-map-fit-btn{");
    expect(css).toContain(".combat-map-svg{");
    expect(css).toContain("touch-action:pan-y");
    expect(css).toContain("overscroll-behavior:contain");
    expect(css).toContain("stroke:#27bd4d");
    expect(css).toContain(".combat-token-group.movement-planning{");
    expect(css).toContain(".combat-hex.move-preview{");
    expect(css).toContain(".adminstandtable{");
    expect(css).toContain(".combat-fumble-row{");
    expect(css).toContain(".combat-dice-readout.fumble-detail");
    expect(css).toContain(".roll-outcome.special{");
    expect(css).toContain(".roll-outcome.perfect{");
    expect(css).toContain(".roll-outcome.fumble{");
    expect(css).toContain(".combat-dice-readout.outcome-show.perfect{");
    expect(css).toContain(".combat-dice-readout.outcome-show.fumble{");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain(".combat-erf-result{");
    expect(css).toContain(".combat-erf-result.locked{");
    expect(css).toContain(".combat-attack-roll-btn{");
    expect(css).toContain(".combat-weapon-choice{");
    expect(css).toContain(".combat-weapon-choice-grid{");
    expect(css).toContain(".combat-weapon-choice-btn.active{");
    expect(css).toContain(".combat-hex.move-reachable:hover{");
    expect(css).toContain(".combat-hex.move-occupied{");
    expect(css).toContain(".combat-hex.move-origin{");
  });

  test("map glowup uses a bronze frame and warm brown map treatment", () => {
    const html = read("index.html");
    const css = read("features/map/glowup.css");
    expect(html).toContain('class="map-title-icon"');
    expect(html).toContain("./features/map/glowup.css?v=0.33.42");
    expect(css).toContain("#mapPage .mapviewport");
    expect(css).toContain("filter:sepia(.68)");
    expect(css).toContain("color:#d0a052");
  });

  test("Targans Gille uses the illustrated shop hero", () => {
    const html = read("index.html");
    const shop = read("features/shop/store.js");
    const css = read("features/shop/store.css");
    expect(html).toContain('id="shopHeroImage"');
    expect(html).toContain('class="shop-hero shop-hero-photo"');
    expect(html).toContain('class="shop-hero-kicker">Handelshus');
    expect(shop).toContain("function loadShopHeroImage");
    expect(shop).toContain("assets/targans-gille-clean.jpg?v=0.33.42");
    expect(shop).toContain("const SHOP_HERO_SRC");
    expect(css).toContain(".shop-hero.shop-hero-photo");
    expect(css).toContain(".shop-hero-media img");
  });

  test("Targans Gille is a player-facing shop with a persistent cart", () => {
    const html = read("index.html");
    const shop = read("features/shop/store.js");
    const css = read("features/shop/store.css");
    expect(html).toContain('id="shopNavBtn"');
    expect(html).toContain('id="shopPage"');
    expect(html).toContain('id="shopCartLines"');
    expect(html).toContain("./features/shop/store.css?v=0.33.42");
    expect(html).toContain("./features/shop/store.js?v=0.33.42");
    expect(shop).toContain("rule_shop_items?active=eq.true");
    expect(shop).toContain("loadRuleWeapons(force)");
    expect(shop).toContain("const SHOP_CART_STORAGE_KEY='alea_targans_gille_cart_v1'");
    expect(shop).toContain("function shopAddItem");
    expect(shop).toContain("function shopChangeQuantity");
    expect(shop).toContain("function shopClearCart");
    expect(css).toContain(".shop-layout{display:grid");
  });

  test("Targans Gille catalogue is versioned without duplicating weapon masters", () => {
    const sql = read("supabase/migrations/20261005213000_targans_gille_shop_catalog.sql");
    expect(sql).toContain("create table if not exists public.rule_shop_items");
    expect(sql).toContain("Weapons are intentionally NOT duplicated here");
    expect(sql).toContain("insert into public.rule_shop_items");
    expect(sql).toContain("'Pilar, 20 st'");
    expect(sql).toContain("'Liten ryggsäck'");
    expect(sql).toContain("'Rustning'");
    expect(sql).toContain("on conflict (item_key) do update");
    expect(sql).toContain("grant select, insert, update, delete on table public.rule_shop_items to authenticated");
  });


  test("Targans Gille checkout uses carried coins and existing character inventories", () => {
    const html = read("index.html");
    const shop = read("features/shop/store.js");
    const css = read("features/shop/store.css");
    expect(html).toContain('id="shopBuyerSelect"');
    expect(html).toContain('id="shopBuyerBalance"');
    expect(html).toContain('id="shopCheckoutBtn"');
    expect(html).toContain("1 GM = 10 SM = 100 KM");
    expect(shop).toContain("const SHOP_CURRENCY_KM={GM:100,SM:10,KM:1}");
    expect(shop).toContain("String(c.ownerId||'')===String(u.id)");
    expect(shop).toContain("function shopSpendCarriedCoins");
    expect(shop).toContain("function shopAddPurchasedItem");
    expect(shop).toContain("copyRuleWeaponToInstance(w,rule)");
    expect(shop).toContain("fv:10");
    expect(shop).toContain("item.purchaseKind==='projectile'");
    expect(shop).toContain("c.armor.push(shopArmorInstance(item))");
    expect(shop).toContain("c.shields.push({");
    expect(shop).toContain("c.equipment.push({");
    expect(shop).toContain("await syncCharacterToCentral(draft)");
    expect(shop).toContain("shopSpendCarriedCoins(draft,cost)");
    expect(css).toContain(".shop-checkout{");
    expect(css).toContain(".shop-insufficient{");
  });

  test("Targans Gille checkout keeps default FV 10 for bought weapons and shields", () => {
    const shop = read("features/shop/store.js");
    const weaponStart = shop.indexOf("if(item.source==='weapon'||item.purchaseKind==='weapon')");
    const projectileStart = shop.indexOf("if(item.purchaseKind==='projectile')", weaponStart);
    const weaponBlock = shop.slice(weaponStart, projectileStart);
    expect(weaponStart).toBeGreaterThan(-1);
    expect(projectileStart).toBeGreaterThan(weaponStart);
    expect(weaponBlock).toContain("fv:10");
    expect(weaponBlock).toContain("w.fv=10");
    const shieldStart = shop.indexOf("if(item.purchaseKind==='shield')");
    const equipmentStart = shop.indexOf("c.equipment=c.equipment||[]", shieldStart);
    const shieldBlock = shop.slice(shieldStart, equipmentStart);
    expect(shieldBlock).toContain("fv:10");
  });

  test("Targans Gille catalogue uses compact rows with visible price and expandable details", () => {
    const shop = read("features/shop/store.js");
    const css = read("features/shop/store.css");
    expect(shop).toContain("shop-item-row");
    expect(shop).not.toContain('class="shop-item-category" title="');
    expect(shop).toContain("shop-item-price");
    expect(shop).toContain("shop-row-stepper");
    expect(shop).toContain("shop-row-buy");
    expect(shop).toContain("function shopToggleItemDetails");
    expect(shop).toContain("function shopChangeRowQuantity");
    expect(shop).toContain("shopAddItem(\\'");
    expect(css).toContain(".shop-item-main{");
    expect(css).toContain("grid-template-columns:minmax(0,1fr) 78px 86px 54px");
    expect(css).toContain(".shop-item-details.hidden{display:none}");
  });
  test("Targans Gille renders GM SM KM as distinct coin icons", () => {
    const shop = read("features/shop/store.js");
    const css = read("features/shop/store.css");
    expect(shop).toContain("function shopCoinHtml");
    expect(shop).toContain("function shopCurrencyAmountHtml");
    expect(shop).toContain("function shopPriceHtml");
    expect(shop).toContain("function shopMoneyHtml");
    expect(shop).toContain("const code=['GM','SM','KM'].includes(currency)?currency:'SM'");
    expect(shop).toContain("shop-coin-'+code.toLowerCase()");
    expect(shop).toContain("button.innerHTML=shopCheckoutBusy");
    expect(shop).toContain("total.innerHTML=shopMoneyHtml");
    expect(css).toContain(".shop-coin-gm{");
    expect(css).toContain(".shop-coin-sm{");
    expect(css).toContain(".shop-coin-km{");
    expect(css).toContain(".shop-money-sr{");
  });


  test("Värdshus is a player-facing service checkout", () => {
    const html = read("index.html");
    const inn = read("features/inn/inn.js");
    const css = read("features/inn/inn.css");
    expect(html).toContain('id="innNavBtn"');
    expect(html).toContain('id="innPage"');
    expect(html).toContain('id="innCartLines"');
    expect(html).toContain('id="innBuyerSelect"');
    expect(html).toContain("./features/inn/inn.css?v=0.33.42");
    expect(html).toContain("./features/inn/inn.js?v=0.33.42");
    expect(inn).toContain("rule_inn_items?active=eq.true");
    expect(inn).toContain("const INN_CART_STORAGE_KEY='alea_inn_cart_v1'");
    expect(html).not.toContain('id="innCategories"');
    expect(inn).toContain("const INN_SECTIONS=[");
    expect(inn).toContain("{category:'Boende',title:'Boende'}");
    expect(inn).toContain("{category:'Mat & dryck',title:'Mat'}");
    expect(inn).toContain("{category:'Tjänster',title:'Tjänster'}");
    expect(inn).toContain('class="inn-menu-heading"');
    expect(inn).toContain("function innCheckout");
    expect(inn).toContain("shopSpendCarriedCoins(draft,cost)");
    expect(inn).toContain("await syncCharacterToCentral(draft)");
    expect(inn).not.toContain("shopAddPurchasedItem");
    expect(css).toContain(".inn-open #dayNavBtn");
  });

  test("Värdshus starts the money dice table from a compact card and modal", () => {
    const html = read("index.html");
    const inn = read("features/inn/inn.js");
    const css = read("features/inn/inn.css");
    expect(html).toContain('class="inn-game-launch"');
    expect(html).toContain('onclick="openInnGame()"');
    expect(html).toContain('id="innGameModal"');
    expect(html).toContain('id="innGameTitle">Högt kast');
    expect(html).toContain('id="innGameBuyerSelect"');
    expect(html).toContain('data-inn-game-type="high"');
    expect(html).toContain('data-inn-game-type="five"');
    expect(html).toContain('id="innGameDiceHost"');
    expect(html).toContain('id="innGamePhaseLabel"');
    expect(html).toContain('data-inn-game-stake="1"');
    expect(html).toContain('data-inn-game-stake="50"');
    expect(inn).toContain("function openInnGame");
    expect(inn).toContain("function closeInnGame");
    expect(inn).toContain("function innPlayHighRoll");
    expect(inn).toContain("function innPlayFiveCrowns");
    expect(inn).toContain("function innFiveCrownsCategory");
    expect(inn).toContain("'Fem kronor':50");
    expect(inn).toContain("'Fem sexor':100");
    expect(inn).toContain("const playerDice=await innAnimatedDice(5)");
    expect(inn).toContain("function innRoll2d6");
    expect(inn).toContain("const houseDice=await innAnimated2d6()");
    expect(inn).toContain("await innWait(1050)");
    expect(inn).toContain("const playerDice=await innAnimated2d6()");
    expect(inn).toContain("window.alea3dInnRoll");
    expect(inn.indexOf("const houseDice=await innAnimated2d6()")).toBeLessThan(inn.indexOf("const playerDice=await innAnimated2d6()"));
    expect(inn).toContain("payout=stake*2");
    expect(inn).toContain("payout=stake;");
    expect(inn).toContain("shopSpendCarriedCoins(draft,stake)");
    expect(inn).toContain("await syncCharacterToCentral(draft)");
    expect(css).toContain(".inn-game-launch{");
    expect(css).toContain(".inn-game-modal{");
    expect(css).toContain(".inn-game-die{");
    expect(css).toContain(".inn-game-dice-stage{");
  });

  test("Värdshus reuses DiceBox in its own animated dice host", () => {
    const dice3d = read("src/features/dice/dice3d.js");
    expect(dice3d).toContain('container:"#innGameDiceHost"');
    expect(dice3d).toContain('id:"alea-inn-dice-canvas"');
    expect(dice3d).toContain("window.alea3dInnPrepare");
    expect(dice3d).toContain("window.alea3dInnRoll");
    expect(dice3d).toContain("window.alea3dInnClear");
    expect(dice3d).toContain("scale:5.6");
  });

  test("Fem kronor uses five-die poker categories and a probability-based payout plan", () => {
    const inn = read("features/inn/inn.js");
    expect(inn).toContain("'Ett par':0");
    expect(inn).toContain("'Två par':1");
    expect(inn).toContain("'Triss':2");
    expect(inn).toContain("'Kåk':3");
    expect(inn).toContain("'Stege':4");
    expect(inn).toContain("'Fyrtal':8");
    expect(inn).toContain("'Fem kronor':50");
    expect(inn).toContain("'Fem sexor':100");
    expect(inn).toContain("dice.every(value=>value===6)");
    expect(inn).toContain("unique.join(',')==='1,2,3,4,5'");
    expect(inn).toContain("unique.join(',')==='2,3,4,5,6'");
    expect(inn).toContain("Teoretisk återbetalning: <b>97,9 %</b>");
    expect(inn).toContain("Husfördel: <b>2,1 %</b>");
  });

  test("Värdshus catalogue includes lodging meals and services", () => {
    const sql = read("supabase/migrations/20261006014500_inn_catalog.sql");
    expect(sql).toContain("create table if not exists public.rule_inn_items");
    expect(sql).toContain("'Svit'");
    expect(sql).toContain("'Enkelrum'");
    expect(sql).toContain("'Flerbäddsrum'");
    expect(sql).toContain("'Sovsal'");
    expect(sql).toContain("'Stall'");
    expect(sql).toContain("'Stigfinnare'");
    expect(sql).toContain("'Sömmerska'");
    expect(sql).toContain("'Varm måltid'");
    expect(sql).toContain("alter table public.rule_inn_items enable row level security");
  });

  test("Värdshus uses the generated innkeeper hero and Targans coin language", () => {
    const html = read("index.html");
    const inn = read("features/inn/inn.js");
    expect(html).toContain('id="innHeroImage"');
    expect(inn).toContain("assets/innkeeper-hero.jpg?v=0.33.42");
    expect(inn).toContain("shopCurrencyAmountHtml");
    expect(inn).toContain("shopMoneyHtml");
  });


});
