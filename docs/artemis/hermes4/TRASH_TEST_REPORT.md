# HERMES 4.0 – papperskorgskomplettering av PR #135

Bas: PR-head `b2af50e7daa51e174355635afb6f2dafeccb5c1e`. Ingen merge, produktionspublicering eller EXAM-20 har utförts. Ändrade produktionsreferenser i databasen: **0**.

## Vad som ändrats

Slutsteget för nya Work-batcher använder `trashed=true` i stället för att flytta original till karantän. Arkivering, publicerare, dess `drive.readonly`-autentisering, rapportverifiering och permanent ledger behålls. Äldre redan färdiga `moved`-poster migreras inte.

Före papperskorgen krävs verifierad arkivplacering och SHA-256, befintligt aktiverings-/Storage-bevis, exakt Inbox-ID och `source_revision`, egen exklusiv ledgerclaim och ingen observerad annan pågående HERMES-batch som refererar källan. Ofullständiga kontroller stoppar städningen. Rå metadata måste visa PNG direkt i Inbox och `canTrash=true`. Villkorlig PATCH måste vara liveverifierad och använda ett starkt ETag. Ett sparat intent och en filspecifik markör möjliggör återhämtning efter tappat svar; fel revision eller någon annans papperskorgsåtgärd godtas inte.

Rapporten behåller det kompatibla totalfältet `moved_from_inbox` och lägger till `trashed_from_inbox`. Manifestet flyttas fortfarande till 05 först efter verifierad bildstädning; slutstatus sätts efter verifierad manifestflytt.

Kontrollen av andra pågående körningars köinnehåll fångade även ett fel i den tidigare anslutningsavkodaren: GitHub Contents fält `content` är Base64 och får inte JSON-avkodas en andra gång. Det är rättat och regressionstestat, så att både köläggning och referenskontroll kan använda samma adapter.

## OAuth-scope och faktisk Drive-behörighet

`files.update` accepterar `drive.metadata` för metadataändring. Städklienten använder separat kortlivad HERMES-autentisering med detta scope, utan att begära fullständigt `drive`. `drive.file` är snävare men bygger på appens filspecifika auktorisering; det är inte verifierat för dessa befintliga Work-filer. Metadata-scope är det valda generella metadataskrivscopet, inte ett påstående om att ett liveprov bevisat minsta fungerande scope. Scopet är inte mappspecifikt; kodens Inbox-/ID-/revisiongrind och Drive-ACL:erna är också nödvändiga.

Observerad ACL i denna komplettering:

- `01 – INBOX`: HERMES är `writer`.
- Originalarkivets rot och cutout-mappen: samma konto är fortsatt `reader`.
- Det syntetiska Inbox-objektet ägs av den anslutna användaren; HERMES är `writer`.

**Editor är inte ett bevis på papperskorgsrätt.** Google dokumenterar att ägaren behöver utföra papperskorgsåtgärden i My Drive. Ett bredare OAuth-scope löser inte det ägandeskapet. Klienten kontrollerar därför `canTrash` och stoppar vid avvikelse; den byter aldrig automatiskt till ägaridentiteten och ändrar inte ägandeskap eller produktions-ACL. En fungerande rättighetslösning behöver verifieras innan städningen kan aktiveras.

Google anger också att papperskorgsfiler omfattas av den ordinarie 30-dagarsregeln. Ingen applikationskod gör permanent radering.

