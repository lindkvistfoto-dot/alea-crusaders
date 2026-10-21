# ARTEMIS – verifiering av automatiseringen

Testdatum: 2026-10-21. Bas: `59f9815c1b5bb1739ab027283fcc44ff15477c39` (senaste `main` vid start). Inga riktiga köfiler, nya produktionscutouts eller Supabase-skrivningar ingår. Den befintliga publiceraren, WIF-trusten och databasschemat har inte ändrats.

## Automatiska tester

Slutlig lokal kontroll: **45 Python-tester och 40 JavaScript-tester passerar**. Python-totalen består av 24 nya Work-tester, 16 befintliga batchtester och 5 MINOTAURUS-kompatibilitetstester. JavaScript-totalen omfattar de åtta testfiler som körs av den uppdaterade MINOTAURUS-guarden, inklusive fyra nya transporttester.

```sh
python -m unittest discover -s tests -p 'test_hermes4*.py'
python -m unittest discover -s tests -p 'test_minotaurus*.py'
npx vitest run tests/minotaurus-publisher.test.mjs tests/hermes4-batch-publisher.test.mjs tests/hermes4-work-host.test.mjs tests/hermes-wide-publisher.test.mjs tests/hermes-spell-cutout-profile.test.js tests/hermes-v2-gates.test.mjs tests/arcane-gallery-release-smoke.test.js tests/arcane-morph-art-assets.test.js
python -m py_compile scripts/hermes4_work.py scripts/hermes_drive_intake.py
node --check scripts/hermes4_work_host.mjs
```

Diffkontroll och MINOTAURUS originalspärr körs också. Deno finns inte i terminalmiljön; publicerarens TypeScript-typkontroll ligger kvar i befintlig PR-guard. Ingen full apptestsvit eller ny visuell granskning av produktionsvyn påstås.

Den simulerade tjugobildsbatchen ger 20 mottagna, 20 verifierade arkivoriginal, 20 simulerade publiceringar/aktiveringar och 20 verifierade Inbox-flyttar genom en gemensam startorder. Schema-/identitetsgränserna provas vid 1, 20 och 100 objekt. Det är inte ett verkligt MINOTAUR EXAM-20.

Testerna omfattar:

- Ready-markör, förväntat antal 1–100, hash/format/alfa, fil-/målidentiteter, visuellt godkännande och ofullständig leverans utan startorder.
- Verklig Pillow-kontroll och WebP-konvertering av syntetisk 1024×1024 RGBA, med simulerade Drive-/Actions-resultat. Inga PNG skrivs av intaget.
- SHA-verifierad återanvändning av arkiv och stopp vid korrupta/tvetydiga kopior.
- Förlorat svar efter arkivkopiering, köcommit, flytt och rapportsparande; omstart med samma SQLite-ledger.
- Individuella publiceringsfel, endast misslyckade objekt i nästa försök, skyddade lyckade objekt och begränsat antal automatiska försök.
- Fel workflow/branch/commit/run-ID, fel mål eller manifestinnehåll i artifact, saknat arkivbevis och icke-tom källbucket: ingen Inbox-flytt.
- Särskild mapp för verifierade dubbletter, bevarade andra föräldrar, slutrapport före manifestflytt och verifierad manifestflytt före `completed`.
- Bara reader för det befintliga HERMES-kontot, processlås, hemlighetsrensade externa fel och avvisade externa materialiserings-URL:er.
- Work-hostens skrivspärr, verktygslista, fragmenterade meddelanden, långsam verifiering, materialisering av både rena och `sediment://`-prefixerade fil-ID:n och städning av temporära original.
- Befintlig TypeScript-publicerare exekverad i Node mot simulerad DB/Storage: återläsning, aktivering, delfel, omkörning utan nya uploads, befintlig aktiv referens, målpinning och säker återställning.

## Verkligt Drive-adapterprov, endast syntetiska testobjekt

Isolerad testmapp under `05 – BATCHER & RAPPORTER`:
[HERMES4-AUTOMATION-ISOLATED-TEST-20261021](https://drive.google.com/drive/folders/1QWu_blFu4c651nQJoHp0c4Q9WFDxUnsU).

En lokalt genererad PNG (transparent bakgrund och en enfärgad ellips) laddades upp som nytt testobjekt med den befintliga anslutna användaridentiteten. Den kopierades server-side till testets arkivundermapp, återlästes som autentiserade bytes, och testkällan flyttades till testets karantänundermapp. Ingen riktig Inbox-bild eller produktionsarkivbild flyttades.

- Syntetiskt käll-ID: `1NdbrBH07XsqMS67yvP6XaPvsDHtz_IV2`.
- Syntetiskt arkiv-ID: `12AfTZ_p6SjgjQN5zyRbfoNUVBR5ImLcJ`.
- Båda: **9 058 byte**, SHA-256 `5fdf8f66ace08463f388b7a737fb6c9c54d62db7866757ff3dcdc354042459d4`.
- Samma käll-ID och oförändrade bytes efter flytten.
- `adapter-verified-report.json` skapades, återlästes, uppdaterades på samma fil-ID och återlästes igen genom den levererade Drive-adaptern och Work-hosten.
- Två rapportförsök från felsökningen finns kvar i samma isolerade mapp. De visade att den äldre sökfunktionen utelämnade rå JSON; regressionen är täckt och adaptervägen använder nu direkt mapplistning. Testobjekten har inte raderats permanent.

GitHub-adaptern läste även den historiska misslyckade körningen `39523256419`, dess exakta batchrapport och jobbens tider genom Work-hosten: fem `failed`, 22 000 ms enligt det definierade väggtidsmåttet (körstart till sista jobbslut). Det är historiskt återläsningsbevis, inte en ny publicering. Den äldre timing-API-rapporten på 23 s inkluderar även statusuppdateringen efter jobbslutet.

En skrivskyddad iteration av Work-hosten mot anslutningarna lyckades också. En sådan engångsiteration är inte bevis för beständig schemalagd drift.

## Vad provet inte verifierar

Ingen ny produktions-Action startades och inga registerreferenser ändrades. Det verkliga adapterprovet omfattar Drive, inte liveaktivering i Supabase. Testernas Actions run-ID:n och tider är simulerade när FakeGitHub används. De tidigare publicerade piloterna är separata historiska bevis.

En beständig Work-worker med verktygsåtkomst och lagring har inte provisionerats. Acceptansen för helt obemannat flöde är därför blockerad enligt [AUTOMATION.md](AUTOMATION.md). EXAM-20 ska fortfarande göras först därefter med tjugo nya, av Work godkända cutouts.
