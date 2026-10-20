# SKYLLA – ett godkännande och ett batchkommando

Projektägaren godkänner den exakta objektlistan genom manifestets SHA-256. Den betrodda operatören/Codex ordnar en enda tidsbegränsad kapabilitet för samma manifest och startar kommandot nedan. Inga individuella filgodkännanden, manuella signerade objektlänkar eller breda nycklar behövs.

## Körning efter batchgodkännande och avgränsad aktivering

```bash
python scripts/skylla_batch.py run \
  --manifest docs/skylla/fast-lane-2/SKYLLA_BATCH_001.json \
  --token-file /tmp/skylla-BATCH-001/execute.cap \
  --journal /tmp/skylla-BATCH-001/journal \
  --receipts docs/skylla/fast-lane-2/evidence/SOURCE_READBACK_RECEIPTS.json
```

Kommandot läser manifestet, kontrollerar dess hash och identiteter, anropar den manifestlåsta servern, raderar godkända kvalificerade objekt via Storage-API, verifierar frånvaro och skriver `REPORT.json` samt `events.jsonl` i journalmappen. Samma kapabilitet används genom hela processen. Högst 100 objekt; inga paths eller buckets kan tillföras genom anropsparametrar. `--verify-only` använder samma flöde utan radering.

Kör exakt samma kommando för återupptagning. Journalen låses mot samtidig körning och bindes till manifestets SHA-256. Intentioner och kvitton fsync-sparas löpande; rapporten ersätts atomiskt efter varje objekt. Ofullständig sista journalrad bevaras separat och tidigare intention föranleder avstämning. En gammal `.tmp` blockerar inte återupptagning. Journalfiler får inte vara symboliska länkar.

Okända raderingsutfall kontrolleras genom `status` innan något nytt DELETE kan ske. Om objektet fortfarande finns med samma identitet måste samtliga säkerhetsvillkor passera igen. Om det saknas redovisas verifierad frånvaro utan ett nytt DELETE. Ett tidigare färdigraderat objekt som återkommit får inte raderas igen med samma batch. Objekt som saknades redan före ett bekräftat försök räknas inte som vår frigjorda volym. Summeringen är unik per objekt och ackumuleras inte på nytt vid omkörning.

`confirmed_deleted_this_run` avser kvitterade API-raderingar i den aktuella processen. `verified_absent_in_batch` och `reclaimed_object_bytes_verified` avser unika baseline-objekt som verifierats frånvarande efter batchförsök, inklusive frånvaro avstämd efter ett tappat svar. Den senare gruppen redovisas separat från bekräftade API-svar; andra samtidiga aktörers raderingar kan inte tillskrivas processen med säkerhet. Okända resultat räknas inte som frigjorda bytes förrän frånvaro faktiskt verifierats. Måttet avser objektbytes, inte Supabases eventuellt fördröjda faktureringsdashboard.

## Intern förberedelse – inga extra ägarbeslut per fil

1. Läs aktuellt source-inventarium och HERMES-/registerstatus via befintlig anslutning. Kontrollera att HERMES v8:s kända guard fortfarande gäller och att ingen publicering pågår. Hämta Drive-metadata med native `trashed=false` och binära revisions-ID:n för alla unika arkivfiler med parallella läsverktygsanrop. Detta är automatiserad insamling, inte 100 manuella länkar eller terminalkommandon.
2. För ett nytt förslag används `prepare` med tidigare fullständiga bytekvitton och dessa observationer. För **redan godkänt manifest** används `attest`, vilket uppdaterar observationerna utan att ändra objektlistan eller manifesthashen:

```bash
python scripts/skylla_batch.py attest \
  --manifest docs/skylla/fast-lane-2/SKYLLA_BATCH_001.json \
  --native /tmp/skylla-BATCH-001/drive-native.json \
  --revisions /tmp/skylla-BATCH-001/drive-revisions.json \
  --output /tmp/skylla-BATCH-001/drive-attestation.json
```

`native` använder Drive-anslutningens fält `id`, `title`, `mime_type`, `size`, `parent_ids`, `shared`. `revisions` innehåller `observed_at` och `files`, med `file_id`, `current_revision_id` och `revisions[{id,size_bytes,modified_at}]`. Filerna produceras från anslutningen; ändrade revisioner/parents måste hanteras före en eventuell ny plan.

3. Registrera projektägarens faktiska godkännande i en separat operatörsfil med `owner_approved:true`, exakt `manifest_sha256` och `object_count`. Ändra inte det godkända manifestet. Utfärda kapabilitet och självbärande driftsättningsunderlag med ett offlinekommando:

