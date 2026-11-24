# Kartobjekt i Kartakademin och Äventyrsvyn

Kartakademins flik **Objekt** redigerar kartans förberedda möblering. **Objekt** i SL Control Board öppnar samma verktyg för den aktuella kampanjkartan. Välj en mall och tryck på kartan, eller dra den från biblioteket. Tryck på ett placerat objekt för att flytta det, använda rotations- och skalhandtagen eller ange exakta värden. Om ett föremål är helt täckt kan du välja det i **På kartan** och trycka **Flytta** för att ange en ny position. Grundläget är fri placering. Med **Fäst vid hexcentrum** kan du använda kartans befintliga hexgeometri. Varje ändring sparas direkt.

## Objektverkstaden i Admin

Öppna **Admin → Objektverkstaden → Nytt objekt**. Ange namn, kategori och samling. En kampanjspecifik mall hör till den valda kampanjen. Välj en bild från datorn eller mobilen, ange kända mått i meter och tryck **Spara objekt**. HERMES ALEA kopplar den verifierade bilden till mallen. Kartobjekt kan ha upp till 4 096 pixlar på längsta sidan, totalt högst 4 194 304 pixlar och högst 12 MB. Både bredd, höjd och genomskinlighet bevaras i visningsbilden. Om uppladdningen avbryts finns den sparade mallen kvar och samma fil kan väljas igen. Befintliga objekt kan få en ersättningsbild. De behåller sin identitet och sina placeringar. Äldre Battle Library-länkar hämtar fortfarande sin bild och sina spelegenskaper därifrån.

Aktiva mallar med bild och tre fysiska mått kan placeras i **Admin → Platser → Kartakademin → Objekt** och i **SL Control Board → Objekt** på en kalibrerad karta. ChatGPT och Codex kan skapa en mall direkt i samma bibliotek med [HERMES CORE:s kartobjektprofil](../hermes/core/queue/README.md#map-objects-for-kartakademin-and-the-sl-control-board).

## Samling och kategori

**Alla tillgängliga** visar gemensamma mallar och mallar för den öppna kartans kampanj. Välj **Gemensamma objekt** eller **Kampanjspecifika objekt** för att begränsa samlingen. Samling, kategori och fritext kan kombineras i både Kartakademin och SL Control Board. **På kartan** visar fortfarande samtliga placerade instanser för spelledaren.

Kategorierna är **Möbler**, **Förvaring och gods**, **Byggnadsdelar**, **Inredning och bruksföremål**, **Eld och belysning**, **Hinder och försvar**, **Natur och terräng**, **Monument och ritualföremål** och **Övrigt**. Övrigt samlar mallar som saknar en lämpligare kategori.

Som administratör kan du ändra kategori med pennan på en mall i Kartakademin. För att ge en gemensam träkista en egen identitet i äventyret, öppna **Skapa kampanjmall**, ange namnet och välj **Skapa i aktuell kampanj**. Den nya mallen har eget ID och delar originalets HERMES-bild. Båda mallarna kan därefter redigeras och placeras oberoende.

## Mått och bilder

`arcane_object_definitions` återanvänder objektbibliotekets ID och HERMES-referens. `width_m` är längden längs bildens lokala X-axel, `depth_m` bredden längs Y och `height_m` den fysiska höjden. Alla tre multipliceras med instansens `scale_factor`. Kartakademins kalibrering omvandlar längd och bredd till kartkoordinater. Kamerans zoom och bildens leveransupplösning påverkar enbart presentationen.

Bord, stol och kista använder sina uppmätta bildutsnitt. Nya mallar kan ange utsnitt och originalduk eller använda bildens alfakanal. CORE och ALEA behåller sina befintliga bildreferenser. En kopia delar sin malls bild.

Battle Library-objekt länkas med `battle_object_key`. Bibliotekets namn, ursprungliga objekttyp, beskrivning, bild och maximala skadevärde följer med när mallen skapas eller uppdateras där. Administratören kan fylla i saknade metermått i Kartakademin. Äldre hexbaserade stridsplaceringar ligger kvar i sin egen befintliga modell.

## Förberedelse och spel

`campaign_map_objects` hör till både kartinstansen och kampanjen. Före första liveändringen visar äventyret den förberedda möbleringen. Första kommandot i SL Control Board låser kartraden och kopierar de förberedda instanserna i samma transaktion. `prepared_id` identifierar en kopias ursprung. Markören `campaign_maps.objects_initialized_at` bevarar spelversionen även om SL tar bort alla objekt. Spelet fortsätter med samma möblering över flera spelmöten.

`edit_living_map_object` sparar ändrade fält och hanterar lagerordning under samma kartlås. BEP tillhör varje instans. Noll och ett tomt värde har skilda betydelser. Lagerordningen styr endast bildens ritordning.

Äventyrsvyns spelarläsning och **Visa spelarvy** använder `read_adventure_player_objects`. Den returnerar spelarsynliga objekt med centrum i upptäckt område och endast de bild- och transformationsfält som visningen behöver. Kartlagret klipper bilder mot upptäckta rum. RLS begränsar obehandlade instansrader och redigeringskommandot behörighetskontrollerar kampanjens SL och administratörer.

## Migration och verifiering

`supabase/migrations/20261123224005_arcane_living_objects.sql` kompletterar objektbiblioteket från 17 november. Migrationen hanterar även installationer där den tidigare valfria modulen saknas. Den återanvänder befintliga ID:n och kräver de tidigare migrationerna för Battle Library, kartsynk och spelarprojektion. Publicera nya systembilder genom HERMES CORE för respektive miljö.

Migrationen `object_library_collections` lägger till `campaign_id` och `library_category` på befintliga objektmallar. Tidigare mallar tillhör den gemensamma samlingen. Den första kategoriseringen använder mallens befintliga typ. Kartkommandot kontrollerar kampanjtillhörighet även när en mall anges med ID.

`tests/living-map-objects.test.js` kör båda installationsvägarna i PostgreSQL via PGlite och provar bland annat synlighet, lagerordning, BEP, låsning, rollback och återöppning av en tom spelkarta.

### Biblioteksfönster och objekt i rummet

**Öppna objektbiblioteket** visar 24 mallar åt gången. Sökning och filtrering omfattar hela den tillgängliga samlingen. De senaste placeringarna sparas för användaren och kampanjen på enheten. På dator kan du dra från fönstret till kartan. På mobil väljer du en mall och trycker på kartan. Biblioteket kommer ihåg sökningen när du öppnar det igen på samma karta.

I Äventyrsvyns högra rumspanel kan SL ändra varje placerad instans, även när kontrollpanelen är hopfälld. Objektets mittpunkt avgör vilka rum det ligger i. **Synlig för spelare** tillåter visning när rummet är utforskat. **Solid** hindrar figurplacering när målhexens mittpunkt ligger på objektets roterade, skalade yta. Båda egenskaperna sparas oberoende i äventyrets aktuella tillstånd.
