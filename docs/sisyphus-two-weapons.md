# SISYPHUS – föranalys och verifiering

## Utgångsläge, före implementation (2026-10-19)

- Lokal, ren checkout: `236ac809`, version `0.35.239`. Separat branch:
  `codex/sisyphus-two-weapons`; inget extra worktree.
- GitHub main kontrollerad via kopplingen: `8aeead5a11d925442b906dd9c6847f11660a9484`.
  Jämförelsen innehåller tio commits och bara HERMES-original/bildköfiler, inga
  skillnader i programkod, tester eller migrationer. Efter att nätverksåtkomst aktiverats för Git-kommandot hämtades main och
  utvecklingsbranchen flyttades fram med fast-forward till detta SHA. Ingen HERMES-fil ingår i uppdragets ändringar.
- Full Vitest-körning: **1 288 tester, 1 259 godkända, 29 misslyckade, inga överhoppade**.
  Maskinläsbar före/efter-jämförelse sparas separat. Historikens 29 fel råkar alltså
  stämma med dagens mätning, men användes inte som testresultat.

## Vad som finns och kan återanvändas

- `currentEquipment.leftHand/rightHand`, föremålens `equipId`, `kind`, `itemId`,
  `hands` och `primaryHand` beskriver utrustningen. Utrustningsväljaren kan redan
  lägga ett tvåhandsvapen i båda handplatserna och visa en sammanhängande ram.
- `baseGroup` och SQL `rule_strength_group` omvandlar rå STY till STY-grupp.
- SQL `rule_weapon_grip(text,integer,integer)` definierar fattningen. Funktionen
  verifierades med en läsfråga mot den anslutna databasen; originalmigrationen
  `20261004_rule_weapon_mechanics.sql` stämmer med den publicerade definitionen.
  Bastardsvärd/krav 4 ger för grupper 2–6: oanvändbar, 2H/GL ½, 2H, 1H, 1H.
- Vapen-FV går via `characterWeaponSkillTarget`; färdigheter sparas i rollpersonens
  `skills` med `skillId`, `fv`, `erf`. Registret innehåller `tva_vapen`, BC 0.
  Dess beskrivning bekräftar två attacker, attack/parering, två pareringar,
  sen andraattack, handordning, specialiseringar och −15 för otränad kombination.
- NPC:s handplacering och `ambidextrous`, tillfälliga tappade/förstörda vapen,
  `combatant_effects`/`combatEffectiveAttribute`, ammunition, räckvidd, LoS,
  skada och pareringsresultat finns redan.
- `combat_actions` har fria `slot_key`, JSON `source_data`/`result`, status och
  reaktionskopplingar. Ångra i `src/main.js` kopierar alla slots och kombatantstate.
  Initiativordningen och SR-övergången finns i runtime. Spelarvyn pollar stridens
  `updated_at`; nya skrivningar måste därför signalera ändringen på instansen.

## Delvis implementerat / saknas

- Klientens `weaponGripRule` avviker från SQL för 1–2H med en STY-grupp.
  Nuvarande tester låser detta fel; de behöver korrigeras mot verifierad SQL.
- Huvudhand använder utrustningens äldre huvudhandsfält; `derived.Svärdshand`
  överförs inte. Ambidextri finns hos NPC men ger inte i sig extra handlingar.
- Stridens vapenurval kontrollerar handreferenser och tappat/förstört men inte
  faktisk fattning/STY. Profilens reservväg tappar delar av handinformationen.
- Automatiska fattningsreparationer vid inläsning/modalöppning kan skriva om
  permanent utrustning. De ska ersättas med en beräknad, tillfällig vy.
- Ingen generell modell för vapenkombinationsspecialiseringar finns. Utöka
  befintlig färdighetsrad med `specializations` (mastervapen, ordnade efter
  svärds-/sköldhand; oordnade vid ambidextri), utan parallellt färdighetsregister.
- Endast primär handling används. Närstridsattack/parering saknar gemensam
  atomisk reservation; dubbelklick och två klienter kan nå samma planerade rad.
  Det finns inga dubbla aktiva primär-/sekundärslots i den kontrollerade databasen.
- Magi och full rörelse ska fortsätta kräva den ordinarie handlingen och får
  aldrig använda sekundärslot. Otränad färdighet (BC 0/FV saknas) ger ingen bonus.

## Planerade ändringar

