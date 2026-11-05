# PHOENIX / HERMES V – pensionering förberedd

PHOENIX ersätts för nya utvecklarleveranser av HERMES CORE. Denna DEV-ändring gör enbart `.github/workflows/hermes-v-trophy.yml` inert. LIVE ändras först genom separat godkänd LIVE-PR/merge.

## Befintlig ersättning

| PHOENIX-mål | CORE |
| --- | --- |
| Systembilder och troféramar | unrestricted-system / system-registry |
| Spell-, skill- och symbolbilder | Befintliga legacy_kind_profiles i CORE-kontraktet |
| Unik medaljillustration, badge, utmärkelse | honor-definition, befintligt definitions-ID |
| Reliefvariant | honor-relief, befintligt variant-ID och material |

CORE registrerar bild och uppdaterar endast bildreferensen. Det väljer inte publicerad relief, aktiverar inte definitionen och tilldelar inte en rollperson utmärkelsen. Dessa operationer finns separat i honors-entry.js (save/publishVariant/grant).

PHOENIX:s extra länksteg kunde skapa en saknad reliefvariant. CORE skapar avsiktligt inte spelposter: använd det befintliga behörighetsstyrda Honors-sparandet för att skapa utkastet först (honors-entry.js saveVariant POST honor_relief_variants), och skicka dess ID till CORE. Adminformuläret för ny variant är idag kopplat till en ALEA-uppladdning; det finns inte någon separat knapp för ett tomt CORE-utkast. Den befintliga sparoperationen kan ta emot en variant utan bild. Ingen ny publisher, databasskrivning eller UI-utveckling ingår här.

Materialalias metal_relief → metal och carved_wood → wood finns kvar i queue-target.js. Befintliga bildalias och resolver ändras inte. Medaljer behöver ingen reliefvariant.

## Skrivskyddat underlag 2026-11-05

- LIVE hermes_jobs: 625 active, 17 failed; inga väntande/processing/retry-statusar. Inga köade, pågående, requested eller waiting PHOENIX-körningar hittades i Actions-listorna.
- 30 medaljreferenser och en badge-definition refererar till befintliga registerposter. Fyra reliefreferenser finns i systemregistret; den femte har hermes-alea:-prefix och hanteras av den bevarade ALEA-resolvern.
- CORE-kontraktets blob är identisk på main och development. Befintlig verifierad LIVE-run 42065036645 på ee4a66995ebbc1767283ab5a1a306a45406a3adf används som transport-/arkiv-/Storage-/SHA-256-underlag. Ingen ny LIVE-publicering startas.
- PHOENIX är en manuell workflow, inte en persistent separat kö. Publisher-/intake-/länkskript, konfiguration, original, arkiv, register, jobb och gamla referenser behålls.
- Begränsning: ingen ny LIVE-publicering mot medalj/relief, och ingen ny faktisk tilldelning har genomförts. Mål- och CAS-beteendet verifieras med befintliga riktade kontroller.

## Rollback

Före DEV-merge: stäng PR:n. Efter merge: förbered en separat granskad PR som återställer endast workflowen från development-baseline c06a61780b0ecabc56d4d59d691903ca2eff096c. LIVE-baseline före pensioneringen är 680c5ff0835e59abb56e501fd16b680caef07440; kontrollera aktuell main innan en LIVE-portering eller rollback.

Återaktivering kräver konkret beroende och separat Zeus-godkännande. Återställ inga köfiler, ändra inga jobbstatusar och starta inga historiska Actions/retries. Ursprunglig PHOENIX har enbart manuell dispatch; att återställa filen återkör därför inga bilder. Samma nya referens får inte samtidigt levereras genom PHOENIX och CORE.

---

## Historisk dokumentation (ingen aktuell körinstruktion)

# OPERATION PHOENIX — HERMES V (Troférum pilot)

**Purpose:** one approved PNG in → one verified system asset out. No replacement of HERMES 4.x.

## Operator steps (GitHub Actions)

1. Open **HERMES V – Troférum (PHOENIX pilot)** on main.
2. Choose **red**, **green** or **blue**, then **verify**. The run checks the pinned Inbox PNG SHA-256 and RGBA quality without publishing.
3. Choose the same color and **publish**. The existing HERMES runner checks the *independent archived Drive copy*, converts to WebP, publishes to Supabase, reads back and registers the system asset.
4. Green workflow plus a valid `arcane_system_assets.asset_path` is the completion criterion. Read the retained report artifact for each attempt.

**Mapping:** red = center wall, blue = left wall, green = right wall.

The three original PNGs are already in HERMES Inbox; independent copies are in the existing system-asset original archive. The pinned SHA-256 values were computed from the uploaded original files. The pipeline verifies both Drive copies byte-for-byte at run time.

**Safety:** no source files in GitHub; no browser secrets; no automatic trigger; no deletion; no success claim until source, archive, optimized file, Storage and DB pointer pass. Failed attempts are visible in GitHub Actions and report artifacts. Re-running the same color is safe only subject to existing publisher idempotency and pointer checks.

**Scope:** this pilot handles only the three approved medal display frames. Existing spell, skill and battle-pose HERMES pipelines remain untouched. The central medal popup uses the red system asset after publication; other walls will use blue/green when implemented.

**Do not merge until CI and workflow review pass.** A successful CI is not evidence that the live HERMES V run has published an image.

## HERMES V universal intake

The workflow now accepts every asset kind already implemented by the HERMES publisher: system assets, spell/skill icons and illustrations, cutouts, and symbols. The operator supplies kind, target key/ID, Inbox Drive ID, independent archive ID, original SHA-256, visual approval, and verify/publish. The three trophy frames remain pinned presets in the adapter for regression tests.

**Scope is no longer limited to trophy images.** Existing destination schemas and target registrations still apply; a new domain (such as honor relief variants) requires its own verified target adapter, not a fake system-asset record. Never bypass alpha, archive, permissions, or CAS checks. The workflow is manual and requires an approved archive copy before publishing.
