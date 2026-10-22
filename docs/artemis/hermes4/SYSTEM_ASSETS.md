# ARTEMIS — Arcane Paper Doll system assets

2026-10-22. Kodbas: `64346c8f` på main. Återanvänder befintliga Drive-original och arkivkopior från det föregående arbetet; ingen ny inventering, arkivering, originaluppladdning eller radering. Ingen produktionsmigration, publicering eller merge utförd.

## Slutligt stöd

`system-asset` är en snäv HERMES 4.0-batchprofil för två stabila nycklar. Befintlig `hermes_drive_intake.py`, `hermes2_prepare.py`, `hermes2_publish.ts`, `hermes_jobs`, Actions/WIF och display-bucket `alea-hermes-public` återanvänds. Det äldre stoppade UI-intaget öppnas inte.

| Nyckel | Original/arkiv SHA-256 | Arkivfil | WebP |
|---|---|---|---|
| `arcane-paper-doll-hexagon-base` | `5110e8857b893971f9de080a9f0d5c5b9097dffc1770432b8448be86edf711df` | `1_B9T0X7jCCj47nyjl5D1u29CLR11tyw0` | 1220×811, 333 968 byte, quality 90 |
| `arcane-portrait-stand` | `b6b9682bdc3e94965b6ff2e95baf450ebdbd079e9a24f0340bcfc41bd469ca40` | `1B05VBDjT61RkMQ0cZs5dApMYqK6ia4Bw` | 1067×1280, 189 638 byte, quality 90 |

Inbox-ID:n är `14BO3nNm-EDw1DKNJKOfwBouceJvzZ4z-` och `1IiIFM1foA2QVJV4dsqNAosDu_c6iDLH1`. Arkivfilerna ligger i redan skapade `SYSTEM ASSETS/BASES` respektive `SYSTEM ASSETS/PORTRAIT STANDS`; exakta mapp-ID:n finns i `config/hermes-system-assets.json`. Båda filerna har verifierad reader för `hermes-transfer@alea-hermes.iam.gserviceaccount.com`. Fullständiga Inbox-/arkivbytes jämfördes byte för byte och via SHA-256. Inga nya Drive-kopior eller rättighetsändringar gjordes.

Originalens alfaintervall är **0–254** respektive **0–255**. Alla alfapixlar i de verkliga WebP-derivaten jämfördes med motsvarande original efter proportionell skalning. Hela bildytan och bakgrundshinnan i hexagonoriginalet bevaras; ingen maskning, beskärning, upprätning eller färgändring införs. Alfabevis är inte ett visuellt godkännande av kartankare eller bakgrundshinna. [Maskinläsbara hash-/storleksbevis](SYSTEM_ASSETS_EVIDENCE.json) beskriver lokalt verifierade derivat, **inte publicerade Storage-objekt**.

Ny migration `supabase/migrations/20261022043725_arcane_paper_doll_system_assets.sql` behövs före publicering. Den utökar HERMES-kind-checken och skapar `arcane_system_assets` med två fasta UUID/key-identiteter och tomma bildplatser. Inga spelregler eller befintliga bildfält ändras. HERMES får SELECT och UPDATE endast på de sex publiceringskolumnerna. Autentiserade klienter får SELECT endast på publicerade rader genom RLS. Anon saknar tabellåtkomst; klienter saknar skrivning. Inga befintliga RLS-/Storage-policies ändras, inga nya buckets eller privilegierade RPC:er skapas. Originalproveniens stannar i HERMES-jobben.

Publiceraren verifierar arkivpinnen, källa, profilnyckel/UUID, dimensioner, WebP-hash, Storage-download och publik leverans-URL före aktivering. Metadata och pekare aktiveras atomiskt med CAS. Återläsning kontrollerar metadata och pekare. Misslyckad återläsning återställer endast den egna aktiveringen med CAS. Befintliga idempotens-, delfels-, pilot- och retryflöden används.

## Workshop-adapter

`features/ui/arcane-paper-doll-assets.js` laddas av index, men hämtar inget automatiskt. Workshop kan använda befintlig autentiserad läsväg:

```js
const {assets, systemArt} = await globalThis.aleaArcanePaperDollAssets.load({
  dbJson, baseUrl: SUPABASE_URL
});
// Lägg assets och systemArt i Workshoppens aktuella, behöriga manifest.
```

