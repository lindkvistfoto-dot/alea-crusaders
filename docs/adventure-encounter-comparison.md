# Strid på Skelettbyn i DEV

Öppna Äventyrsvyn med Skelettbyn vald. Öppna SL Control Board och välj **Gör aktuell** eller **Dela och gör aktuell** om kartan ännu inte är aktuell. På den tomma kartan väljer SL **Bystrid Skelett** under **Startpositioner**, sedan **Flytta scenens figurer hit och starta strid**. Det valet flyttar rollpersoner som redan finns på en annan karta i samma spelmöte. Om kartan redan har figurer använder **Starta strid på kartan** deras positioner.

## Paneler och roller

| Yta | Under strid |
| --- | --- |
| Vänster | Båda rollerna ser rundan, aktiv figur, resurser, utrustning och aktuell handling. Den befintliga motorn styr vilka knappar som går att använda. Förflyttning, attack, magi och övrig handling öppnar sina egna paneler. |
| Höger | Turordning, initiativ, deltagarkort, aktiv tur och bildgalleri. Ett kort öppnar detaljer eller väljer mål beroende på handling. Spelarens karta filtrerar synliga deltagare. |
| Vid ett anfall | Valt vapen och mål, anfallsresultat och försvarsreaktion. När försvararen kan parera visas försvarspanelen med lagliga val. |
| SL Control Board | SL startar och avslutar striden. Stridsloggen och motorns övriga SL-verktyg finns i stridsläget. Vid avslut återkommer utforskningskartan med figurernas slutpositioner. |

## Upprepa rörelseprovet

1. Öppna Stridsvyn via svärdsikonen eller jämförelselänken. Den öppnar kampanjens ordinarie strid. Äventyrsvyns instans har eget ID.
2. När Astrid är på tur med maxförflyttning 18, välj **Förflyttning**. Flytta i delsteg på fri terräng. Läs av efter 8, 9 och 10 förbrukade poäng. Vid 9 är Attack tillgänglig. Det första steget över 9 tar rundans primära handling. Vid 18 är förflyttningen slut.
3. Använd samma väg och terrängkostnad i den andra vyn. Bilderna skiljer sig i storlek. På DEV var scenens bakgrund 1254 × 1254 med tio hexrader. Äventyrskartan var 1535 × 1024 och saknade angiven pixelskala.
4. Jämför turbyte, ny runda och anfall mot en närliggande försvarare med sköld. Jämför behörighet, kostnad och logghändelser. Tärningsvärden kan skilja sig.

## Automatiskt prov

Webbläsarprovet kör två separata strider i varsin webbläsarkontext med simulerad databastransport. Det använder de sju startpositionerna från Skelettbyn och båda vyernas riktiga paneler och kommandon. Efter rörelseprovet ställs en försvarare intill Astrid för ett reproducerbart närstridsprov. Referensen och Äventyrsvyn använder olika lyckade tärningsslag. Skärmbilder från 8, 9, 10 och försvarsreaktionen finns i CI-artefakten **adventure-paneler**.

SQL-provet kör migrationen i PostgreSQL via PGlite. Det kontrollerar SL-behörighet, dubbelt startkommando, två exemplar av samma monster, avgränsning från referensen, blockerad väg, positionsuppdatering och ny strid med eget ID efter avslut.
