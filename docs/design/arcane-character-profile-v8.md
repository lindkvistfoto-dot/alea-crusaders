# ARCANE · Rollpersonsprofil v8 — referenskomponent och acceptans

**Visuell master:** Astrid Eldhjärta-bilden godkänd 2026-10-19 (fotografiskt porträtt, lejonplakett, fyra lika stora tvåkolumnsrader, återhållsam ikonkolumn och guldfärgad avdelare). Referensbilden är facit, inte en vägledning som ersätts av generell styling.

## Varför v5–v7 inte var tillräckligt

De nio livefälten låg direkt under `#identity`, vilket gjorde att historiska `#identity > .field:nth-child(...)`, breda `.field.wide` och olika särskilda regler för RAS/YRKE/STRIDSIKON kunde påverka samma ruta. En CSS-patch längst ned flyttade utseendet stegvis men ägde inte innehållets layout.

V8 **ändrar DOM-strukturen en gång på presentationsnivå**, inte rollpersonsdatat. `arcane-profile-component.js` monterar en komponent runt de nio originalfälten genom att flytta själva befintliga DOM-noderna (ingen `cloneNode` och inget nytt `setIdentity`). En liten MutationObserver återmonterar efter att äldre `render()` ritat om samma fält. Det bryter de äldre *direkta barn*-selektorerna som orsakat mycket av CSS-konflikterna. Den gamla rollpersonsmodellen, redigeringsbehörighet och Bilder-fliken är fortfarande oförändrade.

## Ett definierat kontrakt för alla åtta kort

```text
┌───────────────────── PANEL ─────────────────────┐
│   [AVIF IKON] │  RAS                             │
│               │  Människa                        │
└──────────────────────────────────────────────────┘
```

Varje informationskort har `arcane-profile-card` med **tre kolumner**:
1. Ikonfil från `assets/arcane/system/v1` i centrerad, fast ikonbana.
2. Mjuk, tunn vertikal divider (CSS-gradient; en separat SVG är tillåten i framtiden om den behövs).
3. Originalfältet med en liten versal rubrik och ett större vänsterställt värde, med identisk baslinje och höjd.

Gridens två kolumner är lika breda och ingen CSS `nth-child` behövs för placering. DOM:s explicita ordning: Namn (full bredd), Ras/Yrke, Kön/Ålder, Längd/Vikt, Stridsikon/Stånd. Stridsikonens lilla porträtt återanvänder befintlig bild- och fallbacklogik. Namnplaketten är separat från rutorna.

**Layout-tokens**: `--ac-panel-gap`, `--ac-card-height`, `--ac-icon-width`, `--ac-icon-size`. En ändring av avstånd görs på **ett ställe**, inte åtta manuella korrigeringar. Den visuella ramen använder fortfarande befintliga genererade rasterbilder, inte nyritad SVG.

## Kontroll före godkännande

1. Ingen av `arcane-layout-v5/v6/v7.css` får laddas i `index.html`; `arcane-profile-component.css` är enda aktiva kortlayout.
2. Den verkliga data- och redigeringskopplingen måste överleva uppdateringar och omladdning av rollperson. Testa inklusive separata stridsikonbilder och fallback till porträtt.
3. Visuell kontroll med originalbilden vid bredd 320, 375, 390, 430 och 768 CSS-pixlar. Jämför synliga guldramar, inte bara DOM-boxarnas koordinater.
4. Alla fyra par måste ha samma kortmått och samma radavstånd. Ikoner i alla åtta kort, exakt samma avdelarlinje och vänsterställda textrader. Subtitle får inte hamna utanför namnskylten.
5. Godkännande sker först efter en ny faktisk mobilskärmbild bredvid referensen; tester av DOM/CSS är **inte** en visuell verifiering.

**Diagnos**: `window.aleaArcaneProfile?.version === 8`, `window.aleaArcaneProfile?.isMounted() === true` och `getComputedStyle(document.querySelector('#identity')).getPropertyValue('--arcane-profile-component').trim() === '8'` när rollpersonsfliken är aktiv.

## Om de historiska AVIF-ramarna visar för stora transparenta marginaler

Beskär då källbildernas externa alfa till en ny versionskatalog, **enligt HERMES**, och implementera skalenlig 9-slice/`border-image` som en del av samma komponent. Undvik fler specialregler. Ingen ny masterbild produceras inom detta v8-uppdrag; de befintliga versionerade originalen återanvänds oförändrade.

**Återställning:** ta bort v8 CSS-/JS-importerna från `index.html` och återaktivera tidigare version vid behov; inga speldata eller databasfält har ändrats.

## Finjustering 2026-10-19 (samma v8-komponent)

Ny mobilbild visade fortfarande en grön rektangel runt varje ram **efter att** den extra CSS-bakgrunden tagits bort. Den gröna ytterytan följer den befintliga `stat-panel.avif`-grafiken. V8 maskerar därför rasterkortets **yttre marginal** med `clip-path:inset(8% 1.5% 10% 3%)`. Detta är en kontrollerad och lokalt avgränsad beskärning, inte ett nytt bildoriginal eller en SVG. Ornamenten innanför klippgränsen ska bevaras och granskas på riktig Android-skärm.

