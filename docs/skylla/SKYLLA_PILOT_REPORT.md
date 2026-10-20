# SKYLLA – femfilspilot genomförd

Exakt de fem original som valdes i PR #122 och föreslogs i PR #124 har, efter projektägarens uttryckliga separata godkännande, återvaliderats och raderats från `alea-hermes-source`. **5/5 verifierat frånvarande; 14 199 932 byte frigjorda.** Ingen avvikelse eller överhoppning inträffade.

[Fullständig körningsrapport med exakta sökvägar, Drive-ID:n, byteantal och verifieringskvitton](SKYLLA_DELETE_PILOT_REPORT.md). [Utförda objekt CSV](SKYLLA_DELETE_PILOT_RESULTS.csv). [Godkännande](evidence/delete-pilot/OWNER_APPROVAL.json).

Arkiveringen före piloten omfattade 507 originalposter / 1 468 662 842 byte och 506 unika permanenta Drive-filer / 1 465 949 422 byte. Inbox behölls. Samtliga 507 källor byteverifierades inom Supabase; inga breda nycklar överfördes till Codex. Tolv symboloriginal saknar ännu explicit arkivmappning.

För de fem pilotoriginalen upprepades arkivreadback, full PNG-avkodning, actual SHA-256, storlek och kategori/variant. Servern verifierade sedan källbytes, HERMES-jobb, registerpekare och visningsbytes på nytt omedelbart före varje Storage-API-DELETE. Bevis äldre än tio minuter blockerade radering. Inga SQL-raderingar utfördes.

Efteråt passerade autentiserad frånvarokontroll två gånger för varje original, och de fem visningsbilderna var byteidentiska och fullständigt avkodningsbara. Alla 185 registerposters bildfält och 519 HERMES-jobb var oförändrade. Alla andra Storage-objekt och samtliga 13 andra buckets var oförändrade. De fem Inbox-originalen och Drive-arkivkopiorna finns kvar i rätt mappar.

170 relevanta automatiserade tester passerade. Alla tillfälliga läs-/raderingsscope är avstängda och repo-defaults är avstängda. PR #124 förblir draft/omergad. **Avvakta nytt godkännande innan fler raderingar.**
