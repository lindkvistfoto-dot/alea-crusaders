# HERMES 3.0 · Permanent tillitsmodell och kontrollerad bildkedja

**Status:** införandeförslag med läsande verifiering, artefaktbaserad WebP-staging och isolerade tester på PR-gren. **HERMES 3.0 är inte produktionsaktiverad.**
**Datum:** 2026-10-17 · **Repo:** `lindkvistfoto-dot/alea-crusaders`

## 1. Fastställd orsak och låst säkerhetsgräns

Google Cloud Workload Identity Federation-providern `github/alea-hermes` har det kontrollerade attributvillkoret:

```cel
attribute.repository == 'lindkvistfoto-dot/alea-crusaders' &&
assertion.ref == 'refs/heads/main'
```

Detta **ska inte utvidgas till utvecklingsgrenar**. Den tidigare `unauthorized_client` på
`sisyphus/arcane-gallery-shared-mechanics-20261016` visar att spärren fungerade.

Nuvarande identitet:
- GCP-projekt `alea-hermes`, projektnummer `303776456341`
- Pool `github`, provider `alea-hermes`
- Servicekonto `hermes-transfer@alea-hermes.iam.gserviceaccount.com`
- OAuth-scope: `https://www.googleapis.com/auth/drive.readonly`
- HERMES Inbox: Drive-mapp `1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp`

## 2. Separerade roller

| Del | Körkontext | Behörighet | Producerar |
|---|---|---|---|
| SISYPHUS | GitHub PR/utvecklingsgren | GitHub read, **ingen** Google OIDC, **inga** Supabase-nycklar | kod, grafikförslag och request-metadata |
| HERMES 3 – intake | **endast** `workflow_dispatch` på `main` | kortlivad Google OIDC, Drive **read-only**, GitHub contents read | kontrollerat original + SHA-256-kvitto, 7-dagars Actions-artifact |
| HERMES 3 – staging | GitHub PR | GitHub contents read, inga releasehemligheter | tester och 7-dagars, **ej driftsatt** byggartefakt |
| HERMES – production | framtida separat releasegrind | explicit godkännande och minsta nödvändiga behörighet | slutlig app- eller Storage-publicering med återläsning |

**Viktigt:** Ett lyckat intakejobb är INTE en produktionspublicering. Ett grönt stagingtest är INTE ett godkännande av privat innehåll. Allt som exponeras i ett publikt GitHub-repo eller dess artifacts måste betraktas som publikt.

## 3. Levererad första implementation

- `config/hermes3-profiles.json`: deklarerade medieprofiler och explicita avvisningar.
- `scripts/hermes3_policy.mjs`: strict schema, public approval, profil, MIME, SHA-256, Drive-ID och mål, avvisar okända fält.
- `scripts/hermes3_drive_verify.py`: läser enbart från HERMES Inbox, verifierar source SHA/dimensioner/alfa/ZIP och skriver *lokalt verifieringskvitto*, ingen DB eller commit.
- `scripts/hermes3_stage.py`: genererar endast innehållsadresserade WebP-filer och `staging-manifest.json` från verifierad originalfil + kontrollsummekvitto. Behåller alfakanalen, ignorerar ZIP-dokumentation och skriver bara till tillfälliga artefaktkataloger.
- `scripts/hermes3_archive_smoke.py`: kör ett rent offlineacceptanstest mot det redan offentligt arkiverade ARCANE MORPHING FRAME v0.1-originalet och kontrollerar samtliga **29 sprites** utan att påstå att ett nytt Google Drive-anrop gjorts.
- `.github/workflows/hermes3-trusted-verify.yml`: manuell `main`-baserad OIDC med `contents: read`, `id-token: write`; inte triggad av pull request eller push.
- `.github/workflows/hermes3-staging.yml`: PR-tester och `dist/` som tidsbegränsad Actions-artifact; inget OIDC, ingen Pages-deploy.
- `tests/hermes3-policy.test.js` samt `tests/test_hermes3_*.py`: säkerhets-, format-, ZIP- och WebP-regressionstester.

För ZIP-buntar får PNG-bilder och ett JSON-manifest granskas tillsammans med passiva README-/HTML-dokument. README och HTML **tolkas aldrig som kod och distribueras inte som appresurser** av verifieraren. En framtida release får bara välja explicit godkända bildsprites, aldrig extrahera körbar demo-HTML direkt till webbplatsen.

En konkret **verifiera-endast** begäran för redan publicerat ARCANE MORPHING FRAME-original ligger i `hermes3/requests/arcane-gallery-kit-v01.json`; den startar inget jobb automatiskt.

**Detta är en grundkedja, inte en aktiverad generell publicerare.** Profilerna har status `verify` och tillåter *inte* automatisk DB-aktivering, deploy eller promotion. Videotranscodning och privat material är uttryckligen blockerade tills separata kontroller finns. Inga befintliga HERMES 2.x-flöden ersätts av denna PR.

## 4. Normal arbetsordning efter godkänd utrullning