- Ren, testbar regelmodul i `src/features/combat/`: handnormalisering,
  SQL-identisk fattning, aktuell handvalidering, kombination/FV och sloturval.
  Klassiskt laddad brygga så statisk hosting fungerar oberoende av DiceBox.
- `legacy/app.js`: delegera fattning, visa beräknad utrustning, bevara lagrad
  utrustning vid läsning; behåll uttryckliga utrustningsval och färdighets-FV.
- `features/combat/runtime.js`: överför hand/skills, kontrollera effektiv STY och
  tillfälligt state, separata handlingar/reaktioner och en sen attackpassage i
  befintlig initiativordning; återanvänd anfall/skada/ammunition/effekter.
- Ny migration: skyddade slots, transaktionell planering/reservation och
  ändringssignal för synkronisering. Befintliga migrationer ändras inte och
  migrationen körs inte i produktion.
- Smal ARCANE-panel med befintliga knappar och hand-/FV-/handlingsstatus;
  specialiseringar redigeras på befintlig färdighetsrad. Inga nya illustrationer.
- Versionsetiketter och cacheversioner uppdateras för berörda resurser.

## Verifieringsplan

- Automatiska regelmatriser för 1H/1–2H/2H, null/äldre värden, STY-grupper,
  GL och Bastardsvärd. Jämför med den verkliga SQL-funktionens läsresultat.
- Testa alla handpreferenser, tvåhandskonflikter, sköld, tomma händer, byte,
  tappat/förstört, effektiv STY, tränad/otränad kombination och avsaknad av FV.
- Integrationsprov för separata attacker/pareringar, sen attackordning för flera
  deltagare, samma SR/ny SR, kvarstående förbrukning, omladdning och ångra.
- Testa databasreservationer och konkurrerande klienter i en lokal testdatabas
  om miljön stödjer det; redovisa annars exakt verifieringsgräns.
- Riktat Chromium-prov med faktisk runtime och simulerad transport. Detta ska
  beskrivas som ett lokalt integrationstest, inte som godkänd produktionstestning.
- Kör riktade tester, hela testsviten och standardbygget. Redovisa befintliga fel
  separat och använd `vite build --minify=false` om standardminifieringen fallerar.
- Efter merge krävs migration i godkänd miljö samt två inloggade SL-/spelarvyer
  mot riktig Supabase för slutlig synkroniserings- och åtkomstverifiering.

## Levererad implementation, v0.35.270

Handnormalisering, faktisk fattning och kombinationskontroll är samlade i
`src/features/combat/hand-rules.js`. `weaponGripRule` delegerar dit. Befintlig
`baseGroup` används för STY; 297 giltiga fattningsfall har jämförts automatiskt
med den exekverade, ursprungliga SQL-funktionen. Ett saknat styrkekrav omvandlas
inte längre till grupp 0.

`derived.Svärdshand` överförs med färdigheterna till `attack_profile` och läses
även från aktuella rollpersonsdata. Utrustningen flyttas inte när preferensen
ändras. Stridens aktuella rollpersonsdata läses en gång vid uppdatering, aldrig
vid varje render. Tappade/förstörda vapen, tillfällig handutrustning och effektiv
STY från befintliga effekter ingår i varje ny kontroll.

Två vapen använder den befintliga färdighetsraden `skillId: tva_vapen` och dess
`specializations: [{swordWeaponId, shieldWeaponId, fv?}]`. Vapen anges med
master-ID, eller namn för ett äldre fristående vapen. För ambidextri matchas
paret i båda ordningar. FV för en handling är det lägsta av vapenfärdighetens FV
och specialiseringens FV (annars färdighetens FV minus 15). Saknad träning/BC 0
ger ingen extra handling; ett slutligt FV som inte är positivt får inte slås.
Slagsmål används för obeväpnad strid, med sitt registrerade FV och BC.

En transaktion planerar två rader i `combat_actions`: `primary` och `secondary`.
Hand och vapen är låsta till respektive rad. Attack/attack får en separat sen
passage i samma SR, i befintlig initiativordning. Attack/parering och två
pareringar behåller separata reservationer till respektive inkommande attack.
Magi, Antimagi, full förflyttning och en redan påbörjad besvärjelse kan inte
använda en bonusplats från Två vapen.

