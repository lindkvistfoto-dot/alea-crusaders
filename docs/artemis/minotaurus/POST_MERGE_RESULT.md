# MINOTAURUS — slutlig integration och STOPP-pilot

Verifierat 2026-10-20 UTC. **GO för fortsatt bildproduktion via den befintliga HERMES Drive-kedjan för dess åtta stödda typer.** Ingen bredare publicering startades och ingen ny produktionsbild aktiverades.

## Merge och filträd

- PR [#129](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/129) manuellt mergad 19:14:01 UTC, merge-commit `8fb86bcbea75cde52b7737d82e9bf38be3e0d09b`.
- Granskad PR-head: `ae9f3fdf0e558036075edc41546773952be4398e`; föregående main: `45d8ce8a2213282cf5b1f14ac473011bba85d070`. Alla merge-trädets poster matchar granskad head.
- GitHubs kompletta rekursiva träd: **1 633 186 234 → 69 044 471 byte** vid merge; faktisk nettominskning **1 564 141 763 byte**.
- Exakt **547 originalfiler (546 PNG + 1 ZIP) och 18 karantänfiler**, sammanlagt **1 564 113 258 byte**, borttagna. Inga original återinförda i pilotcommitten.
- Pilotcommitten innehåller 69 044 696 byte; denna resultatrapport tillkommer som text. Storlekar är summerade blobstorlekar per filsökväg, inte packad Git-diskstorlek.
- Samtliga befintliga WebP-blobbar är identiska. Ingen historik omskriven; historiska Git-objekt finns kvar.

## Exakt en livepilot

Köfil: `hermes/queue/minotaurus-stopp-pilot-20261020.json`, exakt kopia av `pilot-request.json`, `mode=pilot`.

Köcommit: `d9e2db2502029419e8e3e25dcc65b1a133bedff8`.
Actions: [39481844175](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39481844175), första försöket, **success**. Ingen separat dispatch eller återkörning.

Befintlig Google WIF, Drive-readonly-scope och `HERMES_SUPABASE_SERVICE_ROLE_KEY` användes oförändrade.

- Drive-ID: `1I6Wx2kTtVqN2l76cjwqvdOmN3_iLDY6C`.
- Original: 2 678 163 byte, PNG 1254×1254 med alfa.
- Original-SHA-256: `bc00be5e732aca25b78a7ff7c8cdceed07f097e922da73c13bb44fc05e5b3e49`.
- Genererad WebP: 640×640, bevarad alfa, quality 90, **167 144 byte**.
- WebP-SHA-256: `de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170`.
- Verklig immutable upload med `upsert=false`, Storage-download och publik URL-återläsning verifierade exakt samma SHA-256.
- Loggbevis 19:15:40 UTC: `HERMES_DIRECT_PILOT_VERIFIED`, `pointers_unchanged=true`.

Enda testobjektet, kvar för granskning:
`alea-hermes-public/hermes/minotaurus-pilot/symbol/stopp/de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170.webp`.

## Oberoende Supabase-efterkontroll

SQL 19:16:29 UTC: `alea-hermes-source` **0 objekt / 0 byte**; exakt **1** isolerat MINOTAURUS-pilotobjekt. Objektets storlek återläst: 167 144 byte.

STOPP-pekaren före och efter är exakt:
`hermes/symbol/stopp/de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170.webp`.
Det aktiva objektet finns kvar som image/webp, 167 144 byte.

Sorterade SQL-snapshotar av samtliga berörda bildfält och hela jobbloggen är identiska före/efter:

| Register | Rader | MD5 av sorterad snapshot före och efter |
|---|---:|---|
| rule_magic_symbols | 12 | 96d2bf139bd10a166925d14ed686766c |
| rule_spells | 91 | 8475103df4df1ed11f091170ddb43d70 |
| rule_skills | 82 | 0446df267777308c6aca2af526bf8811 |
| hermes_jobs | 519 | ec6a7658dc11815ec273e1189dbc0e6c |

Snapshotarnas MD5 används endast för förändringsjämförelse; bildbytes verifieras med SHA-256.
Samtliga **156 aktiva HERMES-ikonreferenser** har motsvarande objekt i public-bucketen, **0 saknade**. Befintliga statiska WebP-filer och manifest är oförändrade. [Pages-körning 39481842430](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39481842430) är success. Ingen fullständig visuell genomgång av alla bilder har gjorts.

## Spärrar, batchstöd och riktade kontroller

- [Main-guard 39481693158](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39481693158): originalspärr, **5 Python- och 28 JavaScript-tester** samt Deno-kontroll av publicerare och Edge Function gröna. [Pilotcommit-guard 39481844127](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39481844127) är också grön.
- Alla åtta bildprofiler konverteras i riktade tester. Befintlig batchhantering behandlar endast explicita köfiler, isolerar varje output och rapporterar röd slutstatus vid delfel. Ingen livebatch eller produktionsaktivering kördes.
- Äldre GitHub PNG-, UI-, reference- och Gallery Kit-workflows saknar push-trigger och avslutas med fel vid dispatch. UI-publiceraren och Gallery Kit-kommandot avvisar körning.
- Driftsatt `hermes-v2` återläst: **v10, ACTIVE, verify_jwt=true**, ingen Storage-uploadkod; äldre upload/import/retry är pensionerade.
- Drive-intaget har endast contents:read samt befintlig OIDC-behörighet. Publiceraren tillåter endast WebP i befintliga display-buckets. Original-/karantänträd och nya/ändrade PNG-filer avvisas av guarden.

## CI, checkout och kvarvarande hinder

Senaste PR-CI [39480434478](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39480434478), merge-CI [39481693147](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39481693147) och pilotcommit-CI [39481844349](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39481844349) har exakt samma **29 normaliserade felnamn** som aktuell main-körning 39440446091 och dokumenterad baslinje: **0 nya / 0 saknade**. De ärvda felen har inte reparerats.

Gallery-körningen på PR-head klarar 89 tester och browsersteget, men Vite-bygget kraschar med exit 139 efter 95 moduler. Samma krasch reproduceras lokalt på oförändrad main. Flera automatiska main-smoke-workflows stoppas vid samma byggsteg; deras föregående teststeg är gröna. Allmän Vite/runner-byggstabilitet kvarstår som separat hinder. Inga säkerhetskontroller kringgicks.

Verifierad Actions-checkout på merge-main i Pages-buildjobb 118831603199: **2 s** (19:14:20–19:14:22 UTC). Pilotens blobless sparse checkout: **1 s** (19:15:13–19:15:14 UTC). Actions-tider har sekundupplösning och är enstaka prover. Tidigare lokalt mätt median 7,6467 → 0,2775 s finns i CHECKOUT.json och är inte samma mätmetod.

Terminalens proxy kunde inte nås; remote verifiering och genomförande skedde via fungerande GitHub-/Supabase-anslutningar samt befintliga Actions. Inga nya credentials skapades och inga WIF-villkor ändrades.

Äldre UI-intag kräver fortsatt separat granskad Drive-migrering. PR #113:s äldre originalhydrering får inte mergas oförändrad; #113, #126 och #127 har inte ändrats. **STOPP-piloten är godkänd; fortsatt avgränsad bildproduktion via stödd HERMES-kedja har GO.**
