# SKYLLA FAST TRACK – slutrapport

507 originalposter har permanent, fullständigt återläst Drive-arkiv och matchande faktiska Supabase-bytes. De använder 506 unika arkivfiler. 12 symboloriginal kräver explicit mappning. Inga original, visningsbilder eller referenser har raderats, flyttats eller skrivits över.

Femfilspilotens tekniska kontroller passerar. De fem kandidaterna kan ge 14 199 932 bytes efter separat ägargodkännande; **0 bytes har frigjorts**. Alla poster har `safe_to_delete=false`. 514 andra objekt kvarstår blockerade för raderingsförslag.

[Detaljerad pilotrapport](SKYLLA_PILOT_REPORT.md), [Storage-rapport](SKYLLA_STORAGE_REPORT.md), [manifest](SKYLLA_ARCHIVE_MANIFEST.json), [exakt kandidatlista](SKYLLA_DELETE_CANDIDATES.csv), [godkännandeunderlag](SKYLLA_DELETE_PILOT_APPROVAL.json).

Säker automatisk byteåtkomst inom Supabase är genomförd och faktiskt testad. Ingen bred API-nyckel eller manuell lista med 519 signerade länkar behövs. Utfärdade tillfälliga lässcope är avstängda. [Teknik och avgränsning](SKYLLA_SCOPED_ACCESS.md).

151 relevanta tester passerar; separat SKYLLA-CI passerar 106. Full CI:s 29 fel är exakt main-baslinjen. Main, aktiva bildreferenser och HERMES v8 har inte ändrats. [PR #124](https://github.com/lindkvistfoto-dot/alea-crusaders/pull/124) är draft och har inte mergats. Kopplad till [Issue #123](https://github.com/lindkvistfoto-dot/alea-crusaders/issues/123).

Första verkliga radering väntar på projektägarens separata godkännande av de fem exakta objekten. Ingen raderingsfunktion eller automatisk raderingsworkflow har aktiverats. NAS-undantaget är begränsat till `alea-hermes-source`; KERBEROS ordinarie policy kvarstår.
