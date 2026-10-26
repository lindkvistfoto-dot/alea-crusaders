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

**Körning:** ej utförd från den här Work-sessionen. GitHub-connectorn kan skapa branchfiler men ger inte en körmiljö för `npm test`; ingen CI-körning har bekräftats. Markeringarna “Ej körd” i matrisen är avsiktliga. Kör från repo-checkout med `npm test -- tests/arcane-spellforge.test.js` när testgrenen körs i GitHub CI eller repositoryns vanliga miljö.

### Täckning

- Registerrader: 91/91 finns i fryst fixture och kommer att testas parametervist.
- Kastningspreflight: varje rad får 3 fall (EG 1, PSY 0, EG 0).
- Explicita stridskontroller: 7 grupper av deterministiska tester.
- Inte täckt i körd simulering ännu: faktiska tärningsresultat/perfekt/misslyckande, målval, hexgeometri, områdesgränser, avstånd, förberedelse/avbrottslivscykel, antiframes, samtidiga effekter, verkan över tid och återställning. Skälet är att sviten ännu inte körts och dessa fall kräver mer av runtime-kontraktet eller isolerad test-double-data.
- Expertjämförelse: grundläggande kastningsregler på s. 3–5 är nu verifierade. Fullständig spell-för-spell jämförelse mot s. 8–37 återstår; registerluckor har därför inte fyllts med antaganden. S. 40–47 används inte som Expert-underlag.

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
| ANTIMAGI | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| SKINGRA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| VARSEBLIVNING | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| BESKYDDARE | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 0/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| FINNA VATTEN | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| RENA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SPÅRLÖS | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| MINSKA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 1/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| ÖKA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 1/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| VÄDERFÖRUTSÄGELSE | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| VINDKONTROLL | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| FÖRÄNDRA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| HELA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| REGNSTART | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| REGNSTOPP | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| DIMMA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| SNABBVÄX | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| HÄVA FÖRSTENING (F, R) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| VÄDERKONTROLL (R) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| TILLKALLA VARELSE | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| TALA MED VARELSE | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| KONTROLLERA VARELSE | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| FÖRBANNA VAPEN | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ÖPPNA (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| FRAMMANA/SKICKA BORT ELEMENTAR – LUFT (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| FRAMMANA/SKICKA BORT ELEMENTAR – JORD (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| FRAMMANA/SKICKA BORT ELEMENTAR – VATTEN (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 2/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| VATTENVÄG | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| JORDVÄG | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| LUFTVÄG | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| LJUSVÄG | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| MÖRKERVÄG | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| KÖLDVÄG | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ÅTERVINNA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ORIENTERING | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SPRÅNG (K) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| MOTSTÅNDSKRAFT | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| BALANS | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| HJÄRNBLANK | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| HÖRSEL | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SNABBHET | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| LÅNGSAMHET | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| LUNGFILTER | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| FLYGA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| LYFT | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| MÖRKERSYN | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ÖGONMÅTT | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| OSYNLIGHET | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SYN | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SANNSYN | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SANNHÖRSEL | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| TELEPORTERA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| MAGISK SYN | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| MINNE | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ORÄDD | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ÅTERVÄNDO | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ÅTERVÄNDO MED STUDS | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SINNESMASK | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| AVBILD (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| DISTRAKTION (K) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| STENVÄGG (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| GASMOLN (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| BLIXT (F, K) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| ENERGISTRÅLE (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| ELD (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| FÖRSEGLA (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| FROST (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| MÖRKER (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SNUBBLA (K) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| FÖRVIRRA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| FÖRROLLAD SÖMN | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| TYSTNAD (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ILLUSION (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| AURA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| FATA MORGANA (STOR ILLUSION) (F, R) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| BESUDLA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| PARALYSERING | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| KONTROLLERA LÄGRE ODÖD | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| RÄDSLA (K) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| BLIDHET | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| TALA MED DÖD | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| ANIMERA DÖD (R) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| PANIK | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Partiell automatisering · körning väntar |
| KONTROLLERA ANDAR | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| SMÄRTA | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| TERROR | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| DÖDSHAND (F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| KONTROLLERA HÖGRE ODÖD | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| VOODOORITUAL (K, F) | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
| LIVSUTTÖMNING | Snapshot + profil + preflight × 3 | Ej körd | Ej körd | 3/3 mål/effekt/motståndsfält tomma | Manuell SL-effekt · körning väntar |
