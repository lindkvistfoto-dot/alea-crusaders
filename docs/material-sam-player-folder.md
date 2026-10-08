# Sam Gamgi – Spelarmappen (v0.34.86)

## Syfte
Sam förvandlar utvalt kampanjmaterial till en **permanent, återkallningsbar spelarmapp**. Det är separat från Frodos tillfälliga **Visa nu**.

## Arbetsflöde för SL
1. Öppna **▧ Material**. Under **🌿 Sam · Spelarmapp** kan du granska innehållet och se de filer som tidigare delats.
2. För en enskild fil väljer du **📁 Till spelarmapp** på materialkortet. Samma möjlighet finns i **Administration → Bildbibliotek** som **📁 Dela till spelarmapp**.
3. För flera bilder: markera dem med **+ Välj** i Legolas och använd **📁 Dela markerade (N)** i Sam-panelen. Bekräfta den permanenta delningen.
4. För att återkalla: tryck **Återkalla** vid materialet i spelarmappen, bekräfta. Materialet finns kvar i SL:s bibliotek och originalfilen raderas inte.
5. Spelarmappen har uppdateringsknapp och paginering om innehållet växer.

## Arbetsflöde för spelare
I samma **▧ Material**-panel visar **🌿 Sam · Spelarmapp** material som SL uttryckligen delat. Spelaren kan öppna dessa i Legolas bild- och dokumentvisare. Åtkomst kontrolleras av Supabase med kampanjmedlemskap, aktiv delning och filreferens. Spelaren kan inte dela, återkalla eller se SL:s egna privata anteckningar.

En tillfällig presentation i Frodo ger inte automatiskt en spelarmappspost. När Frodo avslutas är materialet inte kvar i Sam om SL inte valt **Dela till spelarmapp**.

## Databas och säkerhet
`supabase/migrations/20261008_sam_player_library_share.sql` implementerar `sam_set_material_share(p_campaign_id,p_material_id,p_shared)` som:
- Enbart kan anropas av en inloggad användare som dessutom verifieras som SL/admin för kampanjen.
- Kontrollerar kampanj, material och arkivstatus innan material delas.
- Skapar högst en *aktiv* delning per material. Upprepad delning är idempotent.
- Återkallar genom `revoked_at`, vilket bevarar historik. Originalets Storage-objekt berörs inte.
- Spärrar även direktinsättning av delningar för arkiverat eller fel kampanj-material genom trigger.
- Återanvänder befintliga RLS- och Storage-policyer; inga publika URL:er eller generella läsrättigheter införs.

**Observera:** Lokal browser-cache/öppna blob-URL:er hos en spelare kan inte återkallas retroaktivt. Behörigheten att begära filen från Storage försvinner direkt efter återkallning, om inte samma fil fortfarande presenteras genom Frodo.

## Kod
- `features/material/player-folder.js` — kampanjisolerad, testbar Sam-service.
- `features/material/player-folder-ui.js` — rollstyrd spelarmapp i Legolas.
- `features/material/player-folder.css` — responsiv design.
- `features/material/viewer.js` — knappen **Till spelarmapp** på materialkort.
- `features/material/library.js` — delar direkt från Bilbos detaljpanel.
- `tests/material-sam-player-folder.test.js` — automatiska tester.

## Nästa etapper
**Galadriel** lägger till Realtime så öppna spelarklienter uppdaterar mappen direkt. **Elrond** utför verkliga tester med separata SL- och spelarkonton, samt kontrollerar att återkallad fil inte kan hämtas från Storage på nytt.
