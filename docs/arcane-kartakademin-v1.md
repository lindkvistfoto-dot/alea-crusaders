# Kartakademin V1 i DEV

Öppna **Admin → Platser → Kartor** och välj kartans sexkantsknapp. Den gemensamma kartredigeraren använder samma kartbild, SVG-yta, koordinater och zoom för rum och Kartakademins lager. Välj ett redigeringsläge: Rum, Områdeseffekter, Sikt och hinder, Ljuskällor eller Objekt. Rum behåller hörn, magnetfunktion och rumskoppling. Sikt och hinder behåller flood fill, pensel, sudd, Solid och rörelsehinder. Ljuskällor behåller placering och inställningar. Områdeseffekter och objekt är förberedda lägen; uppdraget lägger inte till nya effekt- eller objektfunktioner. Synliga lager ställs separat från redigeringsläget. Inaktiva lager visas som referens utan handtag eller klickredigering. Sikt, ljusblockering och rörelse är tre oberoende val per form. Avmarkera Spelarförhandsvisning för att se stödlinjer och den valda rollpersonens geometriska sikt.

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

Flood fill visar markeringsförslaget i gult tills SL accepterar. Färgtolerans jämför mot startpixeln och kanttolerans jämför varje steg med den senast nådda grannpixeln. Väggdetektering letar efter kontrastlinjer i fyra riktningar och kan också reagera på målade skuggor eller golvtextur. Kantutjämning beskär tunna utstick och konvexa hörn från den nya markeringen och lägger aldrig till fri sikt. Max hålstorlek avser maskpixlar. Hålfyllning bevarar Solid med även diagonal förbindelse mot kartkanten samt hål som innehåller en upptäckt väggpixel eller transparent bildpixel. Klick på **Acceptera fyllning** gör resultatet till en ångra/gör om-operation. Spara Kartakademin sparar den accepterade masken via det befintliga formatet.

### Spelarvisning och åtkomst

Okända rum täcks av helsvart. Outforskade rum visas med oskärpa och lätt nedtoning. Utforskade rum återges i skärpa med separat belysning. Rumsinformation behåller sina egna behörighetsregler. För att ett ljus ska skickas till spelare måste SL slå på **Dela ljuset i utforskade rum** och ljuset måste vara tänt och placerat i ett utforskat område.

Spelarnas RPC returnerar en rastermask inom utforskade rum och godkända ljusparametrar. Ett okänt eller outforskat område har företräde vid överlappning. Rå geometri, ljusnamn, rollpersons-ID och övrig konfiguration finns enbart i SL:s dataväg. Ljushinder bakas in i spelarmasken. Kartakademin använder ALEA:s befintliga åtkomst till kartbild och rumsgränser. Den som får originalkartan från det äldre kartflödet kan därför fortfarande läsa detaljer som finns inritade i själva bilden.

## Kartverkstaden V1.4

- Vänsterpanelen samlar lägen, zoom och synliga lager. Mushjul zoomar vid pekaren. Panorera med mittenknappen eller mellanslag och dra. Anpassa karta visar hela bilden.
- Välj **Infoga punkt** och klicka intill en rumskant. Ett klick på ett hörn markerar det för flytt eller borttagning. Ändringar på delade kanter sparas med den befintliga atomära proceduren. **Ångra punkt** återställer senast sparad punktändring i den öppna arbetsytan. Delade hörn kan flyttas.
- **Fyll tomrum** hittar slutna glipor. Välj en glipa, granska polygonen, välj plats och klicka på **Spara polygon** eller **Avbryt ritning**.
- Flood fill, pensel, sudd och polygon påverkar samma arbetsmask. Varje slutförd åtgärd kan ångras. Fri sikt och Solid är två vyer av samma mask. **Granska små Solid-fläckar** lägger enbart ut markeringar. Hålstorlek bland avancerade flood fill-inställningar påverkar själva fyllningen om den anges uttryckligen.
- Kartinställningar lagrar miljö, norr och px/m i befintlig konfiguration. Kartbredden anges i meter. **Rummens upptäcktsstatus** visar en visuell simulering för SL. **Visa endast ljusresultat** döljer redigeringsöverlägg tillfälligt.
- Gamla sol- och månljuskällor behåller sitt befintliga riktade läge. De nya formerna använder räckvidd för längd eller diameter. Ändra bredden för en parallell remsa eller en elliptisk öppning. Fladder/puls 0 ger ett statiskt magiskt ljus utan den animerade auran.
- Spelar-RPC:n hämtar tre extra visuella parametrar för redan tillåtna ljuskällor i den befintliga Kartakademin-migrationen. Granska migrationen innan DEV-körning. Förberedda lägen för områdeseffekter och objekt använder fortfarande PR:ens befintliga stöd.

## Kartverkstaden V2.0

Kartverkstaden öppnas i **Admin → Platser** från platsstrukturen eller sexkantsknappen på en befintlig karta. Nivåväljaren använder kartor kopplade till samma platsstruktur. **Lägg till kartbild** och **Lägg till nivå** öppnar det befintliga flödet för att skapa en karta. Kartbildsbyte kräver ett kartmål i HERMES ALEA med dimensionskontroll före aktivering.

Kartans viewport anpassas efter arbetsytans bredd och höjd. Kartbild, PixiJS, SVG och mask ligger i samma förflyttade kartyta. Kartans norr anges i grader medurs från kartans överkant. Befintliga kartor utan sparad norr behåller sina tidigare ljusriktningar. Spelar-RPC:n räknar om riktningen endast för sol- och månljus som den redan lämnar ut. ARCANE COMPASS ROSE V1.0 behöver levereras som godkänd RGBA-originalfil genom HERMES CORE.
