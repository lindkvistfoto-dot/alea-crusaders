# SKYLLA FAST TRACK – slutrapport

Den separat godkända femfilspiloten är genomförd: **5 original raderade och verifierat frånvarande, 14 199 932 byte frigjorda**. Inget objekt hoppades över. Supabase-bucketen `alea-hermes-source` innehåller nu **514 original / 1 487 414 822 byte**. Inga ytterligare raderingar är godkända.

507 historiska originalposter har permanenta, byteverifierade Drive-arkiv och matchande faktiska Supabase-bytebevis; de använder 506 unika arkivfiler. De fem godkända originalen återvaliderades genom full Drive-readback och fullständig Supabase-byte-/PNG-kontroll omedelbart före Storage-API-raderingen. 502 av de arkiverade originalen finns kvar i Supabase. Ytterligare 12 symboloriginal kräver explicit mappning och arkivering.

De fem berörda visningsbildernas faktiska bytes och fullständiga avkodning passerade även efter raderingen. Alla 185 registerposters bildfält, samtliga 519 HERMES-jobb och alla återstående 1 260 Storage-objekt är oförändrade. Inga DB-referenser ändrades, inga HERMES-publiceringar startades och inga Drive-original ändrades eller flyttades. Samtliga fem Inbox-filer och arkivkopior finns kvar.

[Exakt utförd pilot och kvitton](SKYLLA_DELETE_PILOT_REPORT.md), [Storage-rapport](SKYLLA_STORAGE_REPORT.md), [manifest](SKYLLA_ARCHIVE_MANIFEST.json), [utförda objekt CSV](SKYLLA_DELETE_PILOT_RESULTS.csv), [projektägarens godkännande](evidence/delete-pilot/OWNER_APPROVAL.json). Kandidatfilen är nu tom utöver rubrikraden.

170 relevanta tester passerar, varav 32 nya raderingssäkerhetstester. Föregående full CI:s 29 fel är dokumenterat identiska med main; den allmänna CI-baslinjen har inte åtgärdats här. Den separata SKYLLA-CI:n har utökats med de nya testerna. Main och HERMES v8 är oförändrade. [PR #124](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/124) är draft och har inte mergats; arbetet hör till [Issue #123](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/123).

Tillfällig raderingsåtkomst var låst till fem exakta objekt i högst tio minuter och är nu avstängd. Även tillfälliga lässcope är stängda; HTTP 503 verifierades. Inga breda API-nycklar överfördes till Codex. NAS-undantaget gäller bara `alea-hermes-source`; KERBEROS ordinarie policy kvarstår. Återstående 514 original kräver nya kontroller och nytt batchgodkännande före eventuell radering.
