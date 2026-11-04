# HEXAGONIA — återvunnen motor och V1-bibliotek

## Återvunnet arbete

PR #229 (mergead till main 2026-10-24) etablerade en deterministic axial hexmotor, 60-graders rotation/spegling, SVG-rendering och Geometry Lab. Källan finns redan i development. Den här ändringen utökar samma `aleaArcaneGeometryEngine`-väg med `aleaHexFormationLibrary`; den skapar ingen separat renderingsmotor.

## Geometribibliotek

`features/ui/arcane-hex-formation-library.js` innehåller definitionsdata för 19 formationer, med minst en variant per antal 1–9. Varje post har stabilt ID, axialkoordinater, antal, geometriskt centrum, rotationsankare, yttre kantsegment, sex riktningar, speglingstillgänglighet, kanonisk formnyckel samt grafisk profil- och versionspekare.

Kanonisering tar bort translation och identifierar samma form under 60-graders rotation och spegling. Spelmässig riktning hålls separat i `orient(id, {steps, mirror})`. Biblioteket genererar inte alla möjliga polyhexer. Nya formationer kan läggas till som datarecept i katalogen utan nya renderingskomponenter.

## Befintligt stridsfotavtryck

`features/combat/footprint.js` har redan fasta speldata för single, line2, triangle3, line3 och giant7. Dessa driver kollision, räckvidd, rörelse och riktning; SQL/RPC-implementationen har motsvarande lista. De lämnas orörda i den här etappen eftersom byte av auktoritativ spelgeometri kräver samordnad JS/RPC migration och regressionsverifiering. Formationsbiblioteket är ännu inte inkopplat som runtimekälla för dessa fotavtryck.

## Grafik och publicering

Geometry Lab genererar en geometrisk SVG-förhandsvisning och kan rasterexportera PNG i webbläsaren med alfa. Nuvarande befintliga SVG-motor skapar förenklad brons-/elfenbensgrafik; detaljrik relief, kamerakalibrering mot godkänd basbild, verkliga lejonreliefer/hörnbeslag och visuell acceptans återstår. Därför markeras samtliga poster `preview-only-not-published`; detta betyder inte att färdiga produktionsbaser finns.

HERMES CORE:s befintliga generiska `system`-mål passar senare basbilder. En permanent basbild ska få en unik `asset_key` i `config/hermes-system-assets.json`, följa det systembildsflöde som finns i `hermes/core/manifest.json` och publiceras först efter visuellt godkänd originalexport. Den här etappen skapar ingen ny publiceringsväg och skickar ingen bild till CORE.

## Etapper

- **A – återvinning:** bekräftad; PR #229:s kod finns i development.
- **B – geometri/data:** katalog och orienterings-API klara som prototyp; algebraiska tester finns.
- **C – grafisk motor:** återstår för production-grade reliefmaterial, förenad ytterkontur, kamerakalibrering och PNG/WebP alfaverifiering.
- **D – Geometry Lab:** formationsfilter, miniatyrer, rotation, spegling, upptagna koordinater och SVG/PNG-export implementerade. Mobil och live-preview behöver verifieras i Cloudflare.
- **E – integration:** inventerad men inte kopplad; befintliga stridsfotavtryck har avsiktligt lämnats oförändrade.
- **F – verifiering:** lokala riktade geometritester körda; CI, MINOTAURUS och Cloudflare-preview återstår.

## Geometriskt grundbibliotek

| Hex | Formationer |
|---:|---|
| 1 | Standard |
| 2 | Linje |
| 3 | Linje, kompakt |
| 4 | Linje, diamant, kompakt |
| 5 | Linje, två kompakta |
| 6 | Triangel, chevron, block |
| 7 | Symmetrisk, kompakt |
| 8 | Kompakt, symmetrisk |
| 9 | Diamant, block |

Referensbilderna är visuella mål. Biblioteket använder axialgeometri för de upptagna rutorna; de är inte geometrisk källa.

