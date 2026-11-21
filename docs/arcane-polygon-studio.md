# Kartakademins polygonverkstad 2.0

## Inventering före implementation

Granskningen utgick från development `4a93e01`. Rumsredigeraren öppnas genom sexkantsknappen i Admin → Platser → Kartor. Samma kartyta används för SL:s rumsarbete och förhandsvisning av sikt och ljus.

| Funktion | Bedömning | Fynd och arkitekturbeslut |
| --- | --- | --- |
| Bild, kamera och skala | Återanvändbar | `kartakademin.js` placerar kartbild, SVG och PixiJS i samma viewport. Rum lagras i originalbildens pixlar. Kalibrering i px/m gäller spelavstånd. Använd samma kameratransform för centrering och skärmpixlar för träffar. |
| Val och rumslista | Bör ersättas | `legacy/app.js` öppnar upptäcktsmenyn vid klick. Listan har en platsväljare per rad och saknar markerat val. En gemensam vald identitet ska styra kontur, lista och egenskapspanel. |
| Ritning och hörn | Behöver förbättras | Äldre kod ritar punkter i SVG men avrundar en träff till tiondels pixel. Infogning sorterar på ett avstånd som projektionsfunktionen aldrig returnerar. Använd en punkt- och kantmodell för ritning, infogning och dragning. |
| Magnetism och angränsande rum | Behöver förbättras | Tidigare tröskel följer zoom men saknar tydlig markör, och flytt räknar bort hela berörda polygoner ur magnetismen. Behåll exakta koordinater, upptäck också punkter mitt på grannens kant. |
| Tomrum | Återanvändbar med korrigering | `polygon-topology.js` delar kanter vid T-korsningar och går runt slutna ytor. Avrundade nycklar kan täppa igen äkta öppningar. Ett enda stickprov upptäcker inte ett rum helt inne i tomrummet. Kandidaten måste vara en giltig, tom, enkel ring. |
| Hinder, sikt och belysta väggar | Återanvändbara | `kartakademin-geometry.js` har segment och punkt-i-polygon. `kartakademin-surfaces.js` bygger ljusmottagaren på hindrets fotlinje. Använd synliga väggar som snäppreferens. Deras inställningar och geometri ägs av sina ordinarie verktyg. |
| Fri sikt och effektmasker | Återanvändbara för visning | Siktverkstadens pensel och flood fill arbetar på rasterceller. Den fristående PixiJS-prototypen ARCANE_PIXIJS_EFFECT_LAB_V1 (filversion 5) håller mask och kontur i världens koordinater och delar mask mellan effektcontainrar. Den saknar rumsidentitet, topologisk kantredigering och transaktionshistorik. Den integrerade PixiJS-renderaren fortsätter använda rum och mask för spelarbilden. |
| Objektredigerare | Återanvändbar som interaktionsmönster | Objektbiblioteket hanterar förflyttning, rotation och skala för förekomster. De har egna lagringsobjekt. Rum behöver redigera enskilda hörn och delade gränser. |
| Platskoppling | Behöver förbättras | Basen har separata tabeller för karta, struktur, plats och polygon. Sammansatta främmande nycklar säkrar kampanj men en plats i en syskonstruktur kunde väljas. Tillåt kartans struktur och dess understrukturer. En äldre karta utan struktur använder kampanjens platser. Lämna äldre länkar orörda vid läsning. |
| Historik och samtidighet | Bör ersättas | Äldre RPC uppdaterar polygonpunkter atomärt. Skapa, koppla och ta bort använder separata skrivvägar. Ångra täcker endast punktändringar och gör om saknas. Använd ett kommando per avslutad åtgärd, med före- och eftervärden samt kontroll av kartans versioner. |
| Spelarens rum, fog och utforskning | Återanvändbara | Rumsgeometri och location_id konsumeras redan av kartan. Upptäckt sparas separat i campaign_location_state. Håll redigeringskontroller och råa SL-lager i Admin. |

## Målarkitektur

SVG tar emot pekaren och visar lokal förhandsvisning. Den geometriska kärnan arbetar på punktlistor och skärmskala, oberoende av DOM och databas. Rum lagrar även fortsättningsvis polygon eller äldre rektangel i campaign_map_areas. Ett hörn som ligger exakt på en grannkant bildar en virtuell knutpunkt. Vid en flytt materialiseras knutpunkten i de berörda rummen inom samma transaktion.

