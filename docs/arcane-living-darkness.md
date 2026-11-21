# Den målade kryptan · Living Darkness

Öppna `/kryptans-dorr?art=1&darkness=1` i grenens preview. B är förvalt. Välj A eller B under kartan. Kamera, figurer, godkända steg, ljuskällor, dörr, kartminne och turordning tillhör samma spelmöte. Släck **Rummets ljus**, välj Evalin och använd kameran **Grupp** för att se facklan över stenfogarna. Fasta ljus kan även växlas ett i taget. **Justera mörkerlagret** styr grundmörker, ljusradie och fladder i B. **Minska rörelser** fryser fladdret.

## Bild och ljus

A återanvänder Art First-grenens mörka och belysta plåtar och dess additiva fackelpool. B visar den låsta varma målningen i färg. Den separata duken innehåller enbart mörker. Ljusmaskerna tar bort dess alfa, inklusive där flera ljus överlappar. För varje ljus beräknas en kontinuerlig siktpolygon med ytterväggar, port och möbelfotavtryck. Stenfasader och möbelfronter provtas från sina tillgängliga sidor. Ett smalt mjukt halvskuggeband och radiell avtoning ger övergången till mörker. Handmålad relief saknar separata normaler eller exakta tredimensionella höjder.

Källans 1 217 × 1 293 RGB-pixlar har kontrollerats byte för byte efter avkodning av jämförelsegrenens förlustfria WebP. Kartplanet och kalibreringen följer Art First. Portens separata blad och dess öppna utsnitt återanvänder föregående grens animering. Endast mörkermasken samplas vid 0,75 × kartplanets upplösning. Fasta ljuskäglor återanvänds. Ett nytt fackelläge eller en ändrad radie förnyar berörd mask, en ändrad blockerare förnyar geometrin. PixiJS och Canvas-reserven delar samma mask. Fladdret uppdateras högst 24 gånger per sekund när källorna står stilla.

Spelvärden fortsätter att bestämma sikt, minne, rörelse och dörrstatus med de ordinarie reglerna. Reglagen påverkar endast återgivningen. Inbjudna spelare får två förmaskerade bildvarianter och lokala skuggkanter från upptäckta områden. Minnet behåller sin egen behandling även om radien ökas. Spelaröverföringen använder pilotens komprimerade storlek och har lägre detaljgrad än SL-originalet. Båda originalen är demonstrationskonst i den isolerade previewn. En verklig hemlig kampanjkarta kräver den privata kampanjprofilen.

## Original

HERMES Inbox `107xGXgB7OTEqp1C_zJAGftv6tv-RNvvf`, originalarkiv `1qNO6QWU1fDinhM881U3E9OlaTpvjJ4hc`. PNG SHA-256 `0f877b2311ee134872f40999891a839a5783251d8c57b86b1546a6353e40336c`. Previewkopian följer föregående Art First-pilot. Simuleringen skriver inga kampanjposter.

## Reproducerbar jämförelse

Workflowen **Art First comparison** bygger PR-huvudet, kör spelprovet och sparar bilder och mätdata i **living-darkness-comparison**. A och B fotograferas med samma kamera, stilla ljus, samma figurer och samma lampstatus. Bildintervall mäts med rörelse på, i en ny scen per vy, under sex sekunder per modell. Mobilprovet använder en emulerad pekskärm med 390 × 844 CSS-pixlar och pixeltäthet 2. Resultatet beskriver testmaskinen.
