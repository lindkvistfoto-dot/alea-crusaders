# SKYLLA – Storage efter godkänd femfilspilot

| Mått | Före | Efter |
|---|---:|---:|
| Original i `alea-hermes-source` | 519 | 514 |
| Source-volym, byte | 1 501 614 754 | 1 487 414 822 |
| Alla Storage-objekt | 1 265 | 1 260 |
| Raderade godkända original | 0 | 5 |
| Verifierat frigjort | 0 | **14 199 932 byte** |
| Återstående auktoriserade raderingar | 0 | **0** |

Inventariets differens är exakt de fem godkända objekten, utan tillkomna eller oväntat ändrade objekt. Samtliga återstående 1 260 objekts metadataidentiteter, exakta paths, storlekar, versioner och ändringstider är identiska. De 13 övriga bucketarnas antal och bytevolymer är oförändrade. Alla registerbildfält och HERMES-jobb är oförändrade. Fem berörda visningsbilder verifierades genom autentiserad binär nedladdning, SHA-256 och full WebP-avkodning före och efter.

[Verifierad differens och exakta borttagna objekt](evidence/delete-pilot/STORAGE_DIFF.json), [föreinventarium](evidence/delete-pilot/STORAGE_BEFORE.json), [efterinventarium](evidence/delete-pilot/STORAGE_AFTER.json). Inventariernas per-objekthash inkluderar exakta paths; orelaterade privata objektnamn publiceras inte. Storage-API-frånvaro och faktiska tidigare bytebevis finns i [pilotrapporten](SKYLLA_DELETE_PILOT_REPORT.md).

Byteantalet beskriver verifierat borttagna Storage-original. Supabases fakturerings-/kvotdashboard kan ha fördröjd uppdatering och har inte kontrollerats. Cirka 1,49 GB återstår i source-bucketen; kvotproblemet är därför inte fullt löst av denna begränsade pilot.

Historiskt är 507 originalposter arkiverade och byteverifierade mot Drive (506 unika arkivfiler). Fem har nu verifierats borttagna från Supabase och finns kvar i bevarat Drive-arkiv/Inbox. 502 arkiverade original finns kvar i Supabase och kräver förnyade säkerhetskontroller och eget batchgodkännande. Tolv symboloriginal / 32 951 912 byte kräver först explicit mappning, arkivering och byteverifiering.

Alla tillfälliga raderings-/läskapabilitetsscope är avstängda. Ingen följande batch är auktoriserad. Vid ett nytt uppdrag krävs exakt pathlista, aktuella käll-/arkivbytes, beroendekontroll och bildhälsa före varje eventuell radering. Stoppa vid okända överföringsutfall; verifiera frånvaro och inventariedifferens före återförsök. Radera aldrig en bucket, använd inga jokertecken och radera inte via SQL i `storage.objects`.
