# Smart Polygon Editor — specifikation (2026-10-17)

## Mål
Förbättra befintlig kampanjkarteditor utan databasbyte, med tydliga polygoner, magnetiska kanter, delade noder och kontrollerad fyllning av tomrum. Befintlig shape_data.points och shape_type används; platskoppling och synlighetsstatus bibehålls.

## Krav
1. **Magnetiska hörn/kanter:** närmaste nod prioriteras före kant; skärmpixelbaserad tolerans, exakt sparad koordinat; befintlig snäppning bibehålls. Vid snäppning på en kant ska en topologiskt gemensam vertex skapas vid behov så att hela kanten förblir konsistent.
2. **Fyll tomrum:** verktyg identifierar helt slutna inre hål; visa kandidater, låt användaren välja mottagarpolygon (förval: längst delad kant), med förhandsvisning och bekräftelse. Ändra aldrig öppet område utanför kartans polygonkluster. Inga automatiska förändringar av stora områden.
3. **Dra hörn:** vald nod följer pekaren. Samtliga polygoner som delar samma hörn ska uppdateras tillsammans. Även polygon vars kant innehåller samma koordinat ska delta. Validera mot självskärning, överlapp och kollaps före lagring; genomför ändringar atomärt på serversidan eller med återställningsstrategi vid delfel.
4. **Synlig grafik:** 3 px gul vald kontur, 2 px ljus övrig kontur, 12 px vita vertexmarkörer, 16 px turkos aktiv/delad nod; skärmkonstanta markörer vid zoom, hit-target minst 24 px; inga redigeringsmarkörer i spelarvyn.
5. **Interaktion:** Escape/Avbryt förkastar utkast; tydlig återkoppling, stöd för mus och pekare, inga osparade ändringar vid stängning, Ångra/Gör om för geometriändringar.

## Acceptanskriterier
- Två grannpolygoner med gemensam vertex kan flyttas och behåller tät kant.
- Tre polygoner som möts i en nod flyttar alla sin nod samtidigt.
- Snäppning ger identiska koordinater vid zoom och både mus/pekare.
- Fyll tomrum hittar ett slutet triangulärt respektive oregelbundet hål, men inte ett öppet utrymme eller hål som ligger i en befintlig polygon.
- Ingen ogiltig polygon eller oavsiktlig överlapp sparas.
- Ingen ändring av spelarnas kartvisning, fog of war, platskoppling, realtime eller existerande datamodell.

## Implementationsordning
A. Tydlig editor och samordnad nodflyttning.
B. Gemensam kantsegmentering vid snäppning.
C. Robust polygonisering av hål och union mot vald granne med preview.
D. Testsvit för topologi, regression, simultan sparning och mobil pekinteraktion.

## Varning
Utveckla inte 'Fyll tomrum' som godtycklig triangelfyllning eller genom att approximera kurvor med pixlar; använd riktig plan graf/topologi eller verifierat geometri-bibliotek för produktionssäker fyllning.
