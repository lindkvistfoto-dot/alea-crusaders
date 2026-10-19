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