1. SISYPHUS tar fram ett **publikt och godkänt** original och lägger det i HERMES Drive Inbox; hämtar det faktiska Drive-ID:t och beräknar SHA-256.
2. SISYPHUS skapar en versionsstyrd metadatarequest under `hermes3/requests/<job-id>.json` i en PR. Requesten innehåller **inte** bilden, privata data, API-nycklar eller en fritt vald sökväg.
3. Läsande stagingtest bekräftar schema och kod, en människa granskar rättigheter och bildmaterial. `public_release_approved=true` är **en deklaration, inte en ersättning för mänsklig kontroll**.
4. Godkänd request förs in till skyddad `main` via granskad PR. Ingen ny HERMES 3-process startar vid själva mergehändelsen.
5. En betrodd användare startar `HERMES 3 – trusted Drive verification` på `main`, anger den granskade requestens exakta sökväg. WIF accepterar `main`; resultatet är SHA-verifierat original och ett tidsbegränsat kvitto som kan användas vid staginggranskning.
6. Framtida separat **promote**-funktion kontrollerar source SHA, staging och godkännande innan **exakt ett** appmål eller DB-fält får ändras. Den är **inte implementerad** och får inte simuleras genom direkt commit till `main` eller manuell Supabase-uppdatering.

Exempel på requeststruktur (ersätt platshållare med verifierade värden):

```json
{
  "schema": 3,
  "job_id": "gallery-kit-20261017",
  "profile": "ui-sprite-package",
  "source": {
    "provider": "google-drive",
    "file_id": "VERIFIED_GOOGLE_DRIVE_FILE_ID",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "mime_type": "application/zip",
    "visibility": "public",
    "public_release_approved": true
  },
  "target": {
    "category": "ui-components",
    "key": "arcane-gallery"
  },
  "intent": "verify-only"
}
```

## 5. Säkerhetskrav före verklig produktionspromotion

1. **GitHub `main` är nu delvis skyddad** med det aktiva rulesetet `ALEA – MAIN PROTECTION` (ID `25281343`): `deletion` och `non_fast_forward` gäller `refs/heads/main`, utan bypass. Bekräftat via GitHub ruleset-API 2026-10-17. **Krävd PR och kontrollerade statuschecks saknas fortfarande.** Dessa kan inte slås på förrän HERMES 2.x:s automatiska skrivningar till `main` har migrerats säkert.
2. **Separata behörigheter för publicering:** inför GitHub Environment för produktion med required reviewers och deployment branch restrictions; förvara publiceringshemligheter där, inte i PR-jobb. Verifiera att villkoren verkligen finns innan aktivering.
3. **Rätta befintlig CI-baslinje:** `main` hade 48 fel i 27 testfiler redan innan HERMES 3. Då dessa ännu inte är reparerade får en grön isolerad svit inte kallas fullständigt grön.
4. **Separera privat från publikt:** privata kampanjbilder och porträtt får inte laddas till publik GitHub eller till publikt Actions-artifact. För dessa krävs autentiserad Supabase Storage + RLS och ett separat, aldrig offentligt, leveransprotokoll.
5. **Signera beslutsgränsen:** mänskligt godkännande av publiceringsrätt måste verifieras och loggas i releaseprotokollet – ett JSON-boolean räcker inte.
6. **Bygg en separat promote-jobb** som enbart konsumerar ett specificerat och SHA-verifierat staging-kvitto, godkända profiler samt kontrollerad release. Ingen implicit publicering från `push`.

## 6. Migrering och kompatibilitet

- HERMES 2.3 för `spell`/`symbol`, befintlig `ui`-kedja och publika statiska bilder påverkas **inte**.
- Ingen massmigrering eller ändring av Supabase/RLS eller Google Cloud IAM i denna etapp.
- Den tidigare ARCANE MORPHING FRAME-grafiken på `main` är redan publicerad genom PR #44; HERMES 3 är **inte** en rollback av den koden.
- De äldre arbetsflöden som automatiskt publicerar efter `main`-commit måste omfattas av separat säkerhetsgranskning innan man kan lova en universell releasegrind.
- Kvitto från intake måste läsas tillbaka och jämföras mot förväntad SHA innan någon senare promotion. Alla verkligt nådda tillstånd rapporteras separat (`VERIFIED`, `STAGED`, `PUBLISHED`, `ACTIVE`).

## 7. Tester och återställning

Kör isolerat:
```bash
node scripts/hermes3_policy.mjs --all
npx vitest run tests/hermes3-policy.test.js
python -m unittest discover -s tests -p 'test_hermes3_*.py' -v
python -m scripts.hermes3_archive_smoke /tmp/hermes3-arcane-preview
npm run build
```

Efter huvudgrenens godkända integrering kan den läsande verifieringen köras med `workflow_dispatch` på `main`. Utdata innehåller då både *verified-source* och färdiga WebP-filer med `staging-manifest.json` under sju dagar. **Ingen av dessa filer publiceras direkt till Pages eller Supabase.**

En misslyckad verifiering lämnar allt i produktion orört. HERMES 3 har ingen automatisk fallback till osäkra behörigheter. Radera aldrig gamla original på grund av ett misslyckat jobb; rätta requesten via ny PR och kör explicit igen efter granskning.
