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
      "features/shop/store.js",
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
    expect(html).toContain("Alea Crusaders v0.31.23");
    expect(html).toContain("app.css?v=0.31.23");
    expect(html).toContain("legacy/app.js?v=0.31.23");
  });


  test("Targans Gille is a player-facing shop with a persistent cart", () => {
    const html = read("index.html");
    const shop = read("features/shop/store.js");
    const css = read("features/shop/store.css");
    expect(html).toContain('id="shopNavBtn"');
    expect(html).toContain('id="shopPage"');
    expect(html).toContain('id="shopCartLines"');
    expect(html).toContain("./features/shop/store.css?v=0.31.23");
    expect(html).toContain("./features/shop/store.js?v=0.31.23");
    expect(shop).toContain("rule_shop_items?active=eq.true");
    expect(shop).toContain("loadRuleWeapons(force)");
    expect(shop).toContain("const SHOP_CART_STORAGE_KEY='alea_targans_gille_cart_v1'");
    expect(shop).toContain("function shopAddItem");
    expect(shop).toContain("function shopChangeQuantity");
    expect(shop).toContain("function shopClearCart");
    expect(css).toContain(".shop-layout{display:grid");
  });

  test("Targans Gille checkout selects owned characters and moves purchases into inventory", () => {
    const html = read("index.html");
    const shop = read("features/shop/store.js");
    const legacy = read("legacy/app.js");
    const css = read("features/shop/store.css");
    expect(html).toContain('id="shopCharacterSelect"');
    expect(html).toContain('id="shopWallet"');
    expect(html).toContain('id="shopCheckout"');
    expect(shop).toContain("function shopAvailableCharacters");
    expect(shop).toContain("c.ownerId===user.id");
    expect(shop).toContain("function checkoutShopCart");
    expect(shop).toContain("copyRuleWeaponToInstance(weapon,rule)");
    expect(shop).toContain("buyer.coins.carried=shopKmToCoins(balance-total)");
    expect(shop).toContain("existing.count=Math.max(1,Number(existing.count)||1)+qty");
    expect(legacy).toContain("bepNumber(x.bep)*Math.max(1,Number(x.count)||1)");
    expect(css).toContain('url("../../assets/targans-gille-shop.webp")');
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

});
