# ARCANE · Systembibliotek v1

Alea Crusaders har två skilda bildtyper:

- **Kampanjens bilder**: porträtt, illustrationer, scener och galleriuppladdningar. De hanteras av befintliga administrationsflöden.
- **Systemgrafik**: versionshanterade återanvändbara ramar, knappar, paneler och ikonmotiv för Aleas användargränssnitt. Dessa ligger i detta bibliotek.

## Struktur

`assets/arcane/system/v1/` innehåller 23 verkliga, genererade rasterbilder i AVIF med transparent bakgrund utanför de grafiska elementen. Bilderna kan ersättas med högre upplösning under en **ny versionskatalog** i stället för att byta filer tyst.

`features/ui/arcane-system-library.js` exponerar:

```js
window.aleaArcaneSystem.resolve('portrait-frame');
window.aleaArcaneSystem.get('tab-active');
window.aleaArcaneSystem.list('Ikoner');
```

`features/ui/arcane-system.css` ger globalt återanvändbara CSS-variabler:

```css
.card { background-image: var(--arcane-art-stat); }
.button { background-image: var(--arcane-art-equipment); }
```

Sökbar visning finns under **Administration → ARCANE · Systembibliotek**. Katalogen är skrivskyddad och skyddad bakom Aleas befintliga administratörsvy. Att byta en systemmaster ska ske genom versionshanterad uppdatering för att undvika att spelare får olika grafik eller oavsiktligt ändrade komponenter.

## Fall-back och prestanda

Biblioteket förladdar de element som rollpersonssidan kräver. Bildramarna aktiveras först när alla nödvändiga bilder har laddats, annars behålls den tidigare CSS/SVG-designen. De nya filerna är optimerade för mobil storlek och beskrivs i enhetliga komponentnycklar; de ursprungliga större PNG-masterfilerna sparas separat för vidare produktion.

Ändra aldrig rollpersonsdata eller befintliga knapparnas funktion för att byta grafisk komponent.
## Grundegenskaper · rasterark v2 (2026-10-18)

`assets/arcane/system/v2/attributes-atlas.png` är ett faktiskt RGBA-PNG-ark
(512×192, 8 kolumner × 3 rader) baserat på den godkända ARCANE-illustrationen.
De sju metallmedaljongerna, gruppsigillet utan inbakad siffra, krönet III,
fyra hörn och rubrikdiamanten är individuellt sökbara som
`attribute-fysik`, `attribute-styrka`, `attribute-karisma`,
`attribute-storlek`, `attribute-smidighet`,
`attribute-intelligens`, `attribute-psykisk-kraft`,
`attribute-group-medallion`, `attribute-title-medallion`,
`attribute-corner-{tl,tr,bl,br}` och `attribute-header-jewel`.
Använd `window.aleaArcaneSystem.get(id).sprite` för ruta/koordinat
och `resolve(id)` för samma atlas-URL; SVG genereras inte.

`features/character/arcane-attributes.css` är panel- och matrisskiktet.
`features/character/glowup.js` flyttar bara den befintliga bonuserfarenhets-
kontrollen till sist i grundfliken, utan att kopiera eller ändra dess värde,
rättighetskontroll eller `stepLive`-hanterare. Attributgrafikens laddningsgrind
är oberoende av de 23 gamla v1-resurserna; om den inte laddar visas
ursprungliga textsymboler och beräknade siffror.