En unik slotnyckel och atomiska serverreservationer skyddar mot dubbelklick och
konkurrerande klienter. Servern kontrollerar utrustning, effektiv STY, färdighet,
hand, aktuell SR/tur och reaktionskoppling före slaget. Ammunition förbrukas via
den befintliga funktionen i samma transaktion som handkontrollen. Turbyte
spärras under pågående slag/reaktion. En osäker avbruten resolution lämnas
reserverad tills SL uttryckligen ångrar den; ett nätverksfel återöppnar inte
automatiskt en potentiellt redan skadande attack.

Ångra har fått en separat checkpoint före handlingen. Att ångra andra attacken
eller pareringen behåller den första handlingens resultat. Det befintliga stödet
för att ångra föregående drag finns kvar. Ångrad ammunition återbetalas högst en
gång. Tillfällig handutrustning sparas i `combatants.state.equipment_override`;
permanent handplacering och preferens behålls.

ARCANE-panelen visar händer, svärdshand, faktisk fattning, GL ½, FV/modifikation,
vald kombination, återstående/förbrukade handlingar och nästa vapen. Befintliga
knappar och bilder återanvänds. Specialiseringar redigeras i det befintliga
färdighetskortet. Spelarvyn följer instansens ändringstid; skrivande
stridshandlingar hanteras fortsatt av SL enligt projektets befintliga behörigheter.

## Ändrade filer

| Fil | Funktion |
| --- | --- |
| `src/features/combat/hand-rules.js` | Gemensamma rena hand-, fattnings-, FV- och kombinationsregler. |
| `legacy/app.js` | Gemensam fattning, beräknad utrustningsvy, validering före byte; automatiska permanenta fattningsreparationer tas bort. |
| `features/combat/runtime.js` | Profiler, handlingsslots, reaktioner, aktuell utrustning/STY, sen attackpassage, atomiska anrop, gränssnitt och synkronisering. |
| `src/main.js` | Ångra en handling, rätt turfas, återbetalning av ammunition. |
| `features/combat/two-weapons.css` | Avgränsad presentation av hand- och handlingsstatus med befintliga komponenter. |
| `features/skills/two-weapons.js` | Läsa/spara specialiseringar på befintlig färdighetsrad. |
| `supabase/migrations/20261019091740_sisyphus_two_weapons.sql` | Unik aktiv slot, profilprojektion, atomisk planering/reservation/turbyte/utrustning, återbetalning och ändringssignaler. |
| `index.html` | Laddningsordning, nya resurser, versionsetiketter och releasecache. |
| `features/material/library.js` | Enbart tre importers cacheversion, i enlighet med befintliga releasekontroller. |
| `vite.config.js` | Kopiera den klassiskt laddade regelmodulen även till produktionsbygget. |
| `package.json`, `package-lock.json` | Version 0.35.270; inga ändrade npm-beroenden. |
| `tests/sisyphus-hand-rules.test.js` | Regelmatris, handpreferens, utrustningskonflikter, specialiseringar/FV. |
| `tests/sisyphus-combat-runtime.test.js` | Riktig runtime: profiler, reaktioner, effekter, rörelse/magi, sen ordning, reload och Ångra. |
| `tests/weapon-grip-equipment.test.js` | Tidigare felaktiga förväntningar korrigeras mot verifierad SQL. |
| `tests/architecture.test.js`, `tests/bjorn.test.js` | Uppdaterade beroenden/kontrakt för gemensam regelberäkning och reservationsstatus. |
| `tests/combat-ammunition-master.test.js`, `tests/weapon-projectile-linking.test.js` | Kontrollerar att den nya transaktionen fortfarande anropar befintlig ammunition. |
| `scripts/test-sisyphus-postgres.py` | Isolerad PostgreSQL: faktiska migrationer, identitets-/RLS-prov, konkurrens, ammunition och SQL-paritet. |
| `scripts/test-sisyphus-browser.py` | Chromium med riktig runtime/Ångra och lokal SQL-transport. |
| `scripts/requirements-sisyphus-test.txt` | Exakta Python-testberoenden. |
| `.github/workflows/sisyphus-two-weapons.yml` | Reproducerbara riktade JS-, PostgreSQL- och Chromium-kontroller. |
| `.gitignore` | Ignorera lokala testdatabaser och provresultat. |
| `docs/sisyphus-two-weapons.md` | Föranalys, implementation, verifiering och införande. |

## Databasmigration och införande

