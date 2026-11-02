# OLYMPIA 2.0 – säkerhetsgranskning efter PR #515

## Omfattning
Skrivskyddad analys av `supabase/functions/olympia-control/index.ts`. Ingen aktivering av `OLYMPIA_AUTO_LIVE_CANDIDATE`, ingen deploy och ingen LIVE-publicering.

## Resultat

### 1. DEV-merge isoleras från kandidatfel – godkänt
`approve_and_merge_dev` bekräftar merge och journalför acceptans innan `autoPrepareLiveCandidate` anropas. Kandidatfel fångas och returneras separat som `liveCandidate.state=failed`, utan att den lyckade DEV-mergen rapporteras som misslyckad.

### 2. Ingen automatisk LIVE-merge – godkänt
Automatiken använder `startCandidateRequest` och inte `final_approval`. Serverflaggan `OLYMPIA_AUTO_LIVE_CANDIDATE` måste uttryckligen vara `enabled`; annars returneras `disabled`.

### 3. Samtidig idempotens – blockerande
`autoPrepareLiveCandidate` hämtar de senaste 100 issues och söker efter en matchande PANDORAS ASK-post. Två samtidiga körningar kan båda missa en befintlig post och skapa var sitt issue. Paginering saknas för äldre ärenden. Kräver en atomär unik nyckel/låsning eller en verifierbar serialiseringsstrategi per PR och käll-SHA före aktivering.

### 4. Återanvändning av releasebegäran – blockerande
`startCandidateRequest` återanvänder samma issue-branch men ökar `attempt` och kan tvinga om branchens ref. Det är återförsök, inte säker no-op-idempotens. Befintlig, verifierad kandidat ska returneras utan att skrivas om; ett nytt försök måste vara uttryckligt och spårbart.

### 5. Status efter merge – behöver kompletteras
Resultatet returnerar `liveCandidate.state`, men det behöver finnas bestående och tydlig kortstatus även efter siduppdatering och vid asynkrona kandidatfel. Klienten ska inte utgå från att ett issue innebär en färdig, granskbar kandidat.

## Rekommenderad reparationsordning
1. Inför säker, entydig kandidatnyckel per käll-PR och testad SHA och verifiera samtidiga anrop.
2. Gör upprepad begäran till no-op när en kandidat redan finns; separat explicit återförsök för fel.
3. Lägg till riktade tester för parallella anrop, förlorat svar, befintlig kandidat och ofullständig journal.
4. Visa `disabled / requested / failed / ready` som separata statusar i OLYMPIA.
5. Testa med en isolerad DEV-pilot, därefter besluta om serverflaggan får aktiveras.

## Stopplinje
Ingen aktivering av `OLYMPIA_AUTO_LIVE_CANDIDATE` och ingen automatisk publicering till LIVE innan blockerande punkter är verifierat lösta. Ändra inte den fungerande DEV-mergevägen utan riktade regressionstester och återgångsplan.
