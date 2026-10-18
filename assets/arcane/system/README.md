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