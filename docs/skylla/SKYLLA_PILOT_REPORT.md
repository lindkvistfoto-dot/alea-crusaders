# SKYLLA FAST TRACK – pilotresultat, 2026-10-20

Issue [#123](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/123). Baslinje `500e60b7f83e0edc9324546ce2e0495515d057d4`. Befintlig checkout användes; ingen extra worktree. PR #122 är fortsatt draft och har inte mergats. Dess femfilsurval återanvändes som indata.

## Verkligt utfört

**Fem nya permanenta Drive-kopior skapade och fullständigt återlästa, totalt 14 199 932 bytes.** Inbox-filerna ligger kvar med sina ursprungliga ID:n och parents. Ingen befintlig Drive-fil ersattes, flyttades eller ändrades. Kopiorna är inte delade enligt aktuell metadata.

| Original/variant | Permanent arkivfil-ID | Bytes |
|---|---|---:|
| Varseblivning – ikon | `1-AKRprbY-c1d2FCgoc-JdK7ZLuOtF28w` | 2 721 849 |
| Antimagi – cutout | `1XvAruubAwqnywdrDDy-abz7Caw_4HIdi` | 2 453 778 |
| Varseblivning – wide | `1z0Ji36h9hW_iDtQ3msbauAOAUF78qv3x` | 3 027 933 |
| Administrationsjuridik – ikon | `1-Klfq586WG_xsGSCg2YlGZB5caNhuhXR` | 3 021 435 |
| Akrobatik – wide | `1btAgKpJ7EJxN0TdpVnPdlyRJRKC9Jt_P` | 2 974 937 |

För varje fil: källans hela bytes hämtades utan Base64, SHA-256 och storlek kontrollerades, PNG-chunks/CRC/IEND samt full Pillow-avkodning godkändes. Därefter skapades en ny kopia i konfigurationens exakta kategori-/variantmapp med innehållsadresserat namn `<sha256>.png`. Nytt fil-ID, parent, storlek och fullständigt nedladdade arkivbytes verifierades. Bytejämförelsen mot källan är identisk. Versions-ID är `sha256:<faktisk hash>`.

[Maskinläsbara readbackbevis](evidence/DRIVE_ARCHIVE_READBACKS.json). Kopieringen utfördes via Drive-anslutningens copy-API, aldrig move/update. Samma byteverifieringsfunktion som finns i levererad kod kontrollerade readbacken.

Idempotens: före kopiering kontrollerades målidentiteten; varje copy-intent och svar journalfördes lokalt. Efter kopiering gav den direkta metadatafrågan exakt ett och samma ID per mål/hash, utan ytterligare kopiering. Drive-sökning ska använda `item_type=image` för den aktuella providerbaserade metadatafrågan; den äldre sökvägen gav tomma resultat för nyskapade filer. Den äldre sökningen används inte som bevis för att en kopia saknas. Full folder-/ID-läsning och aktuell metadata verifierade de nya kopiorna.

## Exakt planerad femfilspilot i Supabase

Bucket är uteslutande `alea-hermes-source`. Följande är **planerade, blockerade objekt – inte godkända raderingskandidater**:

```text
spell/varseblivning/1110033ba0ee81d60e73caeb78b82be7df81ed893097da9ae5e7b19657e5e1f3.png
spell-cutout/antimagi/bb1fc153d2b347eb3f9ce46ef742102f45d26d6bff48e419de669a75b1517d49.png
spell-illustration-wide/varseblivning/8e46774c98dfe3b6902fafc5bde3e642b36530c0cbaa09a5a77f0ab6522b56ca.png
skill/administrationsjuridik/ab2152a5bda4384e1275eab22bde45bb2e5d9e1b945616af81468cbb53987a54.png
skill-illustration-wide/akrobatik/c3eae2dfd9464809c0332fad02d7d5cccc3fc9b0c10a14e3c9cba7b7aa2a895d.png
```

[Exakt planerad pilot som CSV](SKYLLA_PLANNED_PILOT.csv). [SKYLLA_DELETE_CANDIDATES.csv](SKYLLA_DELETE_CANDIDATES.csv) innehåller endast rubrik: **0 kandidater**.

## Åtkomst och beroenden

Miljön saknar signerade läskapabiliteter för aktuella privata Supabase-bytes. Projektägaren bekräftade under arbetet att sådan åtkomst inte finns ännu. Inga privata Storage-original hämtades; inga upprepade autentiseringsförsök gjordes. Historiska jobbhashar används endast för att hitta förväntade identiteter och räknas aldrig som aktuell Storage-verifiering.

Läsande SQL bekräftar 519 objekt / 1 501 614 754 bytes och 502 aktiva samt 17 misslyckade HERMES-jobb. Alla fem pilotjobb är aktiva. Inga GitHub-workflows var pågående eller köade vid kontrollen. Kodgranskning visar att dessa aktiva jobb återvänder före originalnedladdning vid retry; rollback använder tidigare WebP-referens, inte originalbytes. Icke-aktiva jobb kan däremot behöva originalet och spärras för separat retrygranskning. [Beroendeunderlag](evidence/DEPENDENCY_AUDIT.json).

Aktuella appreferenser för pilotens besvärjelser/färdigheter lästes och matchar HERMES-jobben. De pekar på separata WebP-visningsbilder. Två publika visningsbilder bytehashades och avkodades på nytt; de tre privata visningsbilderna kunde inte binärläsas med nuvarande autentisering och markeras overifierade. Ingen referens ändrades. [Appkontroller](evidence/APP_IMAGE_CHECKS.json).

Övriga 514 arkiveringar väntar på att pilotens Storage-byteverifiering kan avslutas. Det är inte en generell blockering av säker Drive-kopiering, utan en avgränsad batchgrind före fortsatt rensningskedja. För 12 symboloriginal saknas entydig registrerad kategori-/variantmapp; de får inte gissningsklassificeras.

## Policy och startbeslut

Den uttryckliga undantagspolicyn i [config/skylla-fast-track-policy.json](../../config/skylla-fast-track-policy.json) gäller endast projekt `wbmosmkirsitkonejzpg`, bucket `alea-hermes-source`. NAS-backup är inte en förutsättning för just detta undantag. KERBEROS ordinarie sju grindar ändras inte. Ingen NAS-backup påstås finnas.

Undantaget tar inte bort kraven på aktuella Supabase-bytes, full PNG-avkodning, exakt byteidentitet med permanent Drive-readback, tydliga beroenden och fungerande visningsbilder. Separat godkännande krävs för varje exakt raderingsbatch. `safe_to_delete=false` gäller alla poster; ingen delete-API finns i denna leverans och ingen automatisk raderingsworkflow skapas.

**Första raderingspiloten är blockerad.** Begär inte ett raderingsgodkännande för dessa fem innan deras aktuella Supabase-bytes har verifierats, privata visningsbilder kontrollerats och beroende/readbackunderlag uppdaterats. Då ska projektägaren få exakt bucket, fem paths, manifesthash och verifierade bytes att godkänna. Ingen radering har utförts.

## Tester

20 SKYLLA-tester godkända: komplett/trunkerad PNG, fel SHA, saknad/felaktig Drive-kopia, fel kategori, aktivt beroende, avbruten kopiering, dubbel körning, saknad autentisering, delvis misslyckad batch, Drive-återställning, stängd skrivbehörighet, journal mot dubbla skapanden, fel bucket, utgången evidens och skyddad kandidat-CSV. Alla använder små syntetiska filer eller mockade svar.

Dessutom passerar 28 KERBEROS-, 15 MEDUSA-, 10 HERMES Python- och 19 HERMES Vitest-tester: **92 relevanta tester totalt**. Separat SKYLLA-CI kör syntetiska SKYLLA-/KERBEROS-tester utan credentials eller produktionsbilder. De tidigare 29 generella Vitest-felen på main är dokumenterad baslinje; inga app-/visningskodändringar ingår här.
