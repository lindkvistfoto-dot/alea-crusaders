# KERBEROS integration och femfilspilot – 2026-10-20

## Integration genomförd

1. [PR #119](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/119) granskades och mergades först: `24a0530d027682d282a76b2457c9d082a56a66d5`.
2. [PR #121](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/121) granskades och mergades därefter: `500e60b7f83e0edc9324546ce2e0495515d057d4`.

Ursprunglig main var `c63d3f5f57141e1cce6ce7f5ad0dccd21a6593b5`. PR-heads var oförändrade sedan föregående leverans: `0226a793…` respektive `9c50cc91…`. Inga nya fel upptäcktes i integrationsgranskningen. Merge gjordes med förväntat head-SHA och utan historikomskrivning. Den kombinerade koden provades i befintlig checkout före andra mergen; dess Git-tree är exakt samma som slutlig main. Ingen extra worktree skapades.

## Tester och säkerhetskontroll

- Ny full Vitest-körning på oförändrad main: **1 266 godkända / 29 underkända**. De 29 fullständiga testnamnen är maskinellt identiska med både PR #119:s och #121:s CI-loggar, inte bara samma antal. [Maskinläsbar jämförelse](KERBEROS_INTEGRATION_CHECKS.json).
- **72 relevanta tester godkända:** MEDUSA 15, KERBEROS 28, HERMES Python 10 och HERMES Vitest 19. MEDUSA 15 och KERBEROS 28 kördes även om på den kombinerade koden före andra mergen.
- KERBEROS PR-CI för #121 var godkänd: [run 39406772296](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39406772296). Ordinarie CI för #119/#121 var röd med de exakt verifierade baslinjefelen. Inget godkänt generellt appbygge påstås; den tidigare rapporterade lokala byggkraschen har inte utretts i detta avgränsade uppdrag.
- Även main-CI efter båda mergerna är kontrollerad: [run 39412130450](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39412130450) har exakt samma 29 underkända testnamn, inga nya fel. Den första mergecommitens CI avbröts av den senare main-körningen. Repots befintliga automatiska Pages-deploy triggades; ingen app-/bildkod ändrades och inga HERMES-publiceringar observerades. [Efterkontroll](KERBEROS_POST_MERGE_CI.json).
- Inga ändringar i `assets/`, `features/`, `src/`, `legacy/`, `hermes/`, `supabase/`, `config/`, `index.html` eller appens package-/lockfil. Det gäller både respektive PR och den kombinerade main-koden. Inga Supabase-anrop som ändrar data har utförts.
- Befintliga HERMES-publiceringsworkflows och deras triggerfilter är oförändrade. Ändringarna matchar inga original-PNG-, kö-, porträtt- eller legacy-request-triggerpaths. Ingen workflow-dispatch har gjorts. Endast den separata KERBEROS-testworkflowen utökas för syntetisk femfilssimulering utan credentials.
- Rapporterna håller samtliga 519 privata Supabase-objekt overifierade och alla rensningsgrindar stängda. Hemlighetssökningen identifierade inga credentials, privata nycklar eller signerade URL:er.

## Fem valda original

| Pilot | Original | Format och dimensioner | Bytes |
|---|---|---|---:|
| 01 | Varseblivning – ARCANE IVORY-ikon | PNG, RGBA, 1254×1254 | 2 721 849 |
| 02 | Antimagi – cutout | PNG, RGBA, 1254×1254 | 2 453 778 |
| 03 | Varseblivning – bred illustration | PNG, RGB, 1672×941 | 3 027 933 |
| 04 | Administrationsjuridik – färdighetsikon | PNG, RGBA, 1254×1254 | 3 021 435 |
| 05 | Akrobatik – bred färdighetsillustration | PNG, RGB, 1672×941 | 2 974 937 |

Sammanlagt **14 199 932 bytes**. Urvalet täcker fem kategori-/variantkombinationer, alfakanal och RGB samt kvadratiska och breda original. Alla har entydig Inbox-identitet, registrerad målvariant och en byteidentisk Git-motpart; inga dubbletter eller korrupta historiska versioner valdes.

Exakta Drive-fil-ID:n, fullständiga SHA-256, versionsidentiteter, målmappar och registerkopplingar finns i [KERBEROS_PILOT_PLAN.json](KERBEROS_PILOT_PLAN.json).

## Verklig skrivskyddad källverifiering

Alla fem original hämtades på nytt från sina exakta Drive-ID:n som fullständiga råfiler utan Base64 i loggar. Faktisk SHA-256, storlek, PNG-chunks/CRC/IEND, full avkodning, dimensioner och färgläge godkändes. Bytes jämfördes med aktuella oförändrade Git-original: identiska. Se [källverifieringen](KERBEROS_PILOT_SOURCE_VERIFICATION.json).

Källfilerna ligger kvar i Inbox. De fem målmapparnas ID:n och kategoriparents lästes via Drive-metadata och matchar konfigurationen. Metadataanslutningen redovisar inte kopierings-/skrivkapabilitet; framgångsrik läsning tolkas därför inte som verifierad skrivrätt. [Metadataunderlag](KERBEROS_DRIVE_METADATA.json).

Ingen ny bild lades i Git. Inga verkliga arkivkopior eller backuper skapades. De temporärt materialiserade originalen användes endast för läsverifiering, inte som påstådd oberoende backup.

## Pilotens sex steg

1. Läs de fem exakta käll-ID:na på nytt och verifiera full SHA-256, storlek och PNG. Första skrivskyddade provet är godkänt; repetera precis före eventuell kopiering.
2. **Spärrad:** skapa en ny kopia med rätt målparent först när oberoende backup är provisionerad och export samt separat återläsning är verifierade. Ändra aldrig källans parents, namn, innehåll eller aktiva referenser. Spara nytt permanent Drive-ID.
3. Läs tillbaka den nya arkivfilen från exakt ID och rätt parent. Kontrollera metadata, avkodning, full SHA-256 och bytejämförelse med källan. Metadata räcker inte.
4. Exportera de verifierade bytesen till det oberoende kontot/mediet. Registrera provider, konto, exakt objekt-/versions-ID, plats och ansvarig. Gör en färsk fjärrnedladdning; en monteringscache räcker inte.
5. Hämta samma backupversion med separat restore-identitet till en ny isolerad plats. Avkoda och jämför bytes/SHA-256 med källan och arkivkopian. Skriv aldrig över en källa eller arkivfil.
6. Spara separata oföränderliga kvitton för varje fil och kontroll. Behåll felstatus per fil; kopiera inte om en fil vars tidigare skrivning har okänt resultat. Återläs och stäm av först.

En framtida kopierare ska använda en innehålls-/versionsbunden idempotensnyckel och ett exklusivt lås, söka efter tidigare kopia i exakt målparent och alltid verifiera hittat ID. Vid flera kandidater, metadata-/bytekonflikt eller oklart timeoutresultat stoppas filen. Inget produktionskopieringsverktyg driftsätts av denna leverans.

## Syntetiskt helhetsprov

`scripts/kerberos_pilot_simulate.py` genererar fem olika 8×6 PNG-filer med urvalets RGB/RGBA-lägen. Med sockets blockerade provar den arkivreadback, export, separat återläsning/restore, bytejämförelse, idempotens och dry-run. Korrupt PNG, fel SHA, saknad autentisering och försök till överskrivning ska avvisas. Alla **60 kontroller över fem syntetiska original** passerar. Produktionsarkiv och oberoende produktionsbackup förblir uttryckligen overifierade.

[Simuleringsresultat](KERBEROS_PILOT_SIMULATION.json). Kör om till ett nytt rapportnamn:

```bash
python scripts/kerberos_pilot_simulate.py \
  --plan docs/kerberos/pilot-20261020/KERBEROS_PILOT_PLAN.json \
  --output /tmp/KERBEROS_PILOT_SIMULATION.new.json
```

## Backupplats och åtkomst som behövs

**Ingen oberoende backupplats är ännu anvisad eller provisionerad.** Rekommendationen är en privat, versionsbevarande, krypterad S3-bucket på ett separat konto med separat förvaltare och återställningsidentitet. Föreslagen prefixmall: `s3://<separat-backupkonto-bucket>/alea-crusaders/kerberos/pilot-20261020/`. Detta är en mall, inte en skapad bucket. Rekommenderad tilldelning för piloten: minst 100 MiB inklusive marginal för manifest och versioner. Ett krypterat offline-medium hos separat förvaltare är ett alternativ. Drive-mappen `06 – SÄKERHETSKOPIOR` godtas inte.

Behörigheter/kapabiliteter som återstår:

- Backup: tidsbegränsad exportidentitet med prefixbegränsad rätt att skapa nya objekt och läsa tillbaka dem, utan DeleteObject. Separat restore-identitet med läsrätt till exakt objektversion samt nödvändig dekryptering. KMS-/nyckelförvaltning och bevarande ska ligga utanför Drive-kontot.
- Backupförvaltaren ska verifiera kontots oberoende, rättigheter och faktisk fjärråterläsning. Ingen sådan extern åtkomstidentitet finns konfigurerad i denna arbetsmiljö. Inga breda credentials begärs i chatten.
- Drive: anslutningens verkliga källnedladdning fungerar. Skriv-/kopieringsförmåga till de fem målmapparna och läsåtkomst för den tänkta pilotutföraren måste verifieras. HERMES-tjänstekontots befintliga `drive.readonly` är inte en kopieringsbehörighet och har inte utökats.
- Privat Supabase-läsning är fortsatt blockerad för de 519 objekten. Den behövs inte för dessa fem Drive-källor, vars bytes och Git-match nu är verifierade. Inga nya Supabase-behörigheter eller RLS-ändringar införs här.

De aktiva registerkopplingarna och HERMES-läsberoendena bevaras. Referenslistorna i planen kommer från MEDUSA; ingen ny live-databasaudit påstås. Före eventuell senare rensning krävs separat aktuell beroendegranskning och projektägarbeslut, oavsett hur väl denna kopieringspilot går.

## Startbeslut

**Verklig arkiveringspilot kan inte starta ännu.** Backup-provisionering, verifierad export/restore-åtkomst och granskad Drive-kopieringsförmåga återstår. Planens maskinläsbara `may_start_real_archive_copy=false`. Alla fem har `may_copy_now=false`, `may_move=false`, `safe_to_delete=false` och `archive_drive_file_id=null`. Ingen fil har godkänts för flytt, överskrivning eller radering.
