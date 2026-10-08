# Elronds råd – slutverifiering av bild- och materialkedjan

**Version:** v0.34.88 · **Projekt:** Alea Crusaders · **Kampanj:** Skelettbyns Hemlighet

## Omfattning
Granskar Gandalf → Gimli → Bilbo → Aragorn → Legolas → Frodo → Sam → Galadriel som en enhet.

### Automatiskt slutprov i GitHub CI
`tests/material-elrond-end-to-end.test.js` kör en deterministisk **tvåklient-simulering** med en GM, en spelare och ett kampanjisolerat databasanropslager. Det är ett integrationstest av riktig frontendkod med en emulerad RLS/Storage-server, **inte** ett verkligt E2E-test i två riktiga webbläsare eller användarkonton.

| Testfall | Förväntat resultat |
| --- | --- |
| Spelaren begär privat bild innan delning | Avvisat av simulerad RLS/Storage |
| SL visar ett porträtt med Frodo | Spelaren tar emot Realtime-notis, frågar REST och kan läsa bilden |
| SL byter porträtt | Spelaren får ny bild; tidigare ej delad bild blir oläsbar |
| SL avslutar presentationen | Spelarens live-preview stängs; filen kräver annan delning |
| SL delar permanent med Sam | Materialet stannar kvar efter att Frodo avslutats |
| SL återkallar delningen | Filåtkomst nekas på nya anrop; metadata försvinner från spelarens mapp |
| Spelaren försöker dela eller visa | Skrivanrop nekas |
| Spelaren är utanför kampanjen | Varken material eller presentation kan läsas |
| Två SL skriver med föråldrad revision | Det äldre anropet blockeras |
| Återkallning av innehåll från annan mappsida | Visaren stängs först när materialet faktiskt inte längre är RLS-synligt |
| Kampanjbyte medan bildvisaren är öppen | Den gamla visaren stängs och Blob-resurser frigörs |

Därtill körs befintliga Galadriel-, Sam-, Frodo-, Legolas-, Aragorn-, Bilbo-, Gimli- och Gandalf-tester samt övriga projekttester.

### Live-databas kontrollerad utan att dela bilder
- Samtliga fem materialtabeller har RLS aktiverad.
- De sex materialrelaterade Storage-buckets som används av biblioteket är privata.
- GM-anteckningar är en separat GM-skyddad tabell.
- Materialdelningar ger spelare SELECT endast vid aktiv delning och kampanjmedlemskap.
- En tillfällig presentation är inte detsamma som en persistent delning.
- Realtime-publiceringen innehåller signaler per kampanj, utan bildtitlar eller filvägar; andra tidigare publicerade tabeller är kvar.
- Signalernas SELECT tillåts för kampanjmedlemmar; klienten saknar direkt UPDATE.
- Ingen aktiv presentation eller delning skapades vid kontrollerna.

## Riktigt webbläsarprov – återstår att utföra med två faktiska konton
Detta kräver aktiv inloggning i **två separata webbläsare/sessioner**, ett SL-konto och ett spelarkonto. Kör dessa steg innan produktionsgodkännande för verklig spelkväll:

1. Logga in i Alea Crusaders som SL i webbläsare A och som spelare i webbläsare B. Säkerställ samma kampanj och enbart tillåtna rollbehörigheter.
2. SL öppnar **▧ Material**, väljer en privat bild. Spelaren ska inte se den innan den visas eller delas.
3. SL klickar **📡 Visa nu**. Observera att B får bilden och att **✨ Galadriel · Ansluten · realtid** visas.
4. SL växlar till nästa bild. Kontrollera att rätt titel, själva bytesen och zoom-/panoreringskontroller syns i B.
5. SL klickar **■ Avsluta visning**. Kontrollera att tidigare presentationsåtkomst upphör om den inte ligger i Sams mapp.
6. SL lägger en bild i **🌿 Spelarmapp**. Spelaren ser den, kan stänga och öppna panelen och kan öppna originalbilden på nytt.
7. SL återkallar den delade bilden. Den ska försvinna från B och ett **nytt** filanrop ska nekas; den ska inte raderas från SL:s bibliotek.
8. Dela minst 25 olika material för att prova paginering. Öppna en bild som hamnat på en annan mappsida och kontrollera att en orelaterad uppdatering **inte** stänger den.
9. Bryt B:s nätverk tillfälligt, slå på det och verifiera återanslutning, statusrad och att ändringar under avbrottet synkroniseras.
10. Byt kampanj eller logga ut från B medan en bild är öppen. Bilden får inte ligga kvar i visaren.
11. Bekräfta att SL-anteckningar inte följer med i nätverkssvar, dokumentvisning eller materialbibliotek för spelaren.

**Observera:** Redan nedladdade filer/Blob-URL:er på spelarens egen enhet kan inte återkallas retroaktivt av servern. Den nya filåtkomsten ska däremot omedelbart nekas efter återkallning (om inte bilden också presenteras aktivt via Frodo).

## Två rättade gränsfall i Elrond
- En bild fick inte stängas därför att den saknades på den *aktuella sidan* i Sams mapp. Nu verifieras exakt material via spelarens material-RLS.
- En öppen Legolas-visare kunde behålla material vid kampanjbyte. Nu stängs visaren och gamla Blob-referenser rensas.

## Leveranskriterium
Automatiska tester och produktionsbygge ska vara godkända, Pages-publicering slutförd, samtliga relevanta säkerhetspolicyer verifierade och de verkliga tvåkontotesterna ovan genomförda för att hela användarscenariot ska betecknas **fullt produktionsverifierat**.
