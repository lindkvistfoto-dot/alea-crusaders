# Kartakademin V1 i DEV

Öppna **Admin → Kartor → platsstruktur → Definiera polygoner → Kartakademin**. Rumsgränser, gemensamma hörn och platsstatus hanteras med de befintliga kontrollerna. Inom Kartakademin kan SL sätta miljö och skala, justera grundmörkret, placera ljus och rita stängda hinder eller öppna väggsegment. Sikt, ljusblockering och rörelse är tre oberoende val per form. Avmarkera Spelarförhandsvisning för att se stödlinjer och den valda rollpersonens geometriska sikt.

Ljuskällorna är fackla, lykta, eldstad, infallande solljus, månljus och magiskt sken. En ljuskälla kan knytas till en rollperson som SL flyttar manuellt genom kartan. Ljusets origin uppdateras vid positionsändringar. En källa vars rollperson saknar position lyser först när positionen finns. Fri sikt från en rollperson beräknas geometriskt för förhandsvisningen. Kampanjkartans rum och informationsåtkomst styrs av gruppens bestående upptäckt. Positioner hämtas från kampanjkartans runtime-tabell och påverkar bärbara ljus. Spelarna behöver inte slå på något.

Kartdata sparas i bildens intrinsiska pixlar. Skalan i pixlar per meter omvandlar ljusräckvidder. De sex typerna kommer från projektbeslutet. Initiala värden för färger, puls, vinklar och räckvidd är redigerbara förslag. Infallsvinkeln begränsar markräckvidden från den angivna monteringshöjden för riktade himmelsljus. Hinder ritas explicit. Rörelseprovet kontrollerar ett rakt förflyttningssegment. Det kan användas av ett senare navigeringssystem.

Migrationsfilen `20261117225000_arcane_kartakademin.sql` lägger till kartkonfiguration, rollpersoners positioner samt en atomär, revisionskontrollerad RPC för sparning. RLS utgår från kampanjens befintliga SL- och medlemsroller. Tabellen för positioner avser den aktuella kampanjkartan och är separat från dess grundkonfiguration. Kampanjkartans positioner saknar stridskoppling. Befintliga kartor utan konfiguration kör tidigare bild/SVG-flöde.

Renderaren delar PixiJS 8/WebGL, Container/Graphics-mask och tickerbaserad parameteruppdatering som verifierats i verkstadens tidigare källprototyper. Den integrerade renderaren använder befintlig karta och kamera samt egen segmentgeometri. Exakt källkod till den publicerade verkstadens v7 gick inte att granska bakom inloggningen. Renderaren har en gemensam kodväg för kampanjkarta och förhandsvisning.

## Verifiering i DEV-preview

1. Säkerställ att previewns testdatabas har migrationen installerad innan tester som sparar körs.
2. Öppna en inomhuskarta med två rumsområden. Lämna ett okänt, sätt det andra till utforskat. Kontrollera svart respektive grundmörker i spelläge.
3. Placera två fasta ljus samt ett buret ljus. Rita ett väggsegment och en avgrund. Verifiera skugga och separat rörelseblockering. Flytta rollpersonen och släck den fasta källan. Kontrollera upptäckten efter ändringarna.
4. Spara och öppna om. Jämför spelarförhandsvisningen med en autentiserad spelarsession. Kontrollera kartbyte, legacy-karta, ikoner, navigering, ett sparat gemensamt rumshörn och att en spelare saknar skrivrättighet.

## Fri sikt och Solid

Välj **Redigera fri sikt** och markera de ytor som ljus och sikt får passera. Flood fill utgår från klickad färg och sammanhängande grannpixlar. Justera toleransen, måla med penseln, sudda eller lägg till och ta bort polygoner. Ångra och Gör om arbetar per färdig operation. Vid zoom kan vyn flyttas med **Panorera**. Penseln använder kartpixlar och håller sin skala vid zoom.

Utan markerad fri sikt är en konfigurerad karta Solid. Masken sparas som pixelintervall i den befintliga kartkonfigurationen. Arbetsrastret använder källbildens upplösning upp till 1 536 pixlar på längsta sidan. Mot större källbilder kan en öppning tunnare än en maskcell behöva breddas i redigeraren. Solid stoppar ljus och sikt oavsett höjd. Rörelseblockering följer de oberoende passageinställningarna. Höjdbaserade objektskuggor hör till ett senare objektuppdrag.
