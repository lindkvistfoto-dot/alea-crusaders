# OPERATION ARTEMIS – KERBEROS

Issue [#120](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/120), baslinje `c63d3f5f57141e1cce6ce7f5ad0dccd21a6593b5`. Icke-destruktiv utveckling i befintlig checkout; ingen extra worktree.

## Leverans

- [KERBEROS_ARCHIVE_PLAN.json](KERBEROS_ARCHIVE_PLAN.json): deterministisk, innehållsadresserad plan från det fullständiga MEDUSA-manifestet i Drive.
- [Backupstrategi](KERBEROS_BACKUP_STRATEGY.md), [återställningsprov](KERBEROS_RESTORE_TEST_REPORT.md) och [Supabase-åtkomst](KERBEROS_SUPABASE_ACCESS.md).
- `scripts/kerberos_archive.py`: full PNG-/SHA-verifiering, exakt Drive-ID/readback, oföränderlig arkivregistrering, signerad Supabase-GET, lokal simulering, export till provisionerad extern backupplats, restore och maskinläsbara rensningsgrindar.
- `tests/test_kerberos_archive.py`: 28 syntetiska tester. Isolerad dependencyfil och CI-workflow; inga ändringar i app-/publiceringskod.
- [Indataproveniens](evidence/INPUT_PROVENANCE.json), [syntetiskt bytekvitto](evidence/SYNTHETIC_RESTORE.json) och [granskning av PR #119](KERBEROS_PR119_REVIEW.md).

## Arkivplanens resultat

| Mått | Antal |
|---|---:|
| Källposter: 578 Drive-filer + 547 aktuella Git-paths + 18 historiska Git-versioner + 519 privata objekt | 1 662 |
| Planposter efter sammanslagning av byteverifierade innehållsidentiteter | 1 112 |
| Kompletta enligt ärvd MEDUSA-evidens | 569 |
| Dubblettposter med bevarade källidentiteter | 6 |
| Korrupta historiska versioner, bevarade och spärrade | 18 |
| Privata Supabase-objekt utan aktuell byteverifiering | 519 |
| Kopieringskandidater efter färsk verifiering och övriga pilotkrav | 505 |
| Verifierat säkert arkiverade produktionsoriginal | **0** |
| Får flyttas / får raderas | **0 / 0** |

De 505 kandidaterna har entydig kategori/variant, registerkoppling, byteverifierad Inbox-motpart och PNG-metadata utan konflikt. Antalet är inget godkännande för flytt eller rensning. Alla kräver färsk verifiering och verkliga arkiv-/backup-/restorebevis. Övriga innehåll spärras bland annat av oklassificerade varianter (t.ex. symboler), JPEG/ZIP som behöver separat formatbedömning, saknad exakt Inbox-motpart eller korrupt historik. Kategorier gissas inte fram från filnamn.

Planen innehåller alla källidentiteter, verifierad SHA när sådan finns, dimensioner/färgläge, tänkt mål-ID från `config/hermes-drive-folders.json`, registerkopplingar, versionsidentitet, relaterade versioner, Inbox-ID, plats för batch, beroendeunderlag, backupkrav och blockerande problem. Ett SHA-256-innehåll har en planidentitet; flera filer/register kan länka till samma innehåll. De privata objekten slås inte ihop utifrån historiska jobbhashar. Arkiv-ID och färsk verifieringstid är `null` tills verklig återläsning har gjorts.

Historiska metadata är evidens från inventeringstillfället, inte ett påstående om dagens aktiva databasreferenser. Git-original kan dessutom läsas av HERMES/optimeringsflöden. Ingen post får flyttas innan en separat aktuell beroendegranskning.

## Reproducera och använda verktyget

Installera den isolerade verifieringsdependencyn och kör testerna:

```bash
python -m pip install -r scripts/requirements-kerberos.txt
python -m unittest discover -s tests -p 'test_kerberos_archive.py' -v
```

Hämta [MEDUSA_MASTER_MANIFEST.json](https://drive.google.com/file/d/1bdJ-b2P47cpZYUReGCefHP-WmW0rHJi5/view) som fullständig lokal råfil, kontrollera rå-SHA enligt indataproveniensen och skapa ett nytt rapportnamn:

```bash
python scripts/kerberos_archive.py plan \
  --manifest /private/MEDUSA_MASTER_MANIFEST.json \
  --output /tmp/KERBEROS_ARCHIVE_PLAN.rerun.json
```

Samma indata ger samma planbytes. Rapporter skapas exklusivt; befintliga rapporter eller källor skrivs inte över. Inne i repot tillåts rapporter bara under `docs/kerberos/`. Kör `python scripts/kerberos_archive.py --help` för alla kommandon.

Ett arkivdescriptor för `register-readback` kräver `drive_file_id`, `folder_id`, `sha256`, `size_bytes`, `category`, `variant`, `register_links`, `inbox_file_id` och `version_id`; `batch` kan tillföras när känd. Registry är ett JSON-objekt indexerat med `sha256:<digest>`, initialt `{}`. Kommandot läser källan och Drive-kopian och ger en ny registrysnapshot. Samma identitet återläses idempotent; motstridig permanent identitet spärras. En ändrad SHA är en ny version. Ingen fil skapas i Drive av verktyget.

Drive-läsaren tar en kortlivad token via `KERBEROS_DRIVE_READ_TOKEN`. Förmågan ska vara `drive.readonly` och begränsad genom befintlig delning till de avsedda filerna/mapparna. Token tillförs privat, aldrig i kommandoargument eller GitHub. Ingen sådan token tillfördes i denna körning. `verify-drive` provar en exakt fil; `register-readback` kräver dessutom registrerad arkivmålmapp för kategorin/varianten.

## Säkerhetsgrind och begränsningar

`check-cleanup-gates` återverifierar källbytes, Drive-bytes och backuprestore. Den beräknar sju kontroller: källa, Drive-readback, oberoende backup, restore, aktuella beroenden, dokumenterad återställningsplan och projektägargodkännande. Beroende-/oberoende-/plan-/ägarattester måste vara bundna till samma SHA-256, Drive-ID och versions-ID och ha granskare, tid och evidensreferens. Aktiva beroenden spärrar grinden. Attester är operatörsuppgifter som kräver ägargranskning; verktyget bevisar inte deras signatur eller identitet.

Även en tekniskt komplett grind ger `safe_to_delete=false` eftersom denna fas förbjuder rensning. Ingen upload/move/delete/publiceringsadapter för produktion finns. Backup-export är separat, explicit aktiverad och kan bara skapa eller återverifiera innehållsadresserade filer på provisionerad extern plats. Simulering kräver en lokal kapabilitetsmarkör. Original och befintliga rapporter ersätts aldrig av verktyget.

Inga produktionsoriginal har flyttats, raderats eller skrivits över. Inga appreferenser, Supabase-tabeller, RLS, HERMES-jobb eller Git-historik ändrades. PR #113, #45 och övrigt parallellt HERMES-arbete integrerades inte. KERBEROS bygger direkt på aktuell main och kräver inte merge av #119.

## PR #119 och tester

PR #119 @ `0226a7930d1955df9e78fb4e546dafe68a27eed7` lämnas öppen och omergad. De 29 CI-felen är identiska med main; ingen MEDUSA-specifik kodändring behövdes. Rapporternas privata objekt förblir overifierade och alla rensningskandidater spärrade. Inga token-/nyckelfynd upptäcktes i leveransen; en enkel JWT-liknande textsökning gav endast ett vanligt Drive-ID och kunde avfärdas efter strukturkontroll.

28 KERBEROS + 15 MEDUSA + 10 HERMES Python + 19 HERMES Vitest = **72 relevanta tester godkända**. Full Vitest har de 29 ärvda felen. Baslinjens separata byggförsök kraschade i arbetsmiljön; inget godkänt helhetsbygge påstås. Se detaljer och exakta fel i PR-granskningen och återställningsrapporten.

## Beredskap för verklig pilot

**Redo för lokal simulering och teknisk granskning; ännu inte redo att starta en verklig arkiveringspilot.** Före en begränsad pilot behövs en separat granskad operation som skapar högst 1–5 nya arkivkopior utan flytt/ersättning, verifierad läsåtkomst till Drive, provisionerad oberoende backup med separat identitet och ett riktigt återställningsprov. Produktionsskapande i Drive är avsiktligt inte implementerat i denna fas. Inga HERMES-publiceringar ska startas av piloten.

För de 519 privata Storage-objekten behövs signerad GET per exakt objekt; ingen bred API-nyckel krävs i Codex. De tre GitHub-only PNG-originalen (`frost`, `regnstopp`, `stenvagg` wide) och `osakerhet`-källans saknade Drive-match kvarstår. De två publicerade WebP-objekten utan direkt inventerad registerreferens behöver separat beroendeutredning. Alla rensningsbeslut kräver ägarens senare uttryckliga godkännande.