Källor: [files.update och tillåtna scopes](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update), [scope-definitioner](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [papperskorg, ägandeskap och 30 dagar](https://developers.google.com/workspace/drive/api/guides/delete), [headRevisionId och capabilities](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

## Verkligt isolerat prov: blockerat, inte godkänt

Två nya syntetiska objekt skapades via befintlig ansluten användaridentitet. Inga produktionsoriginal användes. PNG-fixturen är **9 057 byte**, SHA-256 `c4619c48708f9d760dbe28a45f6be81f72f5950c11ff047ceae94d1923af4e88`.

| Objekt | Faktiskt Drive-ID | Observerad placering |
|---|---|---|
| Syntetisk Inbox-PNG | `13dkdBkYsRdD7CuNE9KvIaU2PlydWdZjJ` | 01 – INBOX |
| Syntetisk negativ kontroll | `13IyMkV-xrhwaqtt1_AxavpuNE5vTqdva` | Befintlig isolerad testmapp under 05 |

Inbox-filens observerade revision är `0B0ijFzf4F86JZllFTnRmUHR0b2p6RHJVMWwwTURtUGw5Umk0PQ`. Endast den negativa syntetiska kontrollen fick en filspecifik reader-delning till HERMES. Inga produktions-ACL:er ändrades.

Provet kördes med `scripts/hermes4_trash_probe.py` och stoppade **före API-anrop** med `HERMES_CLEANUP_CREDENTIALS_MISSING`. Den aktiva molnmiljön exponerar ingen HERMES-credential eller outbound-identitet. Drive-anslutningens verktyg har inte `trashed` eller revisionens HTTP-villkor i sin uppdateringsyta. Ägaranslutningen användes inte som ersättning för HERMES-testet. Testfilen ligger därför kvar i Inbox och är inte en ready-leverans.

| Efterfrågat HERMES-bevis | Resultat |
|---|---|
| Läsa den syntetiska filen | Inte liveverifierat med HERMES |
| Lägga den i papperskorgen | Inte utfört |
| Filen försvinner från levande Inbox | Inte uppnått; filen ligger kvar |
| Arkivet oförändrat enligt HERMES före/efter-snapshot | Inte liveverifierat; ingen arkivskrivning utförd |
| Avvisa fil utanför Inbox | Automatiskt simulerat test godkänt; verkligt HERMES-prov blockerat |
| Servern avvisar fel If-Match med 412 | Inte liveverifierat; produktionsskrivspärren kvarstår |

Det nya manuellt startbara testworkflowet `hermes-trash-probe.yml` innehåller separat read-only- och metadata-WIF med samma befintliga konto. Det använder endast de två committade syntetiska ID:na och ingen Supabase-secret. Jobbet tillåter bara `main`; WIF-trusten har inte vidgats. Workflowet finns därför inte att köra med denna kod på betrodd main före granskad merge. Ingen merge eller testkörning från PR-grenen har gjorts. Detta är en förberedd behörighetskontroll, inte en genomförd automatisk leverans.

## Lokala tester

**59 Python-tester och 41 JavaScript-tester godkända lokalt (100 totalt).** Python omfattar 16 befintliga batchtester, 27 Work-tester, 11 papperskorgs-/säkerhetstester och 5 MINOTAURUS-kompatibilitetstester.

```sh
python -m unittest discover -s tests -p 'test_hermes4*.py'
python -m unittest discover -s tests -p 'test_minotaurus*.py'
npx vitest run tests/minotaurus-publisher.test.mjs tests/hermes4-batch-publisher.test.mjs tests/hermes4-work-host.test.mjs tests/hermes-wide-publisher.test.mjs tests/hermes-spell-cutout-profile.test.js tests/hermes-v2-gates.test.mjs tests/arcane-gallery-release-smoke.test.js tests/arcane-morph-art-assets.test.js
python -m py_compile scripts/hermes4_drive_trash.py scripts/hermes4_trash_probe.py scripts/hermes4_work.py scripts/hermes_drive_intake.py
node --check scripts/hermes4_work_host.mjs
```

Diffkontroll och originalspärr körs. Den befintliga TypeScript-publiceraren är oförändrad; dess typkontroll ligger kvar i PR-guarden. Ingen full apptestsvit påstås. Proverna omfattar befintligt batch-/publiceringsflöde samt nya säkerhetsfall: identitet, Inbox-gräns, exakt filrevision trots identiska bytes, annan ledgerclaim, annan aktiv Actions-batch, nekad `canTrash`, saknat/vagt ETag, 412-konflikt, obekräftad villkorlig skrivning, återläsningsfel, tappat PATCH-svar och förbud mot DELETE/redirect. JavaScript testar också att `allowWrites=false` inte auktoriserar direkt papperskorgsskrivning.

Syntetiska helflöden använder simulerad Drive/Actions/Supabase. De är inte livebevis för HERMES-behörigheten eller ett verkligt EXAM-20.

## Kan EXAM-20 genomföras nu?

**Nej, inte med det begärda verifierade slutflödet.** Ett lyckat HERMES-prov av ägandeskap/`canTrash`, metadata-scope och serverns villkorliga uppdatering saknas. `HERMES_CLEANUP_CONDITIONAL_VERIFIED` får inte aktiveras på grundval av lokala tester.

Den beständiga Work-värden saknas också fortfarande. Den måste köra mottagande, användaransluten arkivering, köläggning, efterkontroll, papperskorg, rapport och återhämtning med samma ledger, samt förnya den kortlivade städtokenen och ha Google API-nätåtkomst. Ingen ny tjänst har driftsatts. Den befintliga Actions-publiceringen kör däremot på GitHubs runner utan att chatten eller webbläsaren hålls öppen. Kedjan beskrivs inte som helt obemannad innan även dessa beroenden är lösta.
