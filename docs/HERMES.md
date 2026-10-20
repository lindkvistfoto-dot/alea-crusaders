# Protokoll HERMES — MINOTAURUS

Standard för nya bilder från och med Issue #128: **Google Drive → HERMES → WebP → Supabase**.
Original arkiveras i befintligt Google Drive-originalarkiv. Ingen PNG får nypubliceras till GitHub eller `alea-hermes-source`. Befintliga appfiler och aktiva bildreferenser behålls.

## Intag och publicering

1. Lägg det godkända originalet i befintlig HERMES Inbox. Behåll Drive-originalet och dess arkivkopia. Läs verkligt Drive-ID och SHA-256; gissa inte mål eller hash.
2. Skapa en unik `hermes/queue/<job-id>.json` med explicit mål och fastlåst källhash. Köfilen är en startorder, aldrig bildbytes, Base64 eller credentials.
3. `hermes-drive-intake.yml` använder befintlig read-only Google WIF och befintlig Supabase-secret `HERMES_SUPABASE_SERVICE_ROLE_KEY`. Checkout är blobless och sparse; inga GitHub-original hämtas.
4. Intaget kontrollerar Inbox-medlemskap, MIME, fullständiga bytes, PNG-dekodning, profil, alfa och SHA-256. PNG stannar i minnet. Befintlig `hermes2_prepare.py` skapar WebP och metadata i `RUNNER_TEMP` utanför checkout.
5. `hermes2_publish.ts` läser endast WebP/metadata, laddar upp utan overwrite till befintlig display-bucket och verifierar SHA-256 genom Storage-download och publik eller signerad URL. Endast uttryckligt `mode=publish` får aktivera avsett fält med compare-and-set och DB-återläsning. Fel lämnar tidigare bildpekare kvar.
6. `ACTIVE` kräver verifierad fil, avsett DB-fält och jobbstatus. Jobbets `source_path` är `drive://<file-id>`, inte en Supabase-originalfil. `github_blob_sha` är null för nya Drive-jobb; commit/run-ID anger exekverad kod. Historiska jobb och deras ursprung skrivs inte om.

```json
{
  "schema": 1,
  "kind": "symbol",
  "target_key": "stopp",
  "drive_file_id": "<verifierat Drive-ID>",
  "source_sha256": "<verifierad SHA-256, 64 hextecken>",
  "mode": "pilot"
}
```

`verify` hämtar och validerar utan publicering. `pilot` publicerar bara optimerad WebP under `hermes/minotaurus-pilot/<kind>/<key>/<hash>.webp`, verifierar återläsning och oförändrad målpost, och skriver inga jobb eller aktiva DB-pekare. `publish` aktiverar endast det uttryckliga kömålet. Publicering kräver källhash; äldre köfiler utan hash får inte återspelas som publicering.

En batch är flera explicita köfiler i samma push; varje fil får egen temporär output. Fel för ett mål hindrar inte övriga oberoende mål, men hela körningen blir röd om något misslyckas. Saknad push-föregångare stoppar intaget; hela den historiska kön behandlas aldrig som fallback.

## Befintliga profiler och fält

| Kind | Mål | Fält | Display-bucket |
|---|---|---|---|
| spell | rule_spells.spell_key | icon_path | alea-hermes-public |
| symbol | rule_magic_symbols.symbol_key | icon_path | alea-hermes-public |
| skill | rule_skills.id (bindestreck → understreck) | icon_path | alea-hermes-public |
| skill-illustration | rule_skills.id | illustration_path | alea-skill-art |
| skill-illustration-wide | rule_skills.id | illustration_wide_path | alea-skill-art |
| spell-illustration | rule_spells.spell_key | illustration_path | alea-spell-art |
| spell-illustration-wide | rule_spells.spell_key | illustration_wide_path | alea-spell-art |
| spell-cutout | rule_spells.spell_key | cutout_path | alea-spell-art |

Befintliga dimensioner, transparenskrav och privata respektive publika buckets återanvänds. Ikoner och cutouts är 640×640 WebP; illustrationer behåller sin etablerade profil. Skill WIDE är nära 16:9, spell WIDE tillåter 1,25–2,4. Cutouts ersätter inte annan befintlig cutout. Inga regler, RLS-policys eller andra bildfält ändras som bieffekt.

## Stängda äldre vägar

- `hermes21-intake.yml`: PNG-push/dispatch från GitHub stängd; originalraderingen utlöser ingen publicering.
- `hermes-ui-intake.yml`, legacy-reference och Gallery Kit-preview: stängda. Befintliga statiska UI-WebP och manifest behålls. Ny UI-publicering behöver en separat granskad Drive-migrering; den körs inte via ikonpubliceraren.
- `hermes-v2`: originalupload, import och retry svarar 410 efter befintlig adminautentisering. Historikläsning och explicit rollback av äldre spell/symbol-ikoner behålls. Inga original skrivs eller hämtas.
- `minotaurus-guard.yml`: kontrollerar att original-/karantänträden är borta och att nya/ändrade PNG-filer inte återinförs.

Ingen automatisk Drive-radering, Storage-radering eller Git-historikändring ingår. Befintlig bild kan återställas endast genom avsett tidigare fältvärde; behåll publicerade WebP-filer.

## Leverans och återstående liveprov

Se [MINOTAURUS-rapporten](artemis/minotaurus/REPORT.md), mätprotokollet och pilotens verifierade källhash där. Live Storage-pilot och Actions-typkontroll ska verifieras innan PR:n behandlas som färdig för merge. Ingen automatisk merge.

## 9. HERMES VFX – animationshändelser

Administrationen har en egen vy **Animationer · HERMES**, med ett register i `public.combat_animation_cues`. Till varje händelse kopplas en valfri MP4/WebM på max 12 MB i Supabase Storage-bucket `alea-combat-animations` (publika videos; admin krävs för uppladdning eller byte). Vid uppladdning verifieras hämtning och videoformat före koppling.

Fält per händelse: `asset_path`, `enabled`, `speed`, `scale`, `opacity`, `offset_x`, `offset_y`, `blend_mode` (Screen, Lighten, Normal). `melee.attack` har **2,5×** som startvärde. Animationerna för attack, träff, miss, parering, fummel och avståndsattack är kopplade till stridens relevanta händelser. Magihändelser finns i registret för kommande integration.

Animationer är dekorativa och får inte styra spelregler eller blockera tärningsslag. Befintliga SVG-effekter är fallback; reducerad-rörelse-inställning respekteras. Bortkoppling raderar inte den ursprungliga videofilen.