```bash
python scripts/skylla_batch.py issue \
  --manifest docs/skylla/fast-lane-2/SKYLLA_BATCH_001.json \
  --drive-attestation /tmp/skylla-BATCH-001/drive-attestation.json \
  --owner-approval /tmp/skylla-BATCH-001/owner-approval.json \
  --token-file /tmp/skylla-BATCH-001/execute.cap \
  --descriptor-file /tmp/skylla-BATCH-001/descriptor.json \
  --deployment-output /tmp/skylla-BATCH-001/deployment.json \
  --minutes 60
```

Detta skapar en 256-bitars privat token med `0600` utanför repositoryt. Descriptor och driftsättningsunderlag innehåller bara tokenhash, manifest och tidsgräns. Utan giltig ägarfil kan endast `verify_only` utfärdas. Drive-observationerna måste vara högst tio minuter gamla vid utfärdandet; den egna kapabiliteten varar högst 60 minuter.

4. Skicka innehållet i `deployment.json` som strukturerat argument till den befintliga anslutningens `supabase_deploy_edge_function`. Inga driftsättningsnycklar exporteras till terminalen. Endast den separata `skylla-batch` ändras. Gateway-JWT ersätts här av funktionens egen kryptografiska, manifestbundna autentisering; andra funktioner och åtkomstpolicys ändras inte.
5. Starta det enda batchkommandot ovan. Efter rapporten driftsätts avstängd endpoint med tom plan, skapad av `python scripts/skylla_batch.py disable-bundle --output /tmp/skylla-BATCH-001/disabled.json`; skicka även detta strukturerade underlag till samma anslutning och verifiera HTTP 503. Tidsgränsen stoppar också automatiskt nya anrop om operatören avbryts innan avstängningen.

En utgången kapabilitet kräver förnyad snäv aktivering för **samma redan godkända manifest**, inte ett nytt godkännande av varje fil. Nya objekt eller ändrad manifesthash kräver nytt batchgodkännande. Kör inte `prepare` på nytt för att förnya en redan godkänd plan; använd `attest`.

## Fyra operativa kontroller, återanvända kvitton

Servern kontrollerar exakt Storage-ID/version/ETag/längd mot manifestet och en signerad SHA-256-verifiering bunden till samma Drive-fil och revision. Saknat/förfalskat/inaktuellt kvitto ger en ny hashberäkning från hela source-bytesen. Identisk hash återanvänder den tidigare fullständiga PNG-avkodningen. Ingen fil godtas genom enbart metadata.

Därefter kontrolleras source-jobb, pågående jobb för samma mål, registerpekare och andra registrerade source-referenser. Objektversionen läses om före DELETE. Varje Storage-DELETE har exakt en allowlistad sökväg. Autentiserad frånvarokontroll följer direkt. Inga SQL-raderingar eller tabell-/referensändringar finns i verktyget.

Per batch körs inga enhetstester, fulla Alea-tester, byggen eller HERMES-publiceringar. De omfattande arkiv-/batchtesterna körs vid ändring av verktyget. Enstaka osäkra objekt hoppas över. Gemensam saknad auth stoppar efter första försöket; tre överföringsfel i följd lämnar rapport och återupptagbar journal.

## Minsta miljöbehörighet

I den nuvarande hanterade miljön är HTTPS till `wbmosmkirsitkonejzpg.supabase.co` redan tillåten och inga extra terminalgodkännanden observerades under läskörningarna. Ingen terminalåtkomst till hela Internet, Drive-nyckel, service-role-nyckel eller Supabase-CLI-inloggning behövs.

Om en annan Codex-policy frågar om nätåtkomst är minsta tillägg nätverk till denna enda HTTPS-domän under **hela batchprocessens livstid**, med kommandot `python scripts/skylla_batch.py run` och den exakta godkända manifestfilen. Behörigheten återanvänds av alla HTTP-anrop inom samma process. Inga nya terminalkommandon skapas per objekt. Betrodd funktionsdriftsättning använder projektanslutningens befintliga hanteringsbehörighet; dess eventuella verktygsgranskning styrs av värdmiljön.

Återställningsplanen är fortsatt [SKYLLA_ACCESS_AND_RESTORE.md](../SKYLLA_ACCESS_AND_RESTORE.md). NAS-undantaget gäller enbart source-bucketen. Ingen återställningsuppladdning, ytterligare radering eller automatisk merge ingår i detta förberedelseuppdrag.
