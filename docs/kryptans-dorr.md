# Kryptans dörr

**Spelbar pilot för Zeus och Pallas Athena · 20 november 2026**

Öppna `kryptans-dorr.html` i arbetsgrenens preview. SL kan också gå via **Admin → Platser → Kartor → Kryptans dörr**. Första fliken skapar ett isolerat spelmöte. Under **Bjud in spelare** väljer SL rollperson och öppnar eller skickar dess personliga länk. Håll SL-fliken öppen. Förvara SL-adressen privat. Den kan återöppna mötet i samma webbläsare på samma enhet. Spelarens länk ger kontroll över den tilldelade figuren och gruppens gemensamma observationer.

## Demonstration och godkännande

| Steg | Pröva så här | Godkänt när |
|---|---|---|
| 1. Förbered | Gå till inställningarna före första spelhandlingen. Flytta rumsdelningen, mät två punkter med känt avstånd och jämför 1, 3 och 7 hexar mot öppningen. Behåll grundmåtten första spelomgången. | Båda rummen delar dörröppning. Fotavtryckets bredd går att jämföra med karmarna. Grunden är 1,5 meter mellan grannhexarnas centrum. |
| 2. Se genom dörren | Öppna en inbjudan till Astrid och en till Lyra. Jämför först med SL. Öppna dörren. | Endast Lyra ser vakten från startpositionerna i grundkartan. Astrid tar del av observationen. Vakten fanns bara hos SL före öppningen. Lyras mörkerseende på 7,5 m är en försöksinställning. |
| 3. Skilj minne och syn | Stäng dörren och flytta väktaren i SL-vyn. Jämför båda spelarvyerna och öppna igen. | Tidigare observerat golv ligger kvar nedtonat. Varken vaktens figur, koordinater eller en ny publik revision avslöjar förflyttningen. Ny observation visar den faktiska positionen om någon ser dit. |
| 4. Flytta ljuset | Välj Evalin, använd en fri grannhex och växla facklan. Jämför i person-/gruppvy. | Låga och gnistor sitter vid handen. Ljus och skugga på golvet flyttar med figuren. En stängd dörr skärmar av det fysiska ljuset. Fladdrandet ändrar enbart bilden. |
| 5. Spela | Låt Lyra använda **Finna dolda ting**. Begär passage som spelare och avgör den som SL. Öppna dörren och starta strid. Välj den aktiva figuren och prova förflyttning, vapenbyte eller angrepp mot ett eget synligt mål inom räckvidd. Avsluta striden. | Ett öppet slag visas i journal och över kartan. SL ser den privata farokontrollen. Tur, handling och KP styr vad spelaren kan göra. Position och sår följer med tillbaka till utforskning. |
| 6. Bedöm bilden | Växla platt/låg/hög relief, dekorativt solljus, golvhex och minskad rörelse. Zooma in på Lyra och Evalin. | Fötterna stannar på kartan. Den aktiva golvhexen syns under figuren. Låg relief lämnar tröskeln lätt att läsa. En spelare kan ändra kamera och effekter utan att påverka andra. |
| 7. Återanslut | Ladda om SL på samma enhet och därefter en spelarflik. Prova både samma webbläsare och en separat dator. | Mötet återkommer med samma läge. Spelaren får bara sin behöriga projektion. Vid uteblivet livstecken döljs den gamla spelarvyn efter cirka 15 sekunder. |

## Hur delarna hänger ihop

| Ansvar | Källkod och beteende |
|---|---|
| Rum, hinder och rörelse | `features/crypt/preparation.js`, `scene.js`, `world.js` och `features/combat/footprint.js` använder HEXAGONIA:s koordinater och fotavtryck. Pilotens två rum, korridor och ett gångjärn specialiserar redigeringen. SL provar delning och tvåpunktskalibrering utan att skriva till ett kampanjrum. En förflyttning över tröskeln kontrolleras på nytt när SL godkänner den. |
| Syn och minne | `scene.js` testar ljus, väggsegment och varje levande observatör. `world.js` skapar därefter en personlig projektion med gruppens observerade ytor, komprimerat golvminne och just nu uppfattade aktörer. Minne och dörrens senast observerade läge kan överleva förlorad sikt. Ett privat slag eller en hemlig vaktrörelse ändrar ingen publik journal eller publik revision i sig. |
| Spelmöte | `session.js` och `session-wire.js` håller världen i SL-fliken. Varje spelarplats får en egen krypterad kanal. Webbläsarens lokala kanal fungerar för flikar på samma ursprung. DEV:s befintliga Realtime-broadcast överför samma krypterade meddelanden mellan enheter. En krypterad lokal kontrollpunkt låter SL fortsätta på sin ursprungliga enhet. En publicerad multiplayerkampanj behöver central ägarskapshantering och beständig lagring. |
| Regler och karaktärer | `features/combat/expert-rules.js` delas med kampanjens ordinarie strid och formulär. `features/crypt/rules.js` kopplar Expert-T20, kontrollslag, träfftabell, ABS, skada, initiativ och rörelsebudget till mötet. Verifierade DEV-värden är frysta för piloten. Ett angrepp kräver egen sikt även när gruppen delar sin karta. Provet täcker oförsvarat angrepp, skada och tappat/kastat vapen. Parering, full magihantering, ERF och automatiska fummeleffekter hör till kampanjens fortsatta integration. |
| Figurer | `hero-class.js`, `hero-field.js`, `hero-workbench.js` och Dockverkstans figurval använder samma fotankare och kronmått. Astrid är 190 cm, Evalin 120 cm, Lyra använder 180 cm tills egen längd finns. Konstnärlig faktor är 1,10. Atlasens alfayta och Evalins fjädertofs bestämmer inte rollpersonens regelhöjd. HERMES-nycklar har förberetts för ordinarie kart- och stridsvy där Hero Class kan väljas. Där krävs en publicerad nyckel för figurbilden. |
| Rendering | `render.js`, `materials.js`, `surface.js` och `figure-art.js` använder PixiJS 8 med Canvas 2D som reserv, det ortografiska golvet och samma väggöppning som reglerna. Bilderna renderas utan bas. Facklans handfäste och fotpunkterna är separata. Animation använder lokal tid. Kartan och ljusmasken kan återanvändas mellan bildrutor. |