Migrationen är **inte körd i produktion**. Den lägger inte till tabeller och
ändrar inga befintliga tillämpade migrationer eller rollpersonsdata. De nya
RPC-funktionerna använder `SECURITY INVOKER`, befintlig SL-behörighet och
begränsad `search_path`; anonym anropning är återkallad. En privat trigger med
`SECURITY DEFINER` behövs enbart för att uppdatera stridens tidsstämpel efter ett
RLS-godkänt spelarbyte i rollpersonens data. Den exponerar ingen ny skrivbehörighet.

CLI-generering av den tomma migrationsfilen provades. Miljöns aktuella wrapper
krävde en skrivbar hemkatalog och den tillgängliga Go-delen saknade
`migration`-kommandot. Filen skapades därför med uppmätt UTC-tidsstämpel enligt
projektets befintliga namnstandard och hela SQL-filen exekverades i lokal PostgreSQL.

Före införande: kontrollera att aktiva slots är unika, tillämpa migrationen i en
godkänd testmiljö och prova frontend och migration tillsammans. En installation
med äldre schema saknar de nya RPC-anropen. Migreringen avbryter vid historiska
dubbletter; den tar inte bort stridshistorik för att kringgå ett sådant fel.

## Verifieringsgräns och manuellt godkännande

PostgreSQL-proven använder riktiga migrationers tabeller/funktioner och
konkurrerande anslutningar. Kampanj-/identitetsfunktionerna är isolerade
testdefinitioner, inte riktiga Supabase-sessioner. Chromium använder riktig
stridsruntime, skadeuppdatering och Ångra mot den lokala databasen, med
deterministiska tärningar och en lokal HTTP-adapter. Geometri/LoS,
träffområdesslag, XP, VFX och områdeseffekter ersätts i just detta browserprov;
deras befintliga tester ingår i fullsviten. Detta är inte ett produktionsprov.

Efter granskning/merge återstår:

1. Kör migrationen först efter godkännande och kontrollera befintliga kampanjers
   behörigheter samt SQL-rådgivare i den godkända miljön.
2. Öppna samma teststrid med riktiga inloggade SL- och spelarkonton. Kontrollera
   reaktioner, polling och omladdning i båda vyerna.
3. Prova höger/vänster/ambidextri, Bastardsvärd vid STY-grupper 2–6 samt tränad
   och otränad kombination mot den avsedda Expert-regeltolkningen.
4. Prova alla tre kombinationer med fler än en tvåvapenkombattant, dra/tappa/
   förstör/byta hand, ÖKA/MINSKA, ammunition och Ångra per handling.
5. Kontrollera den riktiga ARCANE-panelen på dator/mobil med kampanjens bilder,
   riktiga räckvidder/LoS, rustning, magi/Antimagi, förflyttning, NPC och monster.
6. Jämför publicerad version/commit med PR:n. Standardminifieringen och de 29
   dokumenterade befintliga testfelen behöver hanteras innan ordinarie releasecheck
   kan räknas som grön.

## Kör kontrollerna igen

```sh
npm test
npm run build
npx vite build --minify=false
python -m pip install --target /tmp/alea-sisyphus-deps -r scripts/requirements-sisyphus-test.txt
export PYTHONPATH=/tmp/alea-sisyphus-deps
export SISYPHUS_WORK_DIR=/tmp/alea-sisyphus
python scripts/test-sisyphus-postgres.py
python scripts/test-sisyphus-browser.py
```

Browserprovet använder systemets Chromium om det finns; annars installera
Playwrights Chromium med `python -m playwright install chromium` först.


## Uppmätta slutresultat (2026-10-19)

| Kontroll | Före | Efter |
| --- | --- | --- |
| Full Vitest-svit | 1259 godkända / 29 fel av 1288 | 1323 godkända / 29 fel av 1352 |
| Nya Vitest-tester | – | 64 godkända |
| Nya regressioner | – | 0 |
| Lokal PostgreSQL | – | 45 kontroller godkända, inklusive 297 SQL/JS-fattningsfall |
| Chromium + lokal PostgreSQL | – | 9 kontroller godkända |
| Standardbygge | Även oförändrad main `8aeead5a` ger exit 139 | Exit 139, `Segmentation fault`, efter 95 transformerade moduler |
| `vite build --minify=false` | – | Godkänt; kopierad regelmodul matchar källan |

Inga tester stängdes av eller hoppades över. Befintliga testförväntningar för den
felaktiga fattningsregeln, beroendeinjektion och ammunitionens nya transaktion
uppdaterades; de tidigare 29 misslyckade testfallen är oförändrade.

