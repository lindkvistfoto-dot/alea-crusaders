# SKYLLA Mobile Operations – 2026-10-20

## Leverans och integration

PR #124 mergades först (`285790eee18e703760c75d0a9c93b4e9ff54eb2e`), därefter #125 (`45d8ce8a2213282cf5b1f14ac473011bba85d070`). Exakta CI-jobbloggar för båda PR-huvudena jämfördes med de normaliserade testnamnen på dokumenterad main-baslinje: **samma 29 underkända tester, inga nya eller saknade fel**. De 194 relevanta integrationskontrollerna passerade. Ingen generell CI-felsökning gjordes. Se [integrationskvittot](evidence/INTEGRATION_REVIEW.json).

Ny manuell workflow: `.github/workflows/skylla-mobile.yml`. Den levererar manifestbunden preflight, en förberedd Environment-grind, GitHub OIDC-autentisering, kortlivad batchbehörighet, Google WIF-läsning, ett batchkommando och nedladdningsbar rapport/journal. Ingen bred Supabase-nyckel finns i GitHub. Serverns inbyggda nyckel lämnar aldrig Supabase.

Aktuell server: `skylla-mobile` version **3**, bundle SHA-256 `2cf38dbff7941c458bdc59a6545f6d51297ad1f7c1e533683c4fab6691101e17`. `execution_enabled: false`. Endast `main` tillåts utfärda nya dry-run-behörigheter. Den tillfälliga utvecklingstriggern och utvecklingsrefen användes för provet nedan och är borttagna från slutleveransen. Ingen gammal Edge Function eller HERMES-workflow ändrades.

## Tester

- **83 Python + 131 JavaScript = 214 SKYLLA-kontroller passerade** lokalt. Därav 8 nya klienttester och 40 nya tester av OIDC, tickets och serverns säkerhet. Befintliga syntetiska batch-, källverifierings- och pilotkontroller återanvänds.
- [Actions: syntetiska SKYLLA-kontroller](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39442514651) passerade, inklusive dess befintliga KERBEROS-beroendetester (28 ytterligare). Ingen Alea-appsvit startas av driftflödet.
- Deno-check av serverns entrypoint passerade. YAML och `git diff --check` passerade.
- Första Actions-provet fångade repositoryts nya OIDC-subjectformat med permanenta ID:n och en saknad fil i testjobbets sparse-checkout. Dessa rättades och fick regressionstest respektive korrekt checkout. Inga sådana fel återstår i de gröna syntetiska kontrollerna.

## Verklig Actions-dry-run

[Körning 39442513843](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39442513843), commit `9848e137d48440a9964f2701c74a0046fa9766c2`:

| Kontroll | Resultat |
| --- | --- |
| Exakt batch | SKYLLA-BATCH-001 |
| Kanonisk manifest SHA-256 | `638c68cc4e4e2b6e01d986abef009bfac22499ef7a95746146cfdfdf038da090` |
| Omfattning | 100 objekt, förväntat 333 077 975 byte |
| GitHub OIDC → signerad preflight-biljett | Godkänd |
| Biljett + körningsbundet OIDC → 20 minuters batchbehörighet | Godkänd |
| Google WIF | Avvisad: `unauthorized_client`, `The given credential is rejected by the attribute condition.` |
| Aktuell Drive-/källverifiering i detta prov | 0 verifierade, 100 överhoppade med `DRIVE_READ_AUTH_REQUIRED` |
| Raderingar / frigjorda byte | **0 / 0** |
| Rapport/journal uppladdade | Ja, artefakt `skylla-result-1` |
| Produktionsjobb | Överhoppat; aldrig godkännande eller radering |

Körningen blir avsiktligt röd när samtliga aktuella säkerhetskontroller inte kan uppfyllas. Detta är ett dokumenterat åtkomsthinder, inte ett godkänt produktionsprov. [Full objektrapport](evidence/ACTIONS_DRY_RUN_REPORT.json), [preflight](evidence/PREFLIGHT.json), [offentliga OIDC-kontekstfält](evidence/GITHUB_CONTEXT.json) och [artefaktidentitet](evidence/ACTIONS_EVIDENCE.json) finns utan token eller nycklar.

## Behörighetshinder och nästa steg

1. **Google WIF**: den befintliga provider-konfigurationens attribute condition avvisade utvecklingskörningen. Villkorets exakta uttryck kan inte läsas med tillgängliga anslutningar; detta bevisar inte att `main` är blockerat. Efter granskning/merge av MOBILE-PR: kör först `dry-run` på `main`. Om det fortfarande nekas behöver en Google Cloud-administratör tillåta endast rätt repository-ID, `main` och denna workflow inklusive environment-jobbet. Begär inte tillit till valfria grenar. Säkerställ även läsåtkomst till de exakta arkivmapparna för `hermes-transfer@alea-hermes.iam.gserviceaccount.com`; den åtkomsten kunde inte provas eftersom WIF stoppade före tokenutgivning.
2. **Environment**: required reviewers stöds för detta publika repository på nuvarande GitHub-planer, inklusive Free. Faktisk `skylla-production`-konfiguration kunde inte läsas/verifieras av Actions-preflight: miljön saknas eller API-läsningen nekas. Projektägaren behöver kontrollera/skapa den enligt [Android-guiden](ANDROID_OPERATOR.md). Den måste kunna läsas av jobbets tillfälliga GitHub-token; ingen personlig bred token är en reservväg. Miljögrindens inställningar ska vara verifierade före separat produktionsaktivering. Verklig environment-review kunde inte provas inom detta uppdrag; serverns review-kontroller är syntetiskt testade.
3. **Aktivering**: slutleveransen är avsiktligt spärrad. En separat granskad policyändring och deployment krävs efter godkänt aktuellt dry-run och kontrollerad miljögrind. Inget sådant aktiveras inom detta uppdrag.

Nästa 100-filsmanifest är färdigt men **inte driftklart för radering**. Ingen ytterligare batch är godkänd genom denna leverans.

## Drift och återupptagning

En normal produktionskörning hanterar högst 100 exakta objekt med **ett ägargodkännande** i GitHub och **noll Codex-terminalgodkännanden**. Bara de fyra operativa kontrollerna i [säkerhetsbeskrivningen](SECURITY_AND_OPERATIONS.md) körs per objekt. Testsviter körs när verktyget ändras.

Intent och kvitton skrivs löpande med fsync, och rapporten uppdateras efter varje objekt. Vid normal felhantering laddas journalen upp och kan återanvändas från Android genom tidigare run-ID/försök. Ny körning får ny behörighet och kräver ny environment-review. Hårt runner-bortfall innan artefaktuppladdning kräver separat avstämning; lokala filer är inte en extern kontinuerlig loggtjänst. Ingen blind omradering sker.

## Produktion oförändrad

Före/efter: **514 original / 1 487 414 822 byte**, identiska källfingeravtryck, identiska HERMES-jobb och registertabeller. HERMES v2 version 8/bundle är oförändrad. **Ändrade DB-referenser: inga. Startade publiceringar: inga. Raderade objekt: inga.** Se [maskinellt jämförda tillstånd](evidence/PRODUCTION_INVARIANTS.json).

Kort operatörsinstruktion: [Starta, godkänn och följ från Android](ANDROID_OPERATOR.md).
