# Bilbo – Berättelsernas bibliotek (v0.34.79)

## Leverans och användning

Bilbo bygger vidare på Gandalf och Gimli med **Administration → Bildbibliotek**.

- Välj *Bildbibliotek* i Aleas administrationsöversikt. En separat väg till *Materiallagring* (Gimlis uppladdning) finns kvar.
- Bläddra i **24 material per sida**, eller sök efter titel/beskrivning. All filtrering och paginering sker på servern per **aktiv kampanj**.
- Filtrera på **Plats, SLP, Monster, Föremål, Karta, Dokument, Övrigt** och på **Aktiva / Arkiverade / Alla**.
- Sortera nyast, äldst eller titel. Växla mellan rutnät och lista.
- Bilder får miniatyrer via auktoriserade, privata Storage-hämtningar. Ingen public URL skapas.
- Klicka på material för att förhandsvisa originalet (bilder, PDF, TXT), redigera titel, kategori och beskrivning.
- **SL-anteckningar sparas i separat RLS-skyddad tabell** `campaign_material_gm_notes`, inte i text som kan delas till spelare.
- Arkivera och återställ material utan att radera filen. Material med en *aktiv delning eller presentation* får inte arkiveras (trigger i databasen).
- Anpassad för smalare mobilskärmar.

## Tekniska komponenter

- `features/material/library.js`: Bibliotekslogik, frågeparametrar, vy, detaljeditor, privata anteckningar, arkivering.
- `features/material/storage.js`: Gimlis autentiserade filhämtning återanvänds för bucket `campaign-materials`.
- `legacy/app.js`: adminsektion `library` öppnas med kampanjisolerad inläsning.
- `src/main.js`: importerar Bilbos bibliotek som i sin tur importerar Gimlis lagring. Båda adminpanelerna monteras på Aleas befintliga administration.
- `src/styles/app.css`: mörk, kontraststark och responsiv layout.
- `supabase/migrations/20261008_bilbo_archive_guard.sql`: triggar mot arkivering av redan presenterat/delat material.
- `tests/material-bilbo-library.test.js`: regressionstester för paginering, säkra kort, kampanjisolering, metadata, SL-anteckningar och arkivering.

## Säkerhet

PostgREST-frågor begränsas alltid med `campaign_id`. Sparning av metadata har dessutom en `updated_at`-kontroll som upptäcker när en annan redigerare hunnit spara först.

Säkerheten vilar på Gandalfs befintliga **RLS**, inte klientknapparnas synlighet. Privat Storage-läsning kräver befintliga Storage-policies. Materialbeskrivningen är spelarsäker text som senare kan delas. SL-anteckningar ligger i en egen tabell med enbart GM/admin-behörighet.

Vid sidbyte och filterändringar rensas temporära object-URL:er för att inte behålla bilder i minnet.

## Avgränsning mot senare etapper

Biblioteket visar registrerade rader i `campaign_materials`. **Äldre bilder i plats-, SLP-, monster- och kartregistren importeras inte automatiskt** i Bilbo: det hanteras i **Aragorn** genom kopplingar till befintliga originalfiler, utan duplicering.

**Visa nu** och realtidsdelning byggs i **Frodo/Galadriel**. **Spelarmapp** byggs i **Sam**. Att en bild kan förhandsvisas i Bilbos SL-vy betyder alltså inte att spelare ser den.

Första uppladdningen görs under Gimlis *Materiallagring* och syns i Bilbo efter att du öppnat eller uppdaterat biblioteket.

## Verifiering

- GitHub CI: automatiska tester + Vite-build.
- Supabase: migration installerad.
- Databasens smoke-test: tillåten arkivering/återställning, aktiv share blockerar arkivering, aktiv presentation blockerar arkivering; samtliga tillfälliga ändringar `ROLLBACK`.
- Riktig browser-test med separata SL/spelarkonton kvarstår till Elronds slutprov.

**Nästa etapp:** Aragorn – koppla material utan duplicering till befintliga platser, SLP, monster och stridsscener.
