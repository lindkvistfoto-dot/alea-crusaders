# Kartobjekt i Kartakademin och Äventyrsvyn

Kartakademins flik **Objekt** redigerar kartans förberedda möblering. **Objekt** i SL Control Board öppnar samma verktyg för den aktuella kampanjkartan. Välj en mall och tryck på kartan, eller dra den från biblioteket. Tryck på ett placerat objekt för att flytta det, använda rotations- och skalhandtagen eller ange exakta värden. Varje ändring sparas direkt.

## Mått och bilder

`arcane_object_definitions` återanvänder objektbibliotekets ID och HERMES-referens. `width_m` är längden längs bildens lokala X-axel, `depth_m` bredden längs Y och `height_m` den fysiska höjden. Alla tre multipliceras med instansens `scale_factor`. Kartakademins kalibrering omvandlar längd och bredd till kartkoordinater. Kamerans zoom och bildens leveransupplösning påverkar enbart presentationen.

Bord, stol och kista använder sina uppmätta bildutsnitt. Nya mallar kan ange utsnitt och originalduk eller använda bildens alfakanal. CORE och ALEA behåller sina befintliga bildreferenser. En kopia delar sin malls bild.

Battle Library-objekt länkas med `battle_object_key`. Bibliotekets namn, kategori, beskrivning, bild och maximala skadevärde följer med när mallen skapas eller uppdateras där. Administratören kan fylla i saknade metermått i Kartakademin. Äldre hexbaserade stridsplaceringar ligger kvar i sin egen befintliga modell.

## Förberedelse och spel

`campaign_map_objects` hör till både kartinstansen och kampanjen. Före första liveändringen visar äventyret den förberedda möbleringen. Första kommandot i SL Control Board låser kartraden och kopierar de förberedda instanserna i samma transaktion. `prepared_id` identifierar en kopias ursprung. Markören `campaign_maps.objects_initialized_at` bevarar spelversionen även om SL tar bort alla objekt. Spelet fortsätter med samma möblering över flera spelmöten.

`edit_living_map_object` sparar ändrade fält och hanterar lagerordning under samma kartlås. BEP tillhör varje instans. Noll och ett tomt värde har skilda betydelser. Lagerordningen styr endast bildens ritordning.

Äventyrsvyns spelarläsning och **Visa spelarvy** använder `read_adventure_player_objects`. Den returnerar spelarsynliga objekt med centrum i upptäckt område och endast de bild- och transformationsfält som visningen behöver. Kartlagret klipper bilder mot upptäckta rum. RLS begränsar obehandlade instansrader och redigeringskommandot behörighetskontrollerar kampanjens SL och administratörer.

## Migration och verifiering

`supabase/migrations/20261123224005_arcane_living_objects.sql` kompletterar objektbiblioteket från 17 november. Migrationen hanterar även installationer där den tidigare valfria modulen saknas. Den återanvänder befintliga ID:n och kräver de tidigare migrationerna för Battle Library, kartsynk och spelarprojektion. Publicera nya systembilder genom HERMES CORE för respektive miljö.

`tests/living-map-objects.test.js` kör båda installationsvägarna i PostgreSQL via PGlite och provar bland annat synlighet, lagerordning, BEP, låsning, rollback och återöppning av en tom spelkarta.
