# SKYLLA – verifierat arkiv och femfilsförslag

Issue [#123](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/123). Befintlig checkout och separat SKYLLA-gren används. PR #124 är draft och har inte mergats. Main är fortsatt `500e60b7f83e0edc9324546ce2e0495515d057d4`; PR #119 och #121 mergades i föregående integration. PR #122 är fortsatt omergad; dess fem original återanvändes.

## Genomfört

**507 originalposter har verifierade permanenta Drive-arkiv och faktiska Supabase-bytebevis, 1 468 662 842 bytes.** De använder 506 unika Drive-filer, 1 465 949 422 bytes. Två Storage-original har identiskt innehåll och återanvänder ett arkiv-ID. Inbox-originalen behålls. Inga original ersattes, flyttades eller raderades. Kopiornas metadata visar `shared=false`.

Varje källfil hämtades som fulla råa bytes. SHA-256, filstorlek, full PNG-avkodning och rätt kategori/variant verifierades före kopiering. Arkivet lästes tillbaka i sin helhet och bytejämfördes. Versionen är `sha256:<faktisk hash>`. Alla 507 aktuella Supabase-original lästes binärt inom Supabase, fullständigt PNG-avkodades och matchade Drive-hashen. Registrerad jobbhash ensam räknas inte som bevis.

Google Drive använde bara copy-API för nya innehållsadresserade filer. Copy-intent/resultat journalfördes separat. Ett innehåll som redan fanns återanvändes. Avbrutna/tidsutlösta råa läsningar återhämtades genom begränsad ny läsning; kopieringsanrop återförsöktes aldrig blint. En arkivreadback stannade för separat avstämning av det befintliga ID:t och passerade därefter full bytekontroll. Omstarten gav inga okända kopieringsresultat. Slutlig journalavstämning har inga okända eller overifierade kopior.

[Alla Drive-bevis](evidence/DRIVE_ARCHIVE_READBACKS.json). [Manifest](SKYLLA_ARCHIVE_MANIFEST.json). [Snäv serveråtkomst](SKYLLA_SCOPED_ACCESS.md). Korta läskapabiliteter skapades lokalt med `0600`; bara deras hash och avgränsning driftsattes. Inga breda API-nycklar överfördes till Codex och inga manuella objektlänkar behövdes. Alla utfärdade tillfälliga kapabilitetsscope är nu stängda.

## Första föreslagna raderingsbatchen

**5 tekniskt verifierade kandidater, 14 199 932 bytes. Ägargodkännande saknas. Ingen radering har utförts.**

| Original/variant | Permanent Drive-ID | Bytes |
|---|---|---:|
| skill-illustration-wide/akrobatik | `1btAgKpJ7EJxN0TdpVnPdlyRJRKC9Jt_P` | 2 974 937 |
| skill/administrationsjuridik | `1-Klfq586WG_xsGSCg2YlGZB5caNhuhXR` | 3 021 435 |
| spell-cutout/antimagi | `1XvAruubAwqnywdrDDy-abz7Caw_4HIdi` | 2 453 778 |
| spell-illustration-wide/varseblivning | `1z0Ji36h9hW_iDtQ3msbauAOAUF78qv3x` | 3 027 933 |
| spell/varseblivning | `1-AKRprbY-c1d2FCgoc-JdK7ZLuOtF28w` | 2 721 849 |

Exakt bucket: `alea-hermes-source`.

```text
skill-illustration-wide/akrobatik/c3eae2dfd9464809c0332fad02d7d5cccc3fc9b0c10a14e3c9cba7b7aa2a895d.png
skill/administrationsjuridik/ab2152a5bda4384e1275eab22bde45bb2e5d9e1b945616af81468cbb53987a54.png
spell-cutout/antimagi/bb1fc153d2b347eb3f9ce46ef742102f45d26d6bff48e419de669a75b1517d49.png
spell-illustration-wide/varseblivning/8e46774c98dfe3b6902fafc5bde3e642b36530c0cbaa09a5a77f0ab6522b56ca.png
spell/varseblivning/1110033ba0ee81d60e73caeb78b82be7df81ed893097da9ae5e7b19657e5e1f3.png
```

[Exakt kandidat-CSV](SKYLLA_DELETE_CANDIDATES.csv). [Godkännandeunderlag](SKYLLA_DELETE_PILOT_APPROVAL.json). Manifestets SHA-256: `024cc48cd4fb60faa5023f927d7c06aa1c83e944b2a206d3396a97ef4fc84fd6`. `safe_to_delete=false` och `owner_approval_verified=false` gäller fortfarande samtliga poster. Ett separat godkännande av dessa fem exakta objekt krävs. Före ett godkänt genomförande ska tidsgrindarna kontrolleras igen; evidens äldre än 600 sekunder får inte användas för faktisk radering.

## Beroenden, visningsbilder och återställning

Alla fem pilotjobb är aktiva. Granskning av den verkligt driftsatta HERMES v8 visar att aktiva jobb återvänder före källnedladdning; rollback hämtar ingen source-fil. Publicerarens aktiva jobb återvänder före originaluppladdning. Inga HERMES-workflows är pågående eller köade. Källpaths finns inte i de aktuella registerbildfälten. Samtliga 185 registerposter har oförändrade bildfält jämfört med MEDUSA.

Alla fem separata WebP-visningsbilder, inklusive de tre privata, har hämtats binärt, SHA-verifierats och fullständigt Pillow-avkodats. De aktuella registerpekarnas paths matchar jobben. Ingen inloggad webbläsarrundtur påstås vara utförd. Bildreferenser, visningsobjekt och appkod ändrades inte. [Färska bildkontroller](evidence/APP_IMAGE_CHECKS_FRESH.json), [beroendegrindar](evidence/DEPENDENCY_AUDIT_FRESH.json), [driftsatt HERMES](evidence/DEPLOYED_HERMES_AUDIT.json).

Pilotens Drive-original lästes åter till isolerade lokala filer som verkligt återställningsprov; hela bytesen och full PNG-avkodning matchar. [Färska readbacks](evidence/PILOT_FRESH_DRIVE_READBACKS.json). Återställningsplanen är dokumenterad och dess dokumenthash kontrolleras maskinellt. Ingen verklig Supabase-återuppladdning har gjorts. NAS-backup finns inte; det uttryckliga undantaget gäller endast denna source-bucket. KERBEROS generella backupkrav ändras inte.

## Återstående hinder och tester

12 symboloriginal saknar explicit kategori-/variantmappning och ingår inte i arkivering eller serverns allowlist. Övriga objekt utanför femfilspiloten inväntar pilotresultat och färska batchvisa beroende-/bildkontroller. 17 misslyckade HERMES-jobb kräver retrybedömning. 15 äldre aktiva jobb har andra sparade visningspaths än dagens register och kräver versionsbedömning; registervärdena har inte ändrats av SKYLLA.

151 relevanta tester passerar: 40 SKYLLA Python, 38 JavaScript, 28 KERBEROS, 15 MEDUSA, 10 HERMES Python och 20 HERMES Vitest. Samma 38 JavaScript-fall passerar även i Deno; alla tre entrypoints klarar Deno-kontroll. Separat SKYLLA-CI passerar 106 kontroller. Full CI har exakt samma 29 fel som main: 1266 passerar, 17 testfiler felar, inga nya testnamn. [Exakt jämförelse](evidence/CI_BASELINE_COMPARISON.json).

Ingen Supabase-data har skrivits, inga apptabeller eller referenser har ändrats och inga HERMES-publiceringar har startats. Använd bara Supabase Storage-API och en explicit pathlista om ägaren senare godkänner en raderingsbatch. Inga delete-API:er eller automatiska raderingsworkflows ingår här.
