# HERMES 4.0 LIVE-5 — stopp före publicering

Kontrollerat 2026-10-21. Målet fem aktiva cutouts är **inte uppnått**. Ingen omkörning, ny köfil, Storage-upload, DB-skrivning eller Drive-behörighetsändring har gjorts under felsökningen.

## Befintlig körning

- Push-commit: `a05199cbabfc4ad549b37c2e1958b34dfea14564`.
- Workflow: `.github/workflows/hermes-drive-intake.yml`.
- [Actions run 39523256419](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39523256419), attempt 1, event `push`, status `completed/failure`.
- [Timing-API](https://api.github.com/repos/lindkvistfoto-dot/alea-crusaders/actions/runs/39523256419/timing): `run_duration_ms=23000`, alltså **23 s total Actions-tid**. Start 00:45:39 UTC, sista statusuppdatering 00:46:02 UTC. Intake-jobbet pågick 00:45:42–00:46:01 UTC; rapportens 2,88 s är bara intagsfasen.
- Jobb-ID `118971873327`. Python/Pillow, Deno-typkontroll och read-only WIF lyckades.
- Alla fem Inbox-original lästes och passerade PNG- och pinnad SHA-256-kontroll.
- Alla fem stoppades i steg `archive`: `FILE_NOT_IN_REQUIRED_HERMES_FOLDER`.
- Ingen `manifest.json` producerades; Supabase-publiceraren anropades aldrig.
- [Artifact 12312287479](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39523256419/artifacts/12312287479), `hermes4-batch-reports`, innehåller intagsrapport, batchrapport och retry-request; inga bildbytes. ZIP-SHA-256: `bc3358144d79437d9d19a23d92c4a9addebf58d942ac22797300c24b892923e9`.
- Rapporten bekräftar 0 lyckade, 5 misslyckade. `retry-request.json` innehåller exakt dessa fem misslyckade objekt.

CI och MINOTAURUS-guard har separata röda körningar på samma commit; de är inte den publiceringskörning som rapporteras här.

## Felorsak och korrigering

Ägaranslutningens metadata visar samtliga fem arkivfiler direkt i rätt mapp, `1FrKbSXLq1hp7eE6J6O-lrKeK3Vj5n-of`. Varje fil har reader-delning till `hermes-transfer@alea-hermes.iam.gserviceaccount.com`, medan arkivmappens ACL endast visar ägaren. Filernas placering är alltså korrekt vid efterkontrollen.

Detta stämmer med att Drive döljer `parents` för en individuellt delad fil vars förälder inte är tillgänglig. Körningens logg sparade inte faktisk `parents`-metadata, så exakt API-svar kan inte rekonstrueras från artifacten. Den verifierade felpunkten är den lokala mappgrinden efter lyckad arkivmetadatahämtning, inte WIF eller Supabase. Google beskriver dold föräldermetadata i [API-skillnaderna](https://developers.google.com/workspace/drive/api/guides/shared-drives-diffs); mappsökningens semantik finns i [sökoperatorerna](https://developers.google.com/workspace/drive/api/guides/ref-search-terms).

Korrigeringen behåller direkt kontroll när `parents` finns. Om fältet saknas krävs i stället ett fullständigt, serverfiltrerat `files.list`-resultat för den konfigurerade direkta föräldern och exakt filnamn, med exakt det pinnade fil-ID:t. Fel mapp, annat ID med samma namn, ofullständig sökning, trash och nekad åtkomst godtas inte. Samma token och read-only-scope används; inga Drive-rättigheter ändras.

**Det är ännu inte livebevisat att Drive lämnar sökbeviset till HERMES-identiteten utan mappdelning.** Om bevis saknas fortsätter koden att stoppa objektet med `FILE_PARENT_MEMBERSHIP_UNVERIFIED`. Den begränsningen får inte kringgås genom att godta manifestets mapp-ID som bevis eller vidga åtkomsten.

## Oberoende kontroll av arkiv och databas

Originalmanifest `1kK9DDNIxp8umzN2arv3pcSgRGc9UXYmd` lästes som verkliga JSON-bytes. Alla fem mål-ID:n, Inbox-ID:n, arkiv-ID:n och SHA-pinnar matchar köfilen och retry-artifacten.

Alla fem arkivoriginal lästes via ansluten Drive-identitet och verifierades mot manifestets faktiska hash och storlek: PNG, 1254×1254 RGBA, alfaextrema 0–255. Tillfälliga lokala PNG-kopior låg utanför checkout och togs bort efter kontrollen. Inga Drive-original ändrades eller raderades. Servicekontots hämtning av arkivbytes återstår eftersom mappgrinden stoppade den.

| Besvärjelse | Arkiv-ID | Originalbyte | SHA-256 | Aktiv cutout_path | Publicerad WebP-byte |
|---|---|---:|---|---|---|
| BESKYDDARE | 1r9GkcpslxAmujR0tkd04iVP1wa6z7mEW | 2187463 | 55424686af350143b9ed54941a56f47dfec35052afe29396641c310519a03842 | NULL | — |
| SNABBVÄX | 15WspLvntCvj1uYGyAaRhpNdY8usiPhwg | 1652524 | fe3abd12641af357b473bef23d6673bfe2ba0a47c5fe5ceab8a5c04662df3093 | NULL | — |
| FÖRÄNDRA | 1ooFKdS_rgB7-GLJHJnkj6dfVL0fLf0zE | 2332958 | 047fac4af9a43be8ad69d7376ea3946f7832e71b94d8f53e7e762703f9337e0f | NULL | — |
| TALA MED DÖD | 1p-S5aCCbhOxNKG_LWshShIqmizapI66b | 1920777 | a528c623a8099fe5f7921b00fec6cf769061c931495eec2908d535856d33d3d7 | NULL | — |
| VINDKONTROLL | 1J62HFU3fWivUc56vQWwmXpxezpVXcbBX | 2271568 | d44f401a20e44408cce115985cd3999360eb35fe16816f8ac40bf897900bdb06 | NULL | — |

Oberoende SQL i projekt `wbmosmkirsitkonejzpg` före och efter felsökningen visar identiska `id`, `spell_key`, `name`, `icon_path`, `illustration_path`, `illustration_wide_path` och `cutout_path` för de fem raderna. Samtliga cutouts är fortfarande NULL. `alea-hermes-source` innehåller **0 objekt / 0 byte**. Ingen WebP-återläsning eller aktivering kan rapporteras som genomförd.

## Test och nästa steg

- `python -m unittest discover -s tests -p 'test_hermes4_batch.py' -v`: 16 tester godkända.
- `python -m unittest discover -s tests -p 'test_minotaurus_direct.py' -v`: 3 tester godkända.
- Testerna omfattar exakta fil-ID:n, query-escaping, dolda föräldrar, fel mapp, trash, HTTP 403, ofullständiga sökningar, verklig WebP-konvertering med syntetiska bilder, partiellt batchfel och begränsad retry.
- Supabase-publiceraren och autentiseringskonfigurationen ändras inte. Befintlig live-typkontroll var godkänd.
- PR:n innehåller ingen ny köfil och kan inte genom sin merge starta publiceringsworkflowet.

**Invänta användarens mergegodkännande.** Efter godkänd merge: kontrollera att ingen annan publicering pågår och läs om aktuell DB-status. Använd därefter endast artifactens `retry-request.json` som ny unik köfil på main, med en enda push. Samtliga fem ingår eftersom samtliga fem misslyckades. Kör inte dessutom dispatch eller rerun av gammal kod.

Efter retry krävs fem Storage- och signerad-URL-återläsningar med hash, fem aktiva jobb och fem matchande cutout_path samt ny oberoende SQL-kontroll av övriga bildfält och tom källbucket. Vid delfel används bara den nya rapportens misslyckade objekt.

HERMES 4.0 är **inte ännu verifierad redo för större batcher**. Den verkliga publiceringsfasen, arkivåtkomst med HERMES-identiteten efter korrigeringen och appens mobil-/combat-visning återstår.
