# Legolas Greenleaf – Materialpanelen och bildvisaren (v0.34.84)

## För SL och spelare
Ny knapp **▧ Material** i programmets huvudmeny öppnar en mobilanpassad materialpanel.
- **SL/admin:** ser kampanjens icke-arkiverade material och kan söka, filtrera, bläddra samt välja flera bilder till ett privat *urval inför visning*.
- **Spelare:** ser bara material som Supabases RLS redan ger deras konto åtkomst till. Innan Frodo och Sam delar material är spelarnas panel normalt tom; detta är avsiktligt.
- Urvalet visar bildtitlar, antalet valda bilder och har **Förhandsvisa urval** / **Rensa urval**. Det är temporärt och lämnar inga presentationsposter eller delningar i databasen.
- Varje materialkort öppnar en bildvisare. Bilbos detaljpanel har även knappen **Förhandsvisa i Legolas**.

## Bildvisare
- Bilden anpassas proportionellt till tillgänglig yta (`object-fit: contain`). Ingen beskärning som standard.
- Helskärmsliknande mörk överläggsvy och valbar webbläsarhelskärm via Fullscreen API.
- Zoom med ±, procentknapp, mushjul, tangentbord (±), samt tvåfinger-pinch på pekskärm.
- Panorera förstorade bilder med mus eller finger; panorering begränsas till bildens synliga överskjutande yta.
- Föregående/nästa med knappar och piltangenter, Escape för stängning.
- PDF har inbäddad förhandsvisning och länk till dokumentet; TXT visas som text. Zoomverktygen används endast för bilder.
- Mobilanpassade bildrutnät, verktyg, miniatyrer och säkerhetsspärrar.

## Säkerhetsavgränsning
Koden efterfrågar enbart `campaign_materials` i vald kampanj, `archived_at IS NULL`. Serverns RLS begränsar spelarens synliga poster. Ingen fråga efter privata `campaign_material_gm_notes`.

Originalfiler läses från privata Storage-buckets med inloggad användares token, via befintlig `mapStorageFetch` och strikt path/bucket-kontroll. Inga `getPublicUrl` eller offentliga länkar används; temporära `blob:`-URL:er återkallas när användaren byter media, stänger eller loggar ut. En `MutationObserver` känner av att inloggningsvyn visas och tömmer både privat kö och bildernas URL:er.

Spelare kan inte använda SL-knapparna; SL-urvalet kan dessutom inte hämtas av icke-SL via API:t `legolasGetStagedIds`. Temporärt urval är endast klientbaserat och kvarstår inte vid omladdning.

## Kod
- `features/material/viewer.js`: rollstyrd materialpanel, urval, viewer, fokus och säker inhämtning.
- `features/material/viewer.css`: självständig responsiv design, importerad av modulen.
- `features/material/library.js`: monterar Legolas och integrerar Bilbos förhandsvisning.
- `tests/material-legolas-viewer.test.js`: kampanjisolering, path-validering, zoomgränser, SL-urval, behörighetsgränser och UI-kontrakt.

## Till Frodo
Frodo ska återanvända `window.legolasGetStagedIds()` när SL uttryckligen väljer **Visa nu**; och skapa verkliga delnings/presentationsposter i databasen. Legolas själv publicerar inte något till spelarna, vilket också gör det säkert att förhandsvisa hemliga bilder.
