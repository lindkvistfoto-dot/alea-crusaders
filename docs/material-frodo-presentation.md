# Frodo Bagger – Visa nu (v0.34.85)

## För spelledaren
Öppna **▧ Material** i huvudmenyn. Lägg till en eller flera bilder i SL:s urval med **+ Välj**. Tryck **📡 Visa första valda**, **Föregående** eller **Nästa** för att bestämma exakt vilken bild spelarna ska få se. **■ Avsluta visning** tar bort den aktiva presentationen.

Du kan också öppna **Administration → Bildbibliotek**, välja ett material och trycka **📡 Visa nu för spelarna**. Samtliga knappar anropar samma serverkontrollerade Supabase-funktion.

Endast *en* bild eller ett dokument presenteras åt gången per kampanj. Urvalet i Legolas är fortsatt privat för SL. Ingen permanent spelarmappspost skapas.

## För spelarna
När SL aktiverar en presentation får kampanjmedlemmarna åtkomst till **just det materialet**, via databasens RLS och exakt matchad Storage-referens. Knappen **▧ Material** visar det aktiva materialet och en **Visa aktuell bild**-knapp. Om klienten är aktiv och inloggad sker en begränsad uppdateringskontroll var femte sekund. När en ny presentation registreras öppnas Legolas privata bildvisare automatiskt. Spelaren kan stänga den och öppna den igen från panelen.

När SL avslutar visningen upphör spelarens presentationsbehörighet (om inte samma material uttryckligen delas separat i en framtida spelarmapp). Klienten stänger den automatiska förhandsvisningen vid upptäckt av avslutad presentation och laddar om biblioteket. Uppdateringskontrollen körs inte för SL, utloggade klienter eller dolda webbläsarflikar. Galadriel ersätter polling med riktiga Realtime-uppdateringar.

## Databas
Migration `supabase/migrations/20261008_frodo_presentation_command.sql` upprättar:

- `frodo_set_presentation(p_campaign_id, p_material_id, p_expected_revision)`, en GM/admin-skyddad, `SECURITY INVOKER`-funktion för att visa/byta/avsluta.
- Optimistisk versionskontroll mot `campaign_material_presentations.revision`: en gammal SL-klient kan inte tyst skriva över en nyare presentation.
- Servervalidering av kampanj, materialexistens och `archived_at IS NULL`.
- Trigger för att blockera rå direktpresentation av arkiverade material.
- Inga öppnade `anon`-rättigheter, ingen upplåsning av hela privata buckets, inga publika URL:er eller permanenta shares.

Ingen presentation aktiverades under installationen av databasmigreringen.

## Kod och test
- `features/material/presentation.js` — API, behörighetskontroll och versionshantering.
- `features/material/frodo-ui.js` och `frodo-ui.css` — SL-kontroller, spelarstatus och uppdateringskontroll.
- `features/material/library.js` — koppling från Legolas och enknappsvisning från Bilbo.
- `tests/material-frodo-presentation.test.js` — automatiska tester för GM-only, RLS-anrop, bildbyte, avslut, kampanjkontroll och samtidighetskonflikter.

## Avgränsning
Permanent delning och återkallande av material hör till **Sam**. **Galadriel** inför Realtime i stället för avgränsad uppdateringskontroll. **Elrond** verifierar två riktiga separata konton samt bildbyte och åtkomst efter avslutad presentation.