Resultatet följer BENGALI #139:s `Asset` och `systemArt`: fasta asset-UUID:n, `status=active`, `verified=true`, WebP-hash, storlek, dimensioner, alfa, bucket/path och de två etablerade systemnycklarna. Felaktiga eller opublicerade rader utelämnas. Dubbletter och DB-/authfel rapporteras; inga gamla rader cachas över sessioner. `src` är en publik WebP-URL för preview, inte ett påstående om att webbläsaren avkodat bilden. Konsumenten måste fortfarande hantera bildfel.

Faktisk kompatibilitetskontroll mot `features/battle-art/contracts.js` på BENGALI-commit `9612cc39b9676e8f0c73c5eaae95b7ee86d707d7`: **2/2 refs godkända av `validAsset`; båda SYSTEM_ART-nycklarna matchar**. Detta ersätter inte en körande Workshop eller ett browsertest. `layouts=[]` avsiktligt: inga påhittade markankare, sittpunkter eller porträttmasker. Fulla stridsposer och Mounted är separata arbeten.

## Verifiering

- HERMES Python: **20/20** (16 befintliga + 4 systemresursfall), verklig Pillow-konvertering, arkivhash/delfel, dimensioner, faktisk alfa och pixeljämförelse.
- Sex riktade Vitest-filer: **27/27**, inklusive publicerare, read-only-adapter, migration och riktiga PostgreSQL-roller/RLS/CHECK/CAS via versionslåst PGlite (endast testberoende).
- Full Vitest: main **1285 godkända / 29 fel**, gren **1293 godkända / samma 29 fel**. Inga nya fel; exakta namngivna basfel jämförda maskinellt i [testbevis](SYSTEM_ASSETS_TESTS.json).
- Standardbygge: **exit 139/segmentation fault på både oförändrad main och gren**. Detta är ett kvarstående basfel, inte ett godkänt bygge.
- Deno-typkontroll av publiceraren godkänd. `vite build --minify=false` godkänt.
- `git diff --check` och MINOTAURUS-originalguard godkända. MINOTAURUS CI kör även de nya testerna. Full CI kan fortsatt vara röd på grund av ovanstående basfel.

Produktions-Supabase kontrollerades skrivskyddat: `hermes_jobs` och `hermes_job_events` har RLS; `system-asset` och det nya registret finns ännu inte där. Migrationens nya RLS och grants testades lokalt, inte i produktion. Aktuell Supabase RLS-dokumentation hämtades genom anslutningen; changelog-filen blockerades av miljöns nätpolicy (HTTP 403).

## Exakt återstående före Workshop-visning

1. Granska och manuellt merge:a kod-PR:n till main. Ingen automatisk merge. Gemensamma CI-basfel/build måste hanteras enligt repots mergekrav.
2. Tillämpa medföljande migration via ordinarie databasrelease, och läs tillbaka tabell, grants och RLS. Inga aktiva DB-referenser har ändrats av denna leverans.
3. Den färdiga, käll-/arkivpinnade batchen finns i `hermes/system-assets/arcane-paper-doll-master-01.json`, **utanför den exekverbara kön**. Lägg den efter merge som en unik `hermes/queue/*.json` på main för en enda befintlig HERMES Actions-körning. Enbart merge av denna PR startar ingen bildpublicering.
4. Kräv två `active`/`already_active`, två rätta registerpekare/metadata och två hashverifierade publika WebP-URL:er. HERMES måste liveverifiera arkivåtkomst/mappmedlemskap med sin WIF-identitet; ansluten Drive-readerbevisning ensam är inte ett sådant liveprov.
5. Koppla den injicerbara adaptern ovan till den faktiska Workshop-versionens manifest/preview. Workshop/BENGALI är inte mergad i denna main-bas och det finns ingen Workshop-vy här att aktivera. Verifiera laddning, transparent preview och bildfelsfallback där. Kartvisning kräver dessutom separat visuell kalibrering av bas/stand och porträttöppning.

Kodstödet är komplett för de två systembilderna. Slutlig drift- och Workshop-visning ska inte beskrivas som verifierad före steg 2–5.