Namnskyltens nedre marginal minskar till `-9px` så de första två korten placeras närmare Astrid. Rubrikerna får mindre, lätt seriftext och fältvärdena blir mindre och viktmässigt lättare. `EB Garamond` läses uttryckligen in via Google Fonts; annars används den smalare numeriska storleken med lokal serif-fallback. Typsnittets **verkliga** laddning måste kontrolleras visuellt på mobil, eftersom en fontstack utan inläsning tidigare gav samma Android-standardfont.

**Framtida permanent bildlösning:** Om masken skulle klippa hörnornament i olika bredder, beskär det verkliga rasteroriginalet i en versionshanterad HERMES-bildprofil och ersätt masken. Lägg inte till nya generella `#identity > .field`- eller `nth-child`-regler.

## Slutfinish 2026-10-19 — fortsatt v8

Visuellt underlag: `24532.jpg` (nuläge) och `24530.jpg` (godkänd referens), tillhandahållna i uppdraget. Originalbilder, porträttkälla, DOM och datahanterande JavaScript är oförändrade.

### Inventering före ändring

- `src/styles/app.css`: generella `.hero`, `.field`, `.field.wide`, `.portrait` och mobilregler. V8:s befintliga fältreset och wrapper isolerar korten.
- `arcane-profile.css`: äldre identity-grid, direkta `.field:nth-child(...)`, Unicode-symboler, SVG-fallback och porträttets grundmått. De direkta barnselektorerna matchar inte de flyttade v8-fälten.
- `arcane-system.css`: rasterram, tidigare negativ identity-marginal, gamla ikon-pseudoelement samt undertitel- och stridsikonregler. V8:s befintliga reset neutraliserar fältens pseudoelement; varje fält är ensamt barn i sin innehållswrapper, så de historiska ikonernas nth-child(5–9) matchar inte heller.
- `index.html` laddade dessutom två tillfälliga leveransmarkörer: en inline röd porträttsignal och en gul namnskyltssignal i en separat CSS-fil. Båda är nu borttagna, inklusive den extra CSS-filen.
- V5–v7 laddas fortfarande inte. Systembibliotekets resurskopplingar behöver ingen ändring.

### Samlade måttändringar i komponenten

| Egenskap | Före | Efter |
| --- | --- | --- |
| Namn och undertitel | centrerade | samma grupp lyft 8 CSS-px via `--ac-name-lift` |
| Namnskyltens nedre marginal | -9px | -19px |
| Gemensamt radgap | clamp(2px,.7vw,5px) | clamp(1.4px,.49vw,3.5px) |
| Radsteg | korthöjd + gap | korthöjd − `--ac-card-overlap:3px` + gap |
| Ikonstorlek | clamp(20px,5.8vw,29px) | clamp(25px,7.25vw,36.25px) |
| Ikonstorlek ≤350px | 19px | 23.75px |
| Mobilporträttets aspect-ratio | 1.72/1 | 1.51/1, cirka 13.9 % högre vid samma bredd |
| Mobilhero margin-top | 4px från äldre profil-CSS | -12px, lyft 16px |
| CSS-cacheversion | 20261019-8c | 20261019-8d |

Kortens höjd, bredd, ikonkolumn och textplacering behålls gemensamma. Överlappet gäller endast ramarnas osynliga yttre marginaler. Med befintlig klippning är det beräknade synliga radgapet vid 320/375/390/430px cirka 7.75/8.29/8.74/9.94px, jämfört med 11.42/12.08/12.56/13.85px: minskning cirka 28–32 %. Redigeringslägets befintliga auto-rader använder inget överlapp och låter formulären växa.

### Spöksymbolernas orsak

Inspektion av de verkliga AVIF-filerna visar fristående bildfragment i själva ikonexporterna: till höger om timglaset och längdmätaren, vid viktens och hjärtats högra kant samt under personsigillet. `stat-panel.avif` har hörnornament men ingen extra huvudikon. Problemet kan alltså inte lösas genom att lägga ytterligare en pseudoelementreset ovanpå den befintliga.

Komponenten klipper endast ikonernas bildytor med lokala `--ac-icon-crop`-värden och centrerar den kvarvarande synliga ikonen. Person: nederkant 9 %; timglas/längd: högerkant 28 %; vikt/hjärta: högerkant 12 %. Rasteroriginalen, panelbakgrunden och dess hörnornament är orörda. Ingen bildproduktion eller ny bildresurs ingår.

### Verifiering och begränsningar

- Befintliga tester för komponent, mobilgrid, rasterreferens, stridsikon/porträttkoppling och pensionerade leveransmarkörer körs efter ändringen.
- Hela testsuiten jämförs med körning före ändringar; de 29 ursprungliga felen i 17 filer redovisas separat från denna ändring.
- `npm run build` kördes både på oförändrad HEAD och efter ändringen. Båda kraschar i byggverktyget med `Segmentation fault` (exit 139), efter transformering. Produktionsbygget kan därför inte anges som godkänt i denna miljö.
- Faktisk Chromium-rendering kunde inte genomföras: processen stoppas av sandlådans socketbegränsning (`setsockopt: Operation not permitted`). Lokal webbserver nekas också (`listen EPERM`). Därför finns ingen verifierad före-/efterskärmbild och ingen genomförd visuell acceptans vid 320/375/390/430px eller i redigeringsläge. Beräknade CSS-mått ersätter inte denna återstående kontroll. Den privata porträttkällan har inte ersatts med någon annan bild.
