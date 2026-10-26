# ARCANE SPELLFORGE — Expertregelgranskning

**Projekt:** Alea Crusaders  
**Ärende:** [#297](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/297)  
**Gren:** `test/arcane-spellforge-simulation`  
**Källkontroll:** användarens uppladdade Drakar och Demoner Expert, *Magi*, s. 2–37. S. 40–47 i uppladdningen tillhör den separata svarta grundboken och används inte som Expert-källa här.  
**Registeruttag:** skrivskyddad kontroll av `public.rule_spells`, Supabase-projekt `wbmosmkirsitkonejzpg`, 2026-10-26.  
**Ändringar:** inga regler, spelmekaniker eller produktionsrader har ändrats.

Detta tillägg ersätter den tidigare rapportens uppgift att Expert-regelboken inte fanns tillgänglig. Bildserien visar Expert-avsnittet sammanhängande från s. 2 till 37. Den tidigare upptäckta luckan s. 38–39 ligger mellan de två böckerna och är inte en lucka i Expert-underlaget.

## Verifierade grundregler mot s. 3–5

| Regel | Expert-text | Kodkontroll |
|---|---|---|
| Kostnad vid normalt lyckat kast | 1 PSY per vald effektgrad | Registrerad normal kostnad är 1 PSY/EG; koden debiterar EG |
| Modifiering för högre EG | CL minskar med 2 för varje EG över den första | Koden använder `FV - 2 × (EG - 1)` |
| Vanlig besvärjelse | Effektens följder inträffar nästa SR | Koden lägger normal kastning till nästa SR |
| Kvick besvärjelse (K) | Effekten inträffar samma SR | Koden känner igen K-markering i besvärjelsenamnet |
| Vanligt misslyckande | Ingen effekt; förlorar 1 PSY | Koden debiterar 1 PSY |
| Perfekt slag | Halv PSY-kostnad, avrundning till magikerns fördel, minst 1 PSY | Avvikelse för udda EG: koden använder `Math.ceil` |
| Fummel | Ingen effekt; förlorar hela kostnaden som ett lyckat kast skulle haft och slår på Snedtändningstabellen | Avvikelse: koden debiterar 1 PSY och ingen Snedtändning-hantering hittades i magikastens kodvägar |
| Magikern når 0 PSY | Magikern dör | PSY-avdragets kodväg uppdaterar endast `current_psy`; den markerar inte död |
| Avsiktligt kast under 0 PSY | Expert beskriver en särskild självmordsattack med magi | Preflight och betalning stoppar kast när PSY inte räcker; specialregeln saknar väg i den granskade kastningen |

Kastningstid och återhämtning utanför strid kräver ytterligare genomgång per användningsflöde. Kodkommentaren anger att en vanlig magiker kan kasta en inlärd besvärjelse på en SR; bokens särskilda uppläsning ur formelsamling och ritualernas tidskrav är egna fall.

## Fynd

### SF-RULE-002 — perfekt slag avrundar PSY-kostnad åt fel håll

- **Klassificering:** kodfel · regelavvikelse.
- **Prioritet:** P2.
- **Förväntat:** Halvera PSY-kostnaden; avrunda till magikerns fördel (lägre kostnad), men minst 1 PSY (Expert s. 4).
- **Faktiskt:** `combatMagicPsyCost('perfect', 3)` ger 2 PSY via `Math.ceil(3/2)`; regeltexten ger 1. EG 5 ger 3 i kod, 2 enligt regeln.
- **Reproducerbart fall:** `combatMagicPsyCost('perfect', 3)`; jämför med halvering och nedåtavrundning, min 1.
- **Sannolik orsak:** Implementationen tolkar avrundningen som uppåt.
- **Åtgärd:** Efter separat funktionsgodkännande ändra avrundningen och behåll minimikostnaden 1. Regressionstest finns på testgrenen och förväntas visa avvikelsen.
- **Påverkan:** Magikern betalar 1 PSY för mycket vid perfekt kast på udda EG.

### SF-RULE-003 — fummel behandlas som vanligt misslyckande

- **Klassificering:** kodfel · saknad funktionalitet · regelavvikelse.
- **Prioritet:** P1.
- **Förväntat:** Fummel ger ingen effekt, debiterar hela PSY-kostnaden för ett lyckat kast på vald EG och utlöser Snedtändningstabellen (Expert s. 4).
- **Faktiskt:** `combatMagicPsyCost` ger 1 PSY för alla utfall utom success/special/perfect. De granskade kastvägarna lagrar fummelutfallet och fortsätter till resultat/loggning, men någon Snedtändning-anropning hittades inte i `features/combat/runtime.js`.
- **Reproducerbart fall:** isolerat EG 3-fummel: förväntad kostnad 3 PSY och Snedtändning; aktuell ren kostnadsfunktion ger 1 PSY. Kontrollera en manuell, status- och områdesbesvärjelse.
- **Sannolik orsak:** Fummelgrenarna använder generisk kostnadsfunktion och delar inte närstrids-/avståndsvapnens fummeltabellflöde.
- **Åtgärd:** Lägg till en separat, verifierad magisk fummelupplösning efter godkännande; välj ingen Snedtändningseffekt utan att använda regelunderlaget.
- **Påverkan:** Fummel får för låg kostnad och saknar sin föreskrivna följd.

### SF-RULE-004 — 0 PSY dödar inte kombattanten automatiskt

- **Klassificering:** kodfel · saknad funktionalitet · regelavvikelse.
- **Prioritet:** P1.
- **Förväntat:** När en magikers PSY når 0 dör magikern enligt Expert s. 5.
- **Faktiskt:** `combatSpendMagicPsy` skriver nytt `current_psy`-värde till kombattanten men innehåller ingen dödsövergång eller kontroll för PSY = 0. Exempelvis kan en misslyckad besvärjelse med 1 aktuell PSY dra av den sista poängen utan att sätta kombattanten död.
- **Reproducerbart fall:** isolerad kombattant med 1 PSY, kasta besvärjelse på EG 1 och ge vanligt misslyckande; kontrollera att PSY blir 0 och att `status` inte ändras till död.
- **Sannolik orsak:** Stridsdöd kopplas till KP/skada; PSY-avdraget är en separat uppdatering.
- **Åtgärd:** Efter godkännande lägg till den regelstyrda övergången och kontrollera stridslogg, turordning, effekter och återställning.
- **Påverkan:** Striden kan fortsätta med en magiker som Expert-regeln säger har dött.

### SF-RULE-005 — avsiktligt kast under tillgänglig PSY går inte att utföra

- **Klassificering:** saknad funktionalitet · regelavvikelse.
- **Prioritet:** P2.
- **Förväntat:** Expert s. 5 beskriver en särskild avsiktlig självmordsattack där magikern överskrider tillgänglig PSY och offrar sitt liv.
- **Faktiskt:** `combatMagicCastPreflight` underkänner kostnad över aktuell PSY; `combatSpendMagicPsy` kastar fel om aktuell PSY inte räcker.
- **Reproducerbart fall:** isolerad EG-kostnad högre än aktuell PSY; preflight avvisar kastet innan slaget.
- **Sannolik orsak:** Vanlig säkerhetskontroll används också för den uttryckliga extrema regeln.
- **Åtgärd:** Behandla som ett separat, uttryckligt kastval först efter godkännande; bevara gränsen så det inte sker oavsiktligt.
- **Påverkan:** Den beskrivna sista utvägen går inte att använda i stridssystemet.

## Registerkontroll

Aktuell skrivskyddad kontroll av 91 rader:

| Fält/kontroll | Utfall |
|---|---:|
| Registrerade besvärjelser | 91 |
| `canonical_expert=true` | 91 |
| Saknad beskrivning, räckvidd, varaktighet, PSY-text eller anteckning | 0 i respektive fält |
| Tomt måltextfält | 84 |
| Tom effekt-per-EG-fält | 88 |
| Tomt motståndsfält | 90 |
| Saknat/ogiltigt `target_type` | 0 |
| Saknad/ogiltig skola | 0 |
| `damage_text` saknas | 85 (varav 6 är markerade attackmagi) |
| `kvick=true` | 0, trots sex namn med (K)-markering |
| `ritual=true` | 1, trots fyra namn med (R)-markering |

Markeringarna (K)/(R) finns i namnen och kastningskoden läser markörerna där. Det gör inte de fristående registerflaggorna korrekta: UI, minnesregler eller framtida kod som läser endast `kvick`/`ritual` kan ge annat resultat. **Datafynd, P2:** normalisera dessa flaggor mot s. 4–5 först efter att varje markering har verifierats. De tomma mål-, effekt- och motståndsfälten ska inte fyllas genom gissning. Beskrivning finns på alla rader, men den räcker inte i sig som maskinläsbar effektdefinition.

## Simuleringsstatus och täckning

Testsviten på grenen använder en fryst, skrivskyddad JSON-kopia, ingen Supabase-klient och inga kampanj-/rollpersonsskrivningar. Den parametriserar register- och preflightkontroller för 91/91 besvärjelser. En kompletterad regressionstestsats kodar nu Experts kostnadsregler för misslyckande, perfekt och fummel; två förväntade assertioner blottlägger de kända avvikelserna (perfekt udda EG och fummel).

Befintliga Vitest-filer i projektet omfattar bland annat målval, SR1/SR2, antimagi, manuella effekter, resultatkort och förberedelse-UI. Källgranskning av testfilerna hittade riktade testfall för dessa gränssnitt och vissa isolerade upplösningar.

**Körning:** [GitHub Actions CI #40253814291](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/40253814291) körde `npm run check`. Vitest körde 237 testfiler: 1 661 test godkändes och 3 nya Expert-regressionstest misslyckades, samtliga i `tests/arcane-spellforge.test.js` (perfekt udda EG, fummel, död vid 0 PSY). De tre röda testen är avsiktliga diagnoser av aktuella regelavvikelser; inga mekanikfixar har gjorts. `npm run check` avbryter vid testfel, så byggsteget kördes inte.

**Inte simulerat ännu:** tärningsutfall genom fulla UI-kast, Snedtändningstabellens följder, självuppoffrande kast, samtliga 91 effekters fulla regelresultat, mål/hexgeometri för varje besvärjelse, alla avstånds- och områdesgränser, avbrott genom skada, samtidiga effekter, avslut/återställning samt effekter utanför strid. Befintliga testsamlingar täcker delar av UI, målval, antimagi och resultatkort, men körningen är inte en end-to-end-simulering av dessa regler. För spell-specifika förväntningar behövs en sidvis fältmappning från Expert s. 8–37. Inga utfall hävdas för ej täckta scenarier.

## Rekommenderad ordning

1. **P1:** Fummelupplösning: full EG-kostnad + Snedtändning.
2. **P1:** Död vid 0 PSY och konsekvenser i strid.
3. **P2:** Perfekt PSY-kostnad avrundas enligt Expert s. 4.
4. **P2:** Normalisera (K)/(R)-metadata så att namn och separata flaggor stämmer.
5. **P2:** Bygg en spell-för-spell korsreferens mellan de 91 registerraderna och s. 8–37; dokumentera oklarheter i stället för att fylla dem med antaganden.
6. **P2/P3:** Komplettera mål-/effekt-/motståndsfält efter verifierad regeltext och specificera när effekten avsiktligt löses av SL.

Ingen produktionsrättning eller registeruppdatering ingår i denna diagnostiska leverans.
