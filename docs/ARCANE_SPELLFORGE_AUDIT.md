# OPERATION ARCANE SPELLFORGE — diagnostisk delrapport

**Projekt:** Alea Crusaders  
**Repository:** [lindkvistfoto-dot/alea-crusaders](https://github.com/lindkvistfoto-dot/alea-crusaders)  
**Ärende:** [#297](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/297)  
**Gren:** `test/arcane-spellforge-simulation`  
**Registeruttag:** 2026-10-25 från Supabase `wbmosmkirsitkonejzpg.public.rule_spells`  
**Omfattning:** skrivskyddad diagnos. Ingen magiregel, produktionsrad eller spelmekanik har ändrats. Se även [Expertregelgranskningen](ARCANE_SPELLFORGE_EXPERT_RULE_REVIEW.md), som tillför bokunderlag och korrigerar den ursprungliga källstatusen.

## Sammanfattning av registerkontroll

| Kontroll | Utfall |
|---|---:|
| Registrerade besvärjelser | 91 |
| Tomt `target_text` | 84 |
| Tomt `effect_per_eg` | 88 |
| Tomt `resistance_text` | 90 |
| Tom `description` | 0 |
| Saknad/ogiltig skola | 0 |
| Ogiltig `target_type` | 0 |

De tomma fälten är datakompletteringsfynd, men kan inte automatiskt likställas med regelbrott: en del förmågor kan sakna motstånd, beskrivas i löptext eller kräva SL-bedömning. Varje sådan klassificering behöver jämföras med ett verifierbart Expert-underlag. Appens `target_type` räknas som en UI-/stridsdeklaration och ersätter inte regeltext om mål eller område.

## Kodinventering

- `features/combat/runtime.js` definierar en effektprofil, kastningsregler och `combatMagicBinding`.
- Kända bindings finns för skada, helning, Beskyddare, dimma, vissa tillstånd, Flyga samt grundegenskaperna Öka/Minska. Elementarframbesvärjning har särskild stridskod.
- Flera bindings skapar ett effekt-/tillståndsunderlag medan specialeffekt, numeriskt värde, varaktighet eller återhämtning lämnas åt SL. `supported: true` betyder i dessa fall att kastslingan kan fortsätta med manuell lösning, inte att regeln är fullständigt automatiserad.
- Kastningsprofilen kodar 1 PSY per EG, −2 CL per EG efter första och ett SR till upplösning för icke-kvicka besvärjelser. Koden anger också att normala besvärjelser löses nästa SR och K-besvärjelser omedelbart. Regeljämförelsen för dessa punkter behöver knytas till tillgänglig boktext innan de godkänns som korrekt implementerade.
- Hela, antidispel, samtidiga effekter, avslut/återställning samt fullständiga avstånds- och områdesgränser har inte validerats mot alla 91 besvärjelser i denna delrapport.

## Regelunderlagets tillgänglighet

Regelbilderna har nu verifierats: *Drakar och Demoner Expert, Magi*, s. 2–37. S. 40–47 tillhör den separata svarta grundboken. Sidorna 3–5 ger primärkälla för centrala kastningsregler; verifierade skillnader redovisas i [Expertregelgranskningen](ARCANE_SPELLFORGE_EXPERT_RULE_REVIEW.md). En komplett rad-för-rad korsreferens mellan samtliga 91 registerdefinitioner och s. 8–37 återstår.

## Automatiserad svit

`tests/arcane-spellforge.test.js` använder endast lokal Vitest och en JSON-ögonblicksbild. Den innehåller ingen Supabase-client, fetch eller skrivfunktion. Den parametriserar varje registrerad besvärjelse genom effektprofil och kastningskontroll vid giltig EG, otillräcklig PSY och ogiltig EG; därutöver testar den CL/PSY-skalning, kvick/normal upplösning, FV-gräns, skadeformel, helning, Beskyddare och manuell fallback.

**Körning:** [GitHub Actions CI #40253814291](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/40253814291) körde hela projektets `npm run check`. Vitest körde 237 testfiler: 1 661 tester godkändes och 3 Expert-regressionstest misslyckades (udda EG vid perfekt, fummel, död vid 0 PSY). Byggsteget kördes inte eftersom `npm run check` avbryts vid testfel. Testerna använder fixture och mocks; inga kampanjer, rollpersoner eller produktionsrader ändrades.

### Täckning

- Registerrader: 91/91 fixtureposter testade separat; alla 91 profil-/preflight-fall godkändes i CI. Varje fall kontrollerar tre preflightlägen: EG 1 med PSY, otillräcklig PSY och EG 0.
- Utfallsregler: vanligt misslyckande godkänns; perfekt udda EG, fummel-kostnad och död vid 0 PSY misslyckas mot Expert s. 4–5.
- Hela projektet: 236/237 testfiler godkändes, totalt 1 661/1 664 tester. Alla tre kända fel ligger i nya Spellforge-regressionstest.
- Inte täckt ännu: fulla tärningskast genom UI, Snedtändningstabellens följder, självuppoffrande kast, målval/hexgeometri och områdesgränser per besvärjelse, avståndsgränser, avbrott genom skada, simultana effekter, varaktighet/återställning samt effekter utanför strid. Befintliga tester träffar delar av målval, SR1/SR2, antimagi, resultatkort och manuell upplösning, men är inte en full end-to-end-regelsimulering.
- Expertjämförelse: s. 3–5 kastningsregler verifierade; full spell-för-spell korsreferens mellan s. 8–37 och alla 91 registerrader återstår. Saknade värden fylls inte genom antaganden. S. 40–47 används inte som Expert-underlag.

## Fynd med reproduktionssteg

### SF-DATA-001 — kärnfält saknas i registerdefinitioner

- **Klassificering:** P2 · datafel/ofullständig definition.
- **Förväntat beteende:** Varje besvärjelse har tillämpliga mål- och effektuppgifter. Motståndsregeln anges om sådan finns; annars dokumenteras att motstånd inte gäller eller att regeln är oklar.
- **Faktiskt beteende:** Av 91 rader saknar 84 `target_text`, 88 `effect_per_eg` och 90 `resistance_text`. Beskrivning finns på samtliga rader. Skolreferenser och måltyper är giltiga.
- **Reproducerbart testfall:** Läs-only SQL: `select count(*) filter(where btrim(target_text)=''), count(*) filter(where btrim(effect_per_eg)=''), count(*) filter(where btrim(resistance_text)='') from public.rule_spells;` För spell-specifika exempel: `select spell_key,name,target_text,effect_per_eg,resistance_text from public.rule_spells where btrim(effect_per_eg)='';`
- **Sannolik grundorsak:** Fälten har inte fyllts för majoriteten av raderna, medan innehållet huvudsakligen ligger i beskrivning/anteckningar eller är avsett för SL.
- **Föreslagen åtgärd:** Jämför per rad mot kontrollerad Expert-källa; registrera tydligt tillämplighet/oklarhet. Ingen produktionsändring i denna operation.
- **Prioritet:** P2, datakomplettering styrd av källkontroll.

### SF-CODE-001 — generisk manuell fallback gör automationens omfattning oklar

- **Klassificering:** P2 · saknad funktionalitet eller avsiktlig SL-lösning (designfråga).
- **Förväntat beteende:** Besvärjelsens verifierade effekt ska antingen kunna hanteras av kod eller uttryckligen markeras som avsiktligt manuell SL-lösning.
- **Faktiskt beteende:** `combatMagicBinding` returnerar `kind:'manual', supported:true` för omappade namn. Kastslingan kan därmed fortsätta trots att ingen automatisk effekt tillämpas. Besvärjelser som FINNA VATTEN visar samma generiska fallback. `supported:true` anger inte att hela effekten är automatiserad.
- **Reproducerbart testfall:** I Vitest-kontekst, anropa `combatMagicBinding({name:'FINNA VATTEN'})`; kontrollera `kind === 'manual'` och `supported === true`. Inga kampanj- eller stridsrader krävs.
- **Sannolik grundorsak:** Automatisk effektbindning är begränsad till utpekade spell-profiler; okända effekter är avsiktligt reserverade för SL.
- **Föreslagen åtgärd:** Lägg till ett explicit automationsläge per besvärjelse (automatisk, manuell SL, blockerad av oklar regel) efter design-/källgenomgång. Utöka därefter sviten med verkanstest för respektive vald automationsnivå.
- **Prioritet:** P2 tills avsikten är fastställd; höjs till P1 för spells som beslutas behöva automation men inte kan användas korrekt.

### SF-RULE-001 — Expert-regelkälla kunde inte verifieras

- **Klassificering:** P3 · regeloklarhet/underlagslucka.
- **Förväntat beteende:** Varje förväntat resultat bygger på tillgänglig, identifierad Expert-regeltext.
- **Faktiskt beteende:** Ingen regelbok hittades i Library-sökningen. Koden kommenterar kastningskostnad/timing med en hänvisning till Expert Magiboken s. 3–5, men själva källan kunde inte granskas. Därför har lyckat/misslyckat/perfekt resultat, flera mål, räckvidd/area, varaktighet och interaktioner inte bedömts mot en auktoritativ text.
- **Reproducerbart testfall:** Upprepa Library-sökningen på “Drakar och Demoner Expert magiboken besvärjelser”; ingen verifierbar regelkälla returneras.
- **Sannolik grundorsak:** Regelunderlaget är inte tillgängligt i projektets anslutna filer.
- **Föreslagen åtgärd:** Tillför relevant, tillåten regelreferens eller sidangivna utdrag till arbetsflödet; håll oklara delar markerade tills dess.
- **Prioritet:** P3 som underlagslucka; blockerar regelriktiga acceptanskriterier.

## Felklassificering och prioriterad åtgärdslista

1. **P1 · Saknad funktionalitet / kod och regelverifiering:** Effektdefinition saknas eller körs manuellt för flertalet spells. Inventera varje binding mot verifierat Expert-underlag innan automation byggs.
2. **P2 · Datafel eller ofullständig definition:** 88/91 saknar `effect_per_eg`, 84/91 saknar `target_text`, 90/91 saknar `resistance_text`. Fyll endast när källregeln bekräftar värdet; annars dokumentera “ej tillämpligt” eller regeloklarhet med explicit status i ett separat dataarbete.
3. **P2 · Saknad funktionalitet:** Bygg isolerade scenariotester för mål/avstånd/områden, antimagi, varaktighet, avbrott, simultanitet och integrationer innan implementationen ändras.
4. **P3 · Regeloklarhet:** Special-, ritual-, koncentrations-, permanent- och omedelbar-varaktighet kräver verifierad tolkning. Lämna dem som öppna frågor till regelunderlag/SL.

Inga P0-fynd identifierade i den skrivskyddade inventeringen. P1 avser bredden i ofullständig effektautomation; ingen specifik besvärjelse kan klassas som spelbrytande utan fullständiga reproduktionskörningar.

## Granskningsmatris per besvärjelse

Statuskolumnen beskriver statisk kodinventering, inte ett godkänt funktionstest. “Partiell automatisering” betyder att en specifik kodväg finns; det bekräftar inte regelriktig effekt eller end-to-end-resultat. Tomma fält anges som antal av de tre kärnfälten: mål, effekt per EG, motstånd.

| Besvärjelse | Planerade fall | Godkända | Fel | Saknad data | Status |
|---|---|---|---|---|---|
| ANTIMAGI | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| SKINGRA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| VARSEBLIVNING | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| BESKYDDARE | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 0/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| FINNA VATTEN | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| RENA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SPÅRLÖS | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| MINSKA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 1/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| ÖKA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 1/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| VÄDERFÖRUTSÄGELSE | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| VINDKONTROLL | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| FÖRÄNDRA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| HELA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| REGNSTART | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| REGNSTOPP | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| DIMMA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| SNABBVÄX | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| HÄVA FÖRSTENING (F, R) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| VÄDERKONTROLL (R) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| TILLKALLA VARELSE | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| TALA MED VARELSE | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| KONTROLLERA VARELSE | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| FÖRBANNA VAPEN | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ÖPPNA (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| FRAMMANA/SKICKA BORT ELEMENTAR – LUFT (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| FRAMMANA/SKICKA BORT ELEMENTAR – JORD (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| FRAMMANA/SKICKA BORT ELEMENTAR – VATTEN (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| VATTENVÄG | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| JORDVÄG | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| LUFTVÄG | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| LJUSVÄG | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| MÖRKERVÄG | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| KÖLDVÄG | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ÅTERVINNA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ORIENTERING | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SPRÅNG (K) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| MOTSTÅNDSKRAFT | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| BALANS | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| HJÄRNBLANK | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| HÖRSEL | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SNABBHET | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| LÅNGSAMHET | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| LUNGFILTER | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| FLYGA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| LYFT | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| MÖRKERSYN | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ÖGONMÅTT | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| OSYNLIGHET | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SYN | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SANNSYN | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SANNHÖRSEL | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| TELEPORTERA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| MAGISK SYN | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| MINNE | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ORÄDD | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ÅTERVÄNDO | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ÅTERVÄNDO MED STUDS | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SINNESMASK | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| AVBILD (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| DISTRAKTION (K) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| STENVÄGG (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| GASMOLN (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| BLIXT (F, K) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| ENERGISTRÅLE (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| ELD (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| FÖRSEGLA (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| FROST (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| MÖRKER (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SNUBBLA (K) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| FÖRVIRRA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| FÖRROLLAD SÖMN | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| TYSTNAD (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ILLUSION (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| AURA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| FATA MORGANA (STOR ILLUSION) (F, R) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| BESUDLA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| PARALYSERING | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| KONTROLLERA LÄGRE ODÖD | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| RÄDSLA (K) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| BLIDHET | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| TALA MED DÖD | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| ANIMERA DÖD (R) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| PANIK | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · effekt ej verifierad |
| KONTROLLERA ANDAR | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| SMÄRTA | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| TERROR | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| DÖDSHAND (F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| KONTROLLERA HÖGRE ODÖD | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| VOODOORITUAL (K, F) | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
| LIVSUTTÖMNING | Snapshot + profil + preflight × 3 (CI) | 3/3 preflight | Globala PSY-fynd; effekten ej testad | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · effekt ej verifierad |