Kartakademin äger kamera, synliga lager och SL-förhandsvisning. Egenskapspanelen visar identitet och plats för den valda polygonen. Rita skapar en polygon. Fyll utvidgar ett befintligt grannrum över en oavsiktlig glipa. Förhandsvisningen visar ytan som tillkommer och rummets nya kontur. Vid godkännande sparas en geometriändring på det valda rummet. ID, platskoppling och upptäcktsstatus hör fortfarande till samma rum. Kartinställningar och ljus har kvar sin befintliga sparfunktion.

Efter panorering eller mätning kan SL trycka direkt på Välj, Rita, Redigera eller Fyll för att arbeta i kartan igen. På mobil visar texten ovanför kartan vilket verktyg som tar emot nästa tryck. I Välj visas det markerade rummets identitet och platskoppling där.

Dela och sammanfoga kräver beslut om vilken plats och upptäcktsstatus de resulterande ytorna ska tillhöra. Duplicering behöver en särskild placeringsgest för att kopian ska kunna lämna originalytan innan den sparas. Första versionen prioriterar markering, hörn, gemensam gräns och fyllning.

## Provunderlag och begränsningar

| Befintlig DEV-karta | Polygoner | Kopplade | Slutna tomrum |
| --- | ---: | ---: | ---: |
| katakomber, Kyrkan | 11 | 1 | 4 |
| Skelettbyn, Byn | 21 | 21 | 6 |
| Grottsystem, Grottan | 5 | 5 | 0 |

Kyrkan innehöll elva valbara platser inklusive Rum 7 Balsameringskammaren. En oberoende jämförelse med GEOS gav samma tio fyllbara ytor och noll överlappning med befintliga rum. De fyra gliporna i Katakomberna omfattade 4,445–147,7 bildpixlar². Skelettbyn har en äldre ring som upprepar första hörnet som slutpunkt. Öppning och markering bevarar den lagrade punktlistan.

På en kopia av Katakomberna lagades de fyra gliporna i följd. Efteråt fanns elva rum och noll slutna glipor. För varje glipa fanns två eller tre möjliga grannrum. Alla tio alternativen gav exakt unionen av rummet och glipan vid kontroll med GEOS. Sparprov med de verkliga koordinaterna bekräftade att även en lagning i ett platskopplat rum bevarar kopplingen genom ångra och gör om.

Det visuella provet använder ordinarie Admin → Platser → Kartverkstad, de ursprungliga koordinaterna och Katakombernas originalmålning i en isolerad webbläsarsession. Det omfattar val, platskoppling, snap, punktredigering, vektorfyllning, omladdning, ångra/gör om och touch. En syntetisk karta i samma webbläsarskript gör grundprovet reproducerbart i CI. Katakomberna är dold för spelare i DEV. Grottsystem har alla tre upptäcktslägen och används därför tillsammans med Skelettbyn för spelarkontrollen.

DEV-databasprovet kördes i en transaktion med tillfälliga testidentiteter och en kopia av de elva polygonerna i en separat kampanj. En spelledare utan administratörsroll kunde koppla polygonen till en plats i en understruktur. Syskonstruktur, gammal kartversion och skrivning som vanlig spelare avvisades. Återställning verifierades. De 37 ursprungliga polygonraderna inklusive tidsstämplar hade oförändrade kontrollsummor.

En sluten glipa kan väljas direkt. Om det redan valda rummet kan ta emot glipan föreslås det, annars grannen med längst gemensam kant. SL kan byta mottagare före godkännandet. För ett smalt mellanrum som är öppet i ändarna kan SL ange rummets kant och den motstående grannkanten. Endast den del där kanterna löper längs varandra ingår. Båda sätten kräver en giltig sammanhängande rumskontur med fri yta fram till grannen. Avbryt förkastar förslaget. Ångra återställer rumsformen i ett steg. Synliga vektorväggar är magnetreferenser. Ändringar av en rumskant flyttar inte hindrets eller ljusytans egna punkter. Historiken tillhör den öppna redigeringssessionen. Omladdning läser den sparade geometrin och inleder en ny historik.