### Befintliga misslyckade testfall

- `arcane-carousel-v01.test.js` — ARCANE CAROUSEL V01 — independent transparent image trough busts the entire top-level module and stylesheet chain
- `architecture.test.js` — application architecture smoke checks GM can select, play and reset a combat scene
- `architecture.test.js` — application architecture smoke checks Värdshus is a player-facing service checkout
- `character-equipment-image-overrides.test.js` — single-item weapon and shield artwork uses override before register art on character equipment and combat HUD
- `character-round-backgrounds.test.js` — Character-specific round artwork chooses stable per-combatant fallback at scene creation only
- `combat-active-turn-highlight.test.js` — Aktiv kombatants tydliga turmarkering markerar aktuell tur i turordningen utan att ändra andras rader
- `combat-ammunition-master.test.js` — Ammo registry / range weapon linkage GM can choose if projectile recovery is possible, with 80-90 % chance, once per shot
- `combat-dice-proportions.test.js` — Combat DiceBox presentation refreshes affected module and CSS cache paths without altering the dice tray
- `combat-finish-summary.test.js` — Stop combat and after-action report the GM has a stop control in the battle header, not buried in ammunition settings
- `combat-map-portrait-hex.test.js` — Porträtt i hexagonkartan fiende visar sitt riktiga porträtt i en rödmarkerad hexagon
- `combat-map-portrait-hex.test.js` — Porträtt i hexagonkartan SLP visar registrerat porträtt i blåmarkerad hexagon
- `combat-map-portrait-hex.test.js` — Porträtt i hexagonkartan spelarens befintliga porträtt är fortfarande grönt
- `combat-map-portrait-hex.test.js` — Porträtt i hexagonkartan saknat SLP-porträtt återgår till befintlig kartmarkör
- `combat-map-portrait-hex.test.js` — Porträtt i hexagonkartan mapparen återanvänder samma porträtthämtare som turordningen
- `combat-order-portraits.test.js` — Porträtt i turordning – SLP och fiender SLP visar registrerat porträtt från bildcachen
- `combat-order-portraits.test.js` — Porträtt i turordning – SLP och fiender fiender och monster visar samma lagrade bild som i administration
- `combat-order-portraits.test.js` — Porträtt i turordning – SLP och fiender om bilden inte förladdats hämtas den och turordningen ritas om
- `combat-order-portraits.test.js` — Porträtt i turordning – SLP och fiender saknat porträtt visar initialer, medan rollpersonens bild är oförändrad
- `combat-order-portraits.test.js` — Porträtt i turordning – SLP och fiender porträtt fungerar utan förladdat SLP-/fienderegister
- `combat-order-portraits.test.js` — Porträtt i turordning – SLP och fiender ny strid sparar bildsökvägarna i kombatanternas state
- `combat-parry-drawer.test.js` — Responsive parry reaction outside the attack panel offers no drawer if no legal reaction is pending and preserves Expert rules
- `combat-perfect-armor.test.js` — Perfect hit penetrates armor v0.35.32 perfect Kastspjut hits for 7 without the 5-point ring mail, and flags bypass in event log
- `combat-perfect-armor.test.js` — Perfect hit penetrates armor v0.35.32 a special strike has maximum damage but does NOT bypass armor
- `combat-perfect-armor.test.js` — Perfect hit penetrates armor v0.35.32 ordinary strike subtracts armor, but wards still apply to perfect strikes
- `goose08-arcane-mechanics.test.js` — GOOSE 08 – non-destructive arcane mechanism layers keeps the original three HERMES sprites and role-gated shared gallery
- `material-live-preview.test.js` — Frodo — GM preview of currently shared material mount code authorizes SL before selecting an active picture and offers full-size viewer
- `material-native-pages-bootstrap.test.js` — GitHub Pages native material bootstrap loads material independently of the dice-box module entry
- `section-help-ui.test.js` — Shared section information component keeps each provision on one horizontal row and moves guidance behind the help icon
- `skill-art-android-picker.test.js` — Android DocumentsProvider skill-art upload shows uploaded file feedback atop the editor with cache-busted assets

Standardbyggets fel reproducerades även med oförändrad main i en separat materialiserad byggfixture (inte ett Git-worktree). Implementationscommit: `7d07f90abd9df8c6a527f86ee337a610c034e24e`.
