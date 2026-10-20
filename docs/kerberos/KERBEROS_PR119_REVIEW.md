# KERBEROS – granskning av PR #119

Granskad 2026-10-20: [PR #119](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/119), head `0226a7930d1955df9e78fb4e546dafe68a27eed7`, bas/main `c63d3f5f57141e1cce6ce7f5ad0dccd21a6593b5`.

## Slutsats

PR:n lämnas **öppen och omergad**. Inget MEDUSA-specifikt fel som kräver ändring på dess gren identifierades. Alla 29 underkända CI-tester i 17 filer reproducerades på oförändrad main med exakt samma testnamn. Befintliga PR #95 arbetar separat med CI-städning; KERBEROS utökar inte det uppdraget.

## Exakt CI-resultat

[CI-run 39399559903](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39399559903), jobb `118550575590`: checkout, Node och installation godkända; **Test and build** underkänd. `npm run check` stannar i Vitest: 29 failed / 1266 passed, 17 failed / 186 passed filer. Byggsteget i `npm run check` körs därför inte.

Lokal full Vitest på exakt main: samma antal och exakt samma 29 testnamn. Jämförelsen är maskinellt kontrollerad. Felen rör befintliga sträng-/cacheversionskontrakt och testharness för combat/UI (bland annat saknade `combatChosenAction`, `combatMiniatureVisual`, `combatMovementPlanningActor`, `combatHideMagicResultPopup` och `window`).

| Testfil | Underkända tester |
|---|---:|
| `tests/arcane-carousel-v01.test.js` | 1 |
| `tests/architecture.test.js` | 2 |
| `tests/character-equipment-image-overrides.test.js` | 1 |
| `tests/character-round-backgrounds.test.js` | 1 |
| `tests/combat-active-turn-highlight.test.js` | 1 |
| `tests/combat-ammunition-master.test.js` | 1 |
| `tests/combat-dice-proportions.test.js` | 1 |
| `tests/combat-finish-summary.test.js` | 1 |
| `tests/combat-map-portrait-hex.test.js` | 5 |
| `tests/combat-order-portraits.test.js` | 6 |
| `tests/combat-parry-drawer.test.js` | 1 |
| `tests/combat-perfect-armor.test.js` | 3 |
| `tests/goose08-arcane-mechanics.test.js` | 1 |
| `tests/material-live-preview.test.js` | 1 |
| `tests/material-native-pages-bootstrap.test.js` | 1 |
| `tests/section-help-ui.test.js` | 1 |
| `tests/skill-art-android-picker.test.js` | 1 |

Exakta testidentiteter, både i CI och på main:

- tests/arcane-carousel-v01.test.js > ARCANE CAROUSEL V01 — independent transparent image trough > busts the entire top-level module and stylesheet chain
- tests/architecture.test.js > application architecture smoke checks > GM can select, play and reset a combat scene
- tests/architecture.test.js > application architecture smoke checks > Värdshus is a player-facing service checkout
- tests/character-equipment-image-overrides.test.js > single-item weapon and shield artwork > uses override before register art on character equipment and combat HUD
- tests/character-round-backgrounds.test.js > Character-specific round artwork > chooses stable per-combatant fallback at scene creation only
- tests/combat-active-turn-highlight.test.js > Aktiv kombatants tydliga turmarkering > markerar aktuell tur i turordningen utan att ändra andras rader
- tests/combat-ammunition-master.test.js > Ammo registry / range weapon linkage > GM can choose if projectile recovery is possible, with 80-90 % chance, once per shot
- tests/combat-dice-proportions.test.js > Combat DiceBox presentation > refreshes affected module and CSS cache paths without altering the dice tray
- tests/combat-finish-summary.test.js > Stop combat and after-action report > the GM has a stop control in the battle header, not buried in ammunition settings
- tests/combat-map-portrait-hex.test.js > Porträtt i hexagonkartan > fiende visar sitt riktiga porträtt i en rödmarkerad hexagon
- tests/combat-map-portrait-hex.test.js > Porträtt i hexagonkartan > SLP visar registrerat porträtt i blåmarkerad hexagon
- tests/combat-map-portrait-hex.test.js > Porträtt i hexagonkartan > spelarens befintliga porträtt är fortfarande grönt
- tests/combat-map-portrait-hex.test.js > Porträtt i hexagonkartan > saknat SLP-porträtt återgår till befintlig kartmarkör
- tests/combat-map-portrait-hex.test.js > Porträtt i hexagonkartan > mapparen återanvänder samma porträtthämtare som turordningen
- tests/combat-order-portraits.test.js > Porträtt i turordning – SLP och fiender > SLP visar registrerat porträtt från bildcachen
- tests/combat-order-portraits.test.js > Porträtt i turordning – SLP och fiender > fiender och monster visar samma lagrade bild som i administration
- tests/combat-order-portraits.test.js > Porträtt i turordning – SLP och fiender > om bilden inte förladdats hämtas den och turordningen ritas om
- tests/combat-order-portraits.test.js > Porträtt i turordning – SLP och fiender > saknat porträtt visar initialer, medan rollpersonens bild är oförändrad
- tests/combat-order-portraits.test.js > Porträtt i turordning – SLP och fiender > porträtt fungerar utan förladdat SLP-/fienderegister
- tests/combat-order-portraits.test.js > Porträtt i turordning – SLP och fiender > ny strid sparar bildsökvägarna i kombatanternas state
- tests/combat-parry-drawer.test.js > Responsive parry reaction outside the attack panel > offers no drawer if no legal reaction is pending and preserves Expert rules
- tests/combat-perfect-armor.test.js > Perfect hit penetrates armor v0.35.32 > perfect Kastspjut hits for 7 without the 5-point ring mail, and flags bypass in event log
- tests/combat-perfect-armor.test.js > Perfect hit penetrates armor v0.35.32 > a special strike has maximum damage but does NOT bypass armor
- tests/combat-perfect-armor.test.js > Perfect hit penetrates armor v0.35.32 > ordinary strike subtracts armor, but wards still apply to perfect strikes
- tests/goose08-arcane-mechanics.test.js > GOOSE 08 – non-destructive arcane mechanism layers > keeps the original three HERMES sprites and role-gated shared gallery
- tests/material-live-preview.test.js > Frodo — GM preview of currently shared material > mount code authorizes SL before selecting an active picture and offers full-size viewer
- tests/material-native-pages-bootstrap.test.js > GitHub Pages native material bootstrap > loads material independently of the dice-box module entry
- tests/section-help-ui.test.js > Shared section information component > keeps each provision on one horizontal row and moves guidance behind the help icon
- tests/skill-art-android-picker.test.js > Android DocumentsProvider skill-art upload > shows uploaded file feedback atop the editor with cache-busted assets

Separat byggförsök på baslinjens appkod: Vite transformerade 95 moduler och processen avslutades med segmentation fault (139). Det är en lokal begränsning med oförändrad byggkod; ett godkänt bygge kan inte rapporteras. Ingen omfattande byggfelsökning gjordes.

## Kod-, rapport- och säkerhetskontroll

Diffen omfattar bara åtta nya MEDUSA-filer: offlineverifierare, syntetiskt test och dokumentation/JSON/CSV. Ingen app, workflow, package/lockfil, HERMES-publicerare, bildreferens eller databaspolicy ändras. Verktyget har ingen HTTP-/Storage-klient, läser lokala Git-objekt med lazy fetch avstängd och skriver uttryckliga rapportutdata. Att det inte integrerats i appen eller befintlig CI förklarar varför befintliga funktioner inte påverkas vid normal körning.

- De 15 syntetiska MEDUSA-testerna från exakt head passerar.
- Alla 519 `source_objects` har `verification_status=not_verified`, `supabase_content_sha256=null` och `source_bytes=null`.
- Alla rensningskandidater har `safe_to_delete=false`; rapportens sammanfattning anger 0 byteverifierade privata Storage-objekt.
- 547 aktuella Git-originalposter är giltiga; 544 har exakt MEDUSA-Drive-match. 18 korrupta äldre versioner är separat redovisade. Filnamns-SHA ersätter inte faktisk fil-SHA.
- Den råa Drive-manifestfilens SHA-256 matchar exakt PR #119:s registrerade indataproveniens.
- Leveransen granskades för nycklar, signerade URL:er och JWT. Inget hemlighetsfynd identifierades. En bred JWT-liknande regex träffade en del av ett vanligt Drive-ID, utan JWT-struktur; det är inte en credential.
- Objektpaths, Drive-ID och registerreferenser är förväntat inventarieunderlag i den redan publicerade PR:n. Inga nya privata bilder eller autentiseringsuppgifter publiceras av KERBEROS.

## Samtidigt arbete

Öppna PR:er vid kontrollen: #119 MEDUSA-SHA, #118 MEDUSA inventory, #113 HERMES checkout/batches, #101 SISYPHUS, #95 CI cleanup, #45 HERMES 3 foundation och #31 race rules. Issue #114 lästes tillsammans med #120. Inga av dessa grenar integrerades, startades eller ändrades; KERBEROS bygger på main.
