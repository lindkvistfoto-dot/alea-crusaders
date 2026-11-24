# Living Hex i Äventyrsvyn

## Geometri och figurer

Kartakademins kalibrering ger rutnätets spetsiga hexagoner och befintliga axiala koordinater `q, r`. I V1 ritades bara pekarens målhex. Hero Class-bilden kompletterades med bronsbasen i figurresolverns äventyrsgren och en vald figur fick en gul ellips genom CSS. Äventyrsgrenen visar nu fristående Hero Class-masterbilder eller publicerade HERMES-friläggningar. För en aktör som saknar friläggning används tillgängligt porträtt eller initialer. Kartakademins och den äldre Stridsvyns bildval ligger kvar.

Välj **Inled strid** i SL Control Board för att visa det taktiska nätet. **Nästa runda** återställer rörelsebudgeten. **Avsluta strid** återgår till utforskning på samma kartinstans. Under **Hexagonernas utseende** finns rutnätets visningsläge, markeringar, färdväg och intensitet. Inställningarna delas inom kartan och spelmötet.

## Förflyttning

Första placeringen väljer en ledig giltig hex. Flytt av en redan placerad figur söker kortaste gåbara väg med A*, stridens sex grannar, Kartakademins rörelsegeometri, den målade golvmasken och objektens roterade, skalade fotavtryck. En stängd dörr som är markerad **Solid** blockerar även en övergång mellan två fria hexcentrum. Öppna vägglinjer med egenskapen rörelsehinder gör samma sak. Kartbilden i sig ger ingen kollisionsinformation. En sökning som tar mer än en bildruta kan avbrytas när pekaren flyttas. Föremålen har kvar sin fria placering.

Utforskning har obegränsad rörelse. I stridsläge kostar varje steg på vanligt kartgolv ett rörelsesteg. Källan till rundans budget följer Stridsvyns förflyttningsvärde. SL ser återstående steg och om halva förflyttningen passerats. Initiativ, handlingar och attacker tillhör den befintliga stridsmotorn och omfattas inte av rörelseprovet.

## Visning och synk

Hexlagret ligger i befintlig SVG-vy ovanför den Pixi-belysta kartan. Ett upprepat SVG-mönster täcker kartan med konstant antal element även vid utzoomning. Aktörernas konturer, planerade steg och destinationer delar hexgeometri. Vägen och ljusvågen använder tidsbegränsade animationer. Reducerad rörelse respekteras.

Den additiva migrationen `adventure_living_hex` lagrar runda, visningsinställningar och rörelseförbrukning per spelmöte och karta. SL:s transportkommando låser karttillståndet, kontrollerar startposition, angränsande steg, hinder, upptagna hexar och återstående budget, och sparar destinationen i den ordinarie figurraden i samma transaktion. Endast kartans befintliga revisionssignal skickas över Realtime.

Spelaren och SL:s spelarpreview använder samma projektion. Tillhörighet för andra aktörer än rollpersoner visas neutralt. Spelaren får endast återspela en nyligen genomförd rak rörelse som var synlig längs hela vägen och fortfarande är synlig vid läsning. När den raka linjen korsar en rumsgräns eller när figuren tar en omväg visas nästa tillåtna position. Detta täcker även smala hemliga områden mellan två utforskade hexcentrum. SL:s sökväg, hemliga tillhörigheter och andra aktörers budgetar ingår aldrig i spelarsvaret. Den redan skyddade kartbilden maskerar det taktiska lagret.

## Mästerskapsprov

`scripts/adventure-figures-visual.mjs` använder en isolerad spelsession i DEV-preview, publicerade HERMES-bilder för Astrid, Lyra och Evalin och en kalibrerad karta. Testet körs med mus och pekinmatning. Underlaget finns i GitHub Actions-artefakten **living-hex-desktop-mobile** och innehåller skärmbilder samt korta kartinspelningar när FFmpeg finns tillgängligt. PostgreSQL-testen provar den faktiska migrationen, en spärrad dörrpassage, positionskonflikter, budget, kartbehörighet och spelarprojektion.
