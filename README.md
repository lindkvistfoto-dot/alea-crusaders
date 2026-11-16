# ARCANE PIXIJS WORKSHOP — LIGHT & DARKNESS V1.0

Fristående experimentell PixiJS 8 / TypeScript / Vite-verkstad.

Publicerad app: https://arcane-pixijs-workshop.ablazewave16.chatgpt.site

## Användning

Välj en av åtta vatteneffekter och rita en polygon. För ljus: välj Fackla, Eldstad, Lykta, Solljus eller Månsken under LIGHT & DARKNESS i effektväljaren, klicka på kartan och redigera ljuset i ljuspanelen. Det går också att placera fler av samma typ med Placera ny ljuskälla. Typ / ändra valt ljus ändrar den markerade ljuskällan.

Mörker startar på 63 %, radie på 180 bildpixlar och flimmer på 35 %. Solljus och månsken har stabil intensitet och reglage för strållängd, spridning och riktning. Rita ljuspolygon begränsar det markerade ljuset med samma kartkoordinater som vattenpolygonerna. Ren kartpresentation döljer redigeringsmarkörer.

Spara scen laddar ned en portabel JSON-fil som inkluderar bild, vatten, mörker, ljuskällor, inställningar och vy. Format V2 öppnar även tidigare V1-vattenscener utan att lägga till mörker i dem.

## Rendering

Alla ljus adderas till en gemensam RenderTexture, med upplösning som högst motsvarar 2048 pixlar längs längsta sidan. Detta är en kvalitetsinställning för den mjuka ljusmasken, ingen begränsning på kartbilden eller antalet ljus. Kartan och vattnet kompositeras med ljuskartan i en gemensam shader. Markörer renderas efter kompositionen. Radier anges alltid i kartans egna bildkoordinater. Ljusmasken uppdateras endast vid ändringar eller aktivt flimmer. Mask- och texturresurser frigörs vid kartbyte/redigering.

Fackel- och eldstadsflimmer använder deterministiskt interpolerat brus på flera tidsskalor. Lykta varierar svagare, månsken har kallare färg och lägre bidrag. Väggskuggor och ljusocklusion ingår inte. Ljuskartan använder additiv färgblandning; lagerordning sparas och avgör markörernas urvalsordning, medan bidragen från ljusen summeras oberoende av ordning.

WebGL behövs för shaderfiltren. Canvas-reservläge visas uttryckligen i statusraden och innebär att vatten- och ljusshadern inte visas.

## Isolering

Denna gren innehåller bara den fristående verkstaden och ska inte mergas till ALEA main eller development. Inga Supabase-, HERMES-, OLYMPIA-, kampanjkarts- eller stridsvyintegrationer ingår.

## Lokala kontroller

- `npx tsc --noEmit`
- `npm run build`
- `node tests/light-model.test.mjs`
- `python tests/check-shaders.py` (valfri Linux-kontroll; kräver EGL och en ES3-kapabel implementation)

Se [testprotokollet](docs/LIGHT_DARKNESS_VERIFICATION.md) för vad som verifierats och kvarstående begränsningar.