## Bildbeslut

**I piloten.** Astrid andas i beredskap med en liten rörelse i utrustningen. Lyras mantelsidor har skilda rörelsefaser i Pixi. Evalin bär en separat tecknad fackla i den tomma handen. Varm sidobelysning och riktad golvskugga ger läsbar riktning vid två meters avstånd. Dörrbladet roterar kring karmen och har en målad sidoyta. Reglerna växlar vid beslutet om öppen/stängd dörr. Den korta gångjärnsanimationen förmedlar beslutet. Solstrålar, damm och ljusfläckar klipps till det projicerade golvet. Inställningen för solljus styr dekoren lokalt. Den fasta fysiska ljusöppningen följer spelreglerna även när en spelare stänger av dekoren.

**I Pixi-verkstaden härnäst.** Prova en mottagaryta på en enda vägg för att få Lyras skugga att vika upp från golvet. Jämför gradvis mörkare baksida med ett handmålat normalfält på ett enda plagg. Låt spelare avgöra om djupet går att läsa i den vanliga taktiska figurskalan. Kryptans solmaterial är en avgränsad komponent. Att registrera det som en redigerbar Kartakademin-effekt kräver ytterligare inkoppling och sparad källöppning.

**Efter pilotbeslutet.** Separata mantel-/utrustningslager behövs först om de former som döljs bakom befintliga pixlar måste visas. En tvådimensionell bild kan inte rekonstruera dem vid rotation. Hög vägg används för jämförelse och låg relief som utgångsläge. Full 3D, Spine, normal maps för hela biblioteket och AI-generering av kartor ligger efter speltestet.

**Bildresurser.** De tre godkända motiven används i förhandsstorlek med äkta alfa, totalt 463 906 byte. Inget nytt porträtt behövs. Golvsten, karm, gångjärnsblad, fackla och damm framställs i renderingen. HERMES-underlagen i `hermes/core/prepared/kryptans-dorr` ligger utanför körkön. Bildpublicering och ändringar i kampanjdata kräver senare beslut.

## Verifiering och beslut

Två minuters mätning över DEV:s faktiska Realtime med tre självständiga WebSocket-klienter och den lokala kanalen avstängd gav **101 ms median, 442 ms p95 och 1 137 ms max**. Mätvärdet är tiden från dörrkommandot till den långsammare av de två spelarprojektionerna, över 24 växlingar. Det beskriver mottagen speldata. Webbläsarens bildtid och upplevd fördröjning till nästa målade bild mäts separat. Förbindelsen behöver tåla enstaka svar över en sekund utan att ge dubbel handling.

`tests/crypt-*.test.js` täcker bland annat fysisk dörrbredd, hemlig vaktrörelse, eget synfält vid attack, tillstånd efter strid och återanslutning. `scripts/kartverkstad-crypt-visual.mjs` använder den byggda ingångssidan med SL och två spelarflikar. Körningen sparar skärmbilder av desktop och mobil samt en JSON-rad med tider. Rörelsetestet för Canvas-reserven bekräftade att ett dolt vaktsteg ger identiska bildpixlar, att reducerad rörelse ger stillbild och att fackla och dörr faktiskt ändrar bilden.

**Rekommendation till Zeus.** Speltesta först skillnaden mellan vad Lyra själv ser, vad gruppen får veta och vad den får angripa. Bedöm därefter om väggens låga relief och facklans golvskugga räcker för att förstå dörrsituationen. Kampanjbeständighet och produktionspublicering av figurerna är nästa separata beslut om kärnförloppet håller.
