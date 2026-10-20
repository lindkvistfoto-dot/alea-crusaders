# SKYLLA Mobile Operations – säkerhet och drift

## Autentisering och exakt batch

`workflow_dispatch` startar en körning. Utvecklingsgrenen har dessutom ett avgränsat push-trigger för den första verkliga Actions-dry-run-körningen. Inget pull-request-event kan starta drift. Alla körningar delar en concurrency-grupp utan automatisk avbrytning.

Supabase-funktionen `skylla-mobile` verifierar GitHubs RS256-signatur med fast issuer/JWKS. Repository-ID, ägar-ID, actor-ID, workflow-fil, ref, workflow-SHA, commit, event och kort JWT-livslängd måste stämma. Endast ägaren kan starta drift. Betrodd repositorykod på `main` ingår i säkerhetsgränsen; ägarens GitHub-konto ska skyddas med MFA.

Preflight-jobbet saknar environment. Det hämtar katalog och manifest från GitHub vid JWT:ns exakta commit, kontrollerar det kanoniska manifestets SHA-256 och får en HMAC-signerad godkännandebiljett. Biljetten binder batch-ID/hash, commit, körnings-ID, försöksnummer, läge och utgångstid (60 minuter). Biljetten kan inte användas som Storage-behörighet. Ett environment-jobb får inte skapa en ny biljett efter ägarens godkännande.

Efter grinden lämnar exekveringsjobbet ett nytt OIDC-bevis och samma biljett. Servern kräver `main`, manuell dispatch, rätt environment och repositoryts ägarreview för körningen. GitHubs egen deployment-grind gäller också för varje försök. GitHub Environment API läses med körningens kortlivade, läsande `GITHUB_TOKEN`; om API:t inte kan läsas blockeras produktion. Inga personliga eller breda nycklar behövs i GitHub.

Servern utfärdar en **20 minuter** lång HMAC-signerad behörighet för exakt batch, manifesthash, commit, körning/försök och läge. Den återanvänds under hela batchkommandot (högst 100 objekt). Den saknar allmän Storage-API-rättighet och godtas endast av den egna funktionen. Projektets inbyggda service-role-nyckel stannar inne i Supabase. Inga API-nycklar förs över till Codex eller Actions.

Google WIF ger ett 20 minuter långt `drive.readonly`-token utan nyckelfil. OAuth-token begränsas av servicekontots Drive-delningar och lässcope; den är **inte** begränsad till enbart batchfilerna av Google. Servern tillåter däremot endast manifestets exakta arkiv-ID:n. Den Supabase-behörighet som kan medge radering är strikt batchbegränsad. En framtida separat arkivläsare med endast arkivdelningar kan ge ännu mindre Google-åtkomst; ändra inte befintlig HERMES-identitet som bieffekt.

## Obligatoriska kontroller per objekt

1. Exakt bucket/sökväg, Storage-ID/version/ETag/tidsstämpel/storlek och faktisk SHA-256. Tidigare server-HMAC-signerat bytekvitto återanvänds bara för samma nuvarande identitet. Annars läses samtliga bytes och SHA-256 beräknas. Full PNG-avkodning är redan styrkt för exakt detta SHA-256-innehåll.
2. Permanent Drive-ID, rätt arkivmapp, oförändrad binär head-revision, storlek, PNG-format och Drive SHA-256. Tidigare fullständig återläsning gäller endast samma revision och innehåll. Saknas Googles SHA-256-fält läser servern hela arkivfilen och beräknar hash.
3. HERMES-status, frånvaro av väntande jobb, oförändrad aktiv WebP-referens och inga registerreferenser till Supabase-originalet. Källa kontrolleras igen efter byte- och beroendekontrollerna.
4. Vid framtida aktiverad körning: Storage-API för en enda exakt sökväg, kontroll av API-svaret och autentiserad frånvarokontroll. Summeringen räknar varje bevisat frånvarande batchobjekt en gång och skiljer tidigare frånvaro från en bekräftad API-radering. Inga SQL-raderingar finns.

Osäkra filer hoppas över. Auth-fel avbryter fortsatt åtkomst; tre överföringsfel i följd stoppar körningen för avstämning. Ingen app-testsvit körs per batch. Om verktygskoden ändras körs de avgränsade SKYLLA-testerna.

## Dry-run och produktionsspärr

Den levererade policyfilen har `execution_enabled: false`. Både klientens preflight och servern nekar `execute`. Dry-run-behörighet nekar dessutom execute oberoende av policy och den interna HTTP-adaptern tillåter bara GET mot Supabase. Ingen produktionsradering kan startas genom att ändra dispatch-input, biljett, manifest eller action.

Produktionsaktivering kräver en separat granskad policyändring, deployment av den granskade funktionen samt verifierade miljöskydd och Drive-rättigheter. Denna leverans aktiverar ingenting. Äldre `skylla-batch`/pilotfunktioner lämnas spärrade.

## Kvitton, återupptagning och hemligheter

Runnern sparar intent före anrop, fsync:ar kvitto efter varje objekt och ersätter rapporten atomiskt. Journalen låses, binds till manifesthash och avvisar symlänkar/annan batch. Tidigare raderingsförsök återupptas genom statusläsning; återskapade original kräver ett nytt godkänt manifest. Artefaktuppladdning körs med `always()` efter jobbet. Vid ett hårt VM-bortfall kan ännu ej uppladdade lokala kvitton gå förlorade; detta kräver separat avstämning, aldrig en blind omradering eller påhittad besparing.

Endast rapport/journal laddas upp som resultat. Biljetten är en separat, icke-bärande preflight-artefakt. Supabase-behörigheten sparas med 0600 i privat RUNNER_TEMP-katalog; Google/GitHub/OIDC-token stannar i minne/maskerade Actions-variabler. Ingen hemlig fil ingår i artefaktsökvägar eller versionshantering. Runnern följer inga redirects för autentiserade anrop. Fel svarar med fasta koder utan leverantörens detaljer.

För en normal batch behövs ett ägargodkännande i Environment och **noll terminalgodkännanden**. En avbruten körning, ny manifestidentitet eller utgången 20-minutersbehörighet kräver en ny körning och ny review; inga obegränsade förlängningar finns.

## GitHub-plan

Repositoryt är publikt. GitHubs aktuella dokumentation anger Environment och required reviewers för publika repositoryn på alla nuvarande planer, inklusive Free; äldre legacy-planer undantas. Billing-planen kan inte läsas med den anslutna integrationen, men den behöver inte höjas för denna funktion i ett publikt repository. Faktisk miljökonfiguration inspekteras av preflight och redovisas separat.

Källa: [GitHubs planvillkor för environments](https://github.com/github/docs/blob/main/data/reusables/gated-features/environments.md), granskad 2026-10-20. Teknisk auth: [GitHub OIDC](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect), [Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth).
