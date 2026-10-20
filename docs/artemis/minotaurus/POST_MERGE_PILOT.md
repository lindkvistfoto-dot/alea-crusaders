# STOPP — begränsad livepilot efter manuell merge av PR #129

Google WIF och workflowets egen kontroll tillåter endast `refs/heads/main` i det befintliga repot. PR-koden körs därför inte med produktionscredentials före merge. Behåll WIF-villkor, Drive-readonly-scope, JWT-verifiering och befintlig GitHub-secret oförändrade. Inga långlivade nycklar, nya tokens, miljöer eller publiceringstjänster införs.

## Redan verifierat

- Riktiga bytes från Drive Inbox: `1I6Wx2kTtVqN2l76cjwqvdOmN3_iLDY6C`, 2,678,163 byte, PNG-dekodning 1254×1254 med alfa, SHA-256 `bc00be5e732aca25b78a7ff7c8cdceed07f097e922da73c13bb44fc05e5b3e49`.
- Befintlig Pillow-konvertering: 640×640 WebP, 167,144 byte, SHA-256 `de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170`; identisk med hash i aktiv STOPP-sökväg. Inga PNG-original skrevs till GitHub eller Supabase.
- SQL-återläsning 2026-10-20 18:58:23 UTC: `alea-hermes-source` 0 objekt / 0 byte; STOPP fortfarande `hermes/symbol/stopp/de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170.webp`.
- Driftsatt `hermes-v2` version 10 är ACTIVE med `verify_jwt=true`. Återläst kod saknar Storage-upload och tillåter endast diagnostik samt explicit äldre ikonrollback.
- [MINOTAURUS Actions, körning 39478636220](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39478636220): Git-originalspärr, riktade tester och Deno-typkontroll av båda TypeScript-publicerarna godkända.
- Pilotens Storage/DB-gränser är exekverade i tester med mockade svar. Det är inte en genomförd liveuppladdning.

## Kör exakt en pilot efter merge

1. Granskare beslutar om manuell merge av #129 med denna efterkontroll känd. Kontrollera därefter att den granskade koden finns på `main`, att MINOTAURUS-kontrollen är grön och att gamla PNG/UI/reference/Gallery Kit-workflows är pensionerade. Ingen automatisk merge sker här.
2. Läs före körning source-bucketens objektantal och den aktiva STOPP-pekaren med samma SQL nedan. Kräv 0 objekt och ovanstående pekare. Vid annan status: stoppa och rapportera; ändra inga referenser.
3. Kopiera exakt `docs/artemis/minotaurus/pilot-request.json` till en ny fil `hermes/queue/minotaurus-stopp-pilot-20261020.json` i en separat liten commit på `main`. Kontrollera `kind=symbol`, `target_key=stopp`, det fastlåsta Drive-ID:t/källhashen och **`mode=pilot`**. Denna push startar befintlig `hermes-drive-intake.yml`; gör inte samtidigt en manuell dispatch. Rapportera commit-SHA och Actions run-ID.
4. Låt befintlig WIF hämta filen read-only och befintlig secret `HERMES_SUPABASE_SERVICE_ROLE_KEY` sköta publiceringen. Det enda tillåtna uppladdningsmålet är `alea-hermes-public/hermes/minotaurus-pilot/symbol/stopp/de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170.webp`, utan overwrite. Ingen PNG, jobbpost eller aktiv bildpekare skrivs i pilotläge.
5. Kräv lyckad Storage-download och publik URL-återläsning med exakt app-SHA-256 samt loggen `HERMES_DIRECT_PILOT_VERIFIED` med `pointers_unchanged=true`. Det är dessa verkliga upload/download/URL-steg som återstår. Behåll logg/run-ID som bevis. Vid ofullständig eller röd körning är piloten inte godkänd.
6. Kör SQL igen: source ska fortfarande vara 0 objekt / 0 byte, aktiv STOPP-pekare exakt oförändrad och ett enda isolerat WebP-testobjekt med 167,144 byte ska finnas. Behåll testobjektet för granskning; ingen Storage-radering ingår.

```sql
select now() as checked_at,
       (select count(*) from storage.objects where bucket_id='alea-hermes-source') as source_objects,
       (select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects
        where bucket_id='alea-hermes-source') as source_bytes,
       (select icon_path from public.rule_magic_symbols where symbol_key='stopp') as stopp_icon_path;

select name, metadata->>'size' as bytes
from storage.objects
where bucket_id='alea-hermes-public'
  and name='hermes/minotaurus-pilot/symbol/stopp/de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170.webp';
```

## Om något blockerar

Saknad eller avvisad WIF/secret rapporteras med felkod, workflow-SHA och run-ID. Utöka inte WIF-trust och ersätt inte autentiseringen med en ny långlivad nyckel. Upprepa inte samma blockerade anrop. Vid ett övergående körfel kan samma redan committade pilotorder återköras med workflow_dispatch på `main` och exakt `request_path`, efter att föregående körning avslutats. Pilotpubliceringen är idempotent och verifierar redan existerande testbytes.

Ingen `mode=publish` eller aktivering av nya produktionsbilder ingår. Bredare publicering väntar tills denna livepilot är godkänd. Ett misslyckat prov lämnar befintliga appbilder kvar och utlöser ingen återställning av originalfiler till Git eller source-bucketen.
