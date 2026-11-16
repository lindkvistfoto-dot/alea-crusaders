# LIGHT & DARKNESS V1.0 — verifieringsprotokoll

Datum: 16 november 2026. Miljö: fristående verkstad. ALEA DEV/LIVE är inte ändrade.

## Genomförda kontroller

| Del | Resultat | Avgränsning |
| --- | --- | --- |
| TypeScript och Vite | Pass | Bygger utan typfel. |
| Fem ljuskällor | Pass, funktion | Två facklor, eldstad, lykta, solljus och månsken placerades via riktiga UI-händelser. |
| Tio samtidiga ljuskällor | Pass, funktion | Fyra ytterligare kopior skapades, fanns kvar under redigering och sparades. Inga applikationsfel observerades. GPU-FPS är inte uppmätt. |
| Reglage och hantering | Pass, funktion | Radie, flimmer, riktning, spridning, mörker, duplicering, radering, lagerordning, zoom och flyttning. |
| Ljuspolygon | Pass, funktion | Månsken begränsades till en fyrpunktspolygon. Polygonen sparades med källan. |
| Vatten + ljus | Pass, funktion | En Flowing Water-polygon och tio ljuskällor sparades och återöppnades tillsammans. De åtta vatteneffekterna finns kvar i biblioteket. |
| Scen V2 | Pass | Efter sparning, omladdning och filuppladdning var ljusdata, mörker, vattenpolygoner, bild och vy exakt lika i en ny export. Paus bevarades. |
| Scen V1 | Pass | Äldre format öppnades med vattenområdet kvar, inga ljuskällor och mörker av (0 %). |
| Responsiv vy | Pass, funktion | Vid 545 CSS-pixlars bredd aktiverades mobilbrytpunkten utan horisontell sidöverströmning. Ljus placerades, radie/flimmer ändrades och zoomknappar användes. |
| Pekskärm | Kvarstår | Verklig telefon och tvåfingersgest kunde inte provas i denna webbläsare. Pointer Events och tvåfingerhantering finns i implementationen. |
| Brusmodell | Pass | Startvärden, deterministiskt oregelbundet flimmer, lugnare lykta, elliptisk eldstad, stabila strålar och tio-ljusserialisering verifierades. |
| GLSL ES3 | Pass, separat GL-kontroll | Ljusvertex och fragment kompilerades och länkades. Vattenshaderns samtliga grenar kompilerade. |
| Kompositionspixlar | Pass, separat GL-kontroll | 0 % mörker gav ursprungliga RGB (160,120,80); 63 % gav (63,50,37); 100 % utan ljus (6,9,12); med fackelbidrag (189,92,35); överlapp (189,142,57). |

## Visuell verifiering och åtkomst

Den automatiserade testwebbläsaren väljer Canvas-reservläge och kan därför inte visa PixiJS WebGL-filtren. Visuellt mörker, organiskt flimmer, mjuka överlapp, färger och vattenanimation är **inte slutverifierade i en WebGL-webbläsare**. OpenGL ES-kompilering/pixeltest är en separat teknisk kontroll och ska inte beskrivas som fullständig visuell browserverifiering.

Publiceringsadressen är privat och visar ChatGPT-inloggning i testwebbläsaren. Publicering ska verifieras med Sites publiceringsresultat; fullständiga funktionstester på den skyddade adressen kräver en inloggad webbläsarsession. Ändra inte appens åtkomst enbart för att testa den.

Ingen skuggkastning från byggnader/väggar. Ljuset ändrar belysningen i befintligt bildinnehåll och kan inte geometriskt skilja en vägg från ett golv utan polygonmask. Ljuskartan har mjuk, reducerad upplösning för stora bilder; många masker och mycket stora kartor kan påverka prestanda. Ingen kvot för ljuskällor infördes.
