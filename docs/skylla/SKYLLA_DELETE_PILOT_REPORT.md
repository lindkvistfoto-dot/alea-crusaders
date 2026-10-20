# SKYLLA – genomförd godkänd raderingspilot

Exakt fem uttryckligen godkända original i `alea-hermes-source` raderades den 20 oktober 2026 kl. **15:43 svensk tid (CEST)**. Inget objekt behövde hoppas över. Raderingen skedde via fem separata Storage-API-anrop med en exakt sökväg per anrop. Inga andra raderingar är godkända.

Projektägarens [uttryckliga godkännande](evidence/delete-pilot/OWNER_APPROVAL.json) är bundet till det tidigare [oförändrade femobjektsförslaget](SKYLLA_DELETE_PILOT_APPROVAL.json), dess filhash och föregående manifests hash. Förslaget bevaras som historiskt underlag med dess ursprungliga `owner_approved=false`; det nya godkännandet och utfallet registreras separat. NAS-undantaget gäller endast denna source-bucket enligt Issue #123.

| Exakt borttaget objekt | Bytes | Bevarat permanent Drive-ID | Resultat |
|---|---:|---|---|
| `spell/varseblivning/1110033ba0ee81d60e73caeb78b82be7df81ed893097da9ae5e7b19657e5e1f3.png` | 2 721 849 | `1-AKRprbY-c1d2FCgoc-JdK7ZLuOtF28w` | Raderat; frånvaro verifierad |
| `spell-cutout/antimagi/bb1fc153d2b347eb3f9ce46ef742102f45d26d6bff48e419de669a75b1517d49.png` | 2 453 778 | `1XvAruubAwqnywdrDDy-abz7Caw_4HIdi` | Raderat; frånvaro verifierad |
| `spell-illustration-wide/varseblivning/8e46774c98dfe3b6902fafc5bde3e642b36530c0cbaa09a5a77f0ab6522b56ca.png` | 3 027 933 | `1z0Ji36h9hW_iDtQ3msbauAOAUF78qv3x` | Raderat; frånvaro verifierad |
| `skill/administrationsjuridik/ab2152a5bda4384e1275eab22bde45bb2e5d9e1b945616af81468cbb53987a54.png` | 3 021 435 | `1-Klfq586WG_xsGSCg2YlGZB5caNhuhXR` | Raderat; frånvaro verifierad |
| `skill-illustration-wide/akrobatik/c3eae2dfd9464809c0332fad02d7d5cccc3fc9b0c10a14e3c9cba7b7aa2a895d.png` | 2 974 937 | `1btAgKpJ7EJxN0TdpVnPdlyRJRKC9Jt_P` | Raderat; frånvaro verifierad |

**Frigjort: 14 199 932 byte.** Bucketen gick från 519 objekt / 1 501 614 754 byte till 514 objekt / 1 487 414 822 byte. Skillnaden är uppmätt i Storage-inventariet och exakt lika med de fem objektens faktiska byteantal. Supabases fakturerings-/kvotdashboard kan uppdateras senare; dess uppdateringstid har inte verifierats.

## Återvalidering och utförande

- De fem arkivfilerna hämtades i sin helhet från rätt permanenta Drive-ID:n. SHA-256, storlek, full PNG-avkodning, kategori/variant och identitet mot originalbytes passerade. Native Drive-sökning bekräftade rätt målparent och `trashed=false`.
- En separat förkontroll läste privata Supabase-original binärt inne i Supabase och avkodade varje PNG fullständigt. Samma kontroll upprepades inne i raderingsfunktionen precis före respektive DELETE. Hash och storlek måste matcha den låsta Drive-identiteten.
- HERMES v8:s driftsatta paket är oförändrat. Dess redan aktiva jobb återvänder före originalnedladdning; rollback använder tidigare WebP-pekare. Inga HERMES-workflows pågick eller väntade. Samtliga jobb var `active` (färdigpublicerat) eller `failed`. De fem pilotjobben var färdigpublicerade och matchade aktuella registerpekare.
- Precis före varje DELETE kontrollerade servern åter jobbets status, source/app-hash och paths, frånvaro av ofärdiga jobb, aktuell registerpekare och visningsbildens faktiska bytes. Lokala bevis för Drive, beroenden och full WebP-avkodning måste fortfarande vara högst 600 sekunder gamla.
- Varje anrop innehöll endast ett fast objekt-ID och planhash. Bucket/path hämtades från en driftsättningsbunden femobjektsplan. Inga jokertecken, SQL-raderingar, överskrivningar, tabelluppdateringar eller publiceringsanrop finns i verktyget.
- Varje lyckat DELETE följdes av autentiserad Storage-GET som verifierade frånvaro. En andra fristående autentiserad frånvarokontroll passerade för alla fem. Databasinventariet bekräftade att exakt samma fem objekt försvunnit.

[Drive-bytebevis](evidence/delete-pilot/DRIVE_READBACKS.json), [säkerhetsgrindar](evidence/delete-pilot/FINAL_GATES.json), [förkontroll](evidence/delete-pilot/PREFLIGHT_RECEIPTS.json), [raderingskvitton](evidence/delete-pilot/DELETE_RECEIPTS.json), [andra frånvarokontrollen](evidence/delete-pilot/ABSENCE_RECEIPTS.json), [lagringsskillnad](evidence/delete-pilot/STORAGE_DIFF.json).

## Efterkontroll och stängd åtkomst

De fem berörda visningsbilderna hämtades före och efter raderingen, SHA-256-jämfördes och fullständigt WebP-avkodades. Alla passerade med identiska bytes. Samtliga 185 registerposters bildfält och alla 519 HERMES-jobb var identiska före/efter. Alla återstående 1 260 Storage-objekts identiteter, paths, storlekar, versioner och ändringstider var oförändrade. Inga objekt tillkom. De 13 övriga bucketarnas antal och bytevolymer var oförändrade.

Drive-sökning efteråt bekräftade alla fem arkivkopiorna och alla fem Inbox-originalen, fortfarande i sina respektive mappar och utanför papperskorgen. Ingen Drive-fil ändrades under raderingspiloten.

Den tillfälliga raderingskapabiliteten gällde högst tio minuter och exakt dessa fem objekt. Bara kapabilitetens SHA-256 driftsattes; hemligheten låg lokalt med `0600` utanför Git. Bred servernyckel stannade i Supabase. Raderingsfunktionen återdriftsattes därefter som avstängd med tom plan (v2). Visningsläsfunktionen återställdes till avstängd (v6); originalläsfunktionen var fortsatt avstängd (v7). Verkliga POST-kontroller gav HTTP 503 för alla tre. Repo-konfigurationen är också avstängd. **Ingen fortsatt radering kan köras med denna stängda kapabilitet.**

170 relevanta automatiserade tester passerade, inklusive 32 nya tester för strikt godkännande, exakta identiteter, föråldrad evidens, korrupta/saknade bytes, beroenden, dubbla anrop, avbrott och okända utfall utan blinda återförsök. Produktionsentrypointen passerade Deno-kontroll. [Testresultat](evidence/delete-pilot/TEST_RESULTS.json). Ingen verklig återställningsuppladdning utfördes; de bevarade Drive-originalen lästes tillbaka och [återställningsplanen](SKYLLA_ACCESS_AND_RESTORE.md) gäller med separat godkännande för eventuell Storage-uppladdning.

Nya batcher kräver egen beroendegranskning, färska bytekontroller och ett nytt uttryckligt ägargodkännande. **514 original återstår; inga ytterligare raderingar är auktoriserade.** PR #124 förblir draft och omergad.
