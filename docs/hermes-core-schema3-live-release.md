# HERMES CORE schema 3 — isolated LIVE release

Status: release candidate only. This PR does not deploy, merge, change credentials, alter LIVE, or deactivate any publisher.

## Candidate scope

Based on DEV commit a07ba9c09ef4142f20a8fa0b15e9dcdb87889871 and LIVE e606e4bfccba02f4164535475fb859412e6c3aae. The branches diverge (270 ahead / 44 behind); this candidate is based on main and ports only the HERMES files in this PR. It excludes gameplay code, OLYMPIA application code, DEV queue requests, and unrelated migrations.

The candidate adds schema-3 profiles/adapters while retaining schema 1/2 compatibility; fixes the LIVE workflow checkout and write permissions needed by the publisher; pins the LIVE endpoint and branch/environment guard; keeps Drive read-only through existing Google Workload Identity; and preserves the independent ALEA direct-upload path. It adds an opt-in read-only credential check, which is not run by this PR.

## LIVE metadata and permissions

Read-only inspection found the destination tables, profile columns, and buckets in LIVE. Relevant public/private bucket flags match the DEV profile declarations. Supabase reports service_role with BYPASSRLS; existing RLS and policies remain unchanged. No sequence privilege is needed: app-image targets must already exist, and the system registry’s existing narrow INSERT grants cover id, asset_key, and label.

PostgREST authorizes table operations using database-role privileges and supports column-level grants. CORE selects each adapter’s lookup, pointer, metadata, path, and guard columns. Its compare-and-set PATCH writes only the selected image pointer and declared metadata columns, then selects the lookup and pointer for verification. The SQL below is the narrow set derived from the schema-3 contract and CAS adapter. It is not applied. Review it against the final candidate before separate Zeus approval. genui{"citation":{"ref":"turn5search3"}}

### Proposed grants (19 adapter models across 15 target tables; race poses use two profiles on one adapter)

```sql
BEGIN;
-- rule_weapons: weapon-art
GRANT SELECT ("id", "image_path") ON TABLE public.rule_weapons TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_weapons TO service_role;

-- rule_shields: shield-art
GRANT SELECT ("id", "image_path") ON TABLE public.rule_shields TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_shields TO service_role;

-- rule_armor_types: armor-art, armor-head-art, armor-arms-art, armor-torso-art, armor-legs-art
GRANT SELECT ("id", "image_path", "image_head_path", "image_arms_path", "image_torso_path", "image_legs_path") ON TABLE public.rule_armor_types TO service_role;
GRANT UPDATE ("image_path", "image_head_path", "image_arms_path", "image_torso_path", "image_legs_path") ON TABLE public.rule_armor_types TO service_role;

-- rule_shop_items: shop-item-art
GRANT SELECT ("id", "image_path") ON TABLE public.rule_shop_items TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_shop_items TO service_role;

-- rule_projectile_types: projectile-art
GRANT SELECT ("projectile_key", "image_path") ON TABLE public.rule_projectile_types TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_projectile_types TO service_role;

-- campaign_maps: campaign-map
GRANT SELECT ("id", "campaign_id", "image_path", "width", "height") ON TABLE public.campaign_maps TO service_role;
GRANT UPDATE ("image_path", "width", "height") ON TABLE public.campaign_maps TO service_role;

-- campaign_combat_scenes: combat-scene-background
GRANT SELECT ("id", "campaign_id", "background_image_path", "background_width", "background_height") ON TABLE public.campaign_combat_scenes TO service_role;
GRANT UPDATE ("background_image_path", "background_width", "background_height") ON TABLE public.campaign_combat_scenes TO service_role;

-- rule_hit_figure_images: hit-figure
GRANT SELECT ("id", "image_path") ON TABLE public.rule_hit_figure_images TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_hit_figure_images TO service_role;

-- race_battle_poses: race-pose-published, race-pose-draft
GRANT SELECT ("id", "image_path", "base_key", "mounting_profile", "is_active", "publication_status", "staging_path", "pending_staging_path", "pending_base_key", "pending_mounting_profile", "source_sha256", "source_drive_file_id") ON TABLE public.race_battle_poses TO service_role;
GRANT UPDATE ("image_path", "source_sha256", "source_drive_file_id") ON TABLE public.race_battle_poses TO service_role;

-- campaign_npcs: campaign-npc-portrait
GRANT SELECT ("id", "campaign_id", "image_path") ON TABLE public.campaign_npcs TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.campaign_npcs TO service_role;

-- campaign_monsters: campaign-monster-portrait
GRANT SELECT ("id", "campaign_id", "image_path") ON TABLE public.campaign_monsters TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.campaign_monsters TO service_role;

-- campaign_materials: campaign-material-image
GRANT SELECT ("id", "campaign_id", "storage_path", "storage_bucket", "asset_kind", "mime_type", "file_size_bytes", "sha256", "archived_at", "thumbnail_path") ON TABLE public.campaign_materials TO service_role;
GRANT UPDATE ("storage_path", "mime_type", "file_size_bytes", "sha256") ON TABLE public.campaign_materials TO service_role;

-- campaign_images: campaign-gallery-image
GRANT SELECT ("id", "campaign_id", "storage_path", "storage_bucket", "mime_type") ON TABLE public.campaign_images TO service_role;
GRANT UPDATE ("storage_path", "mime_type") ON TABLE public.campaign_images TO service_role;

-- campaign_location_assets: campaign-location-asset
GRANT SELECT ("id", "campaign_id", "location_id", "asset_type", "asset_kind", "storage_path", "player_visible") ON TABLE public.campaign_location_assets TO service_role;
GRANT UPDATE ("storage_path") ON TABLE public.campaign_location_assets TO service_role;

-- rule_combat_round_backgrounds: round-background-catalog
GRANT SELECT ("id", "image_path", "is_active", "archived_at") ON TABLE public.rule_combat_round_backgrounds TO service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_combat_round_backgrounds TO service_role;
COMMIT;
```

### Rollback

Run only if these exact grants were applied by the approved release and no later policy depends on them. The listed target columns lacked service_role grants at preflight.

```sql
BEGIN;
-- rule_weapons: weapon-art
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_weapons FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_weapons FROM service_role;

-- rule_shields: shield-art
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_shields FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_shields FROM service_role;

-- rule_armor_types: armor-art, armor-head-art, armor-arms-art, armor-torso-art, armor-legs-art
REVOKE SELECT ("id", "image_path", "image_head_path", "image_arms_path", "image_torso_path", "image_legs_path") ON TABLE public.rule_armor_types FROM service_role;
GRANT UPDATE ("image_path", "image_head_path", "image_arms_path", "image_torso_path", "image_legs_path") ON TABLE public.rule_armor_types FROM service_role;

-- rule_shop_items: shop-item-art
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_shop_items FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_shop_items FROM service_role;

-- rule_projectile_types: projectile-art
REVOKE SELECT ("projectile_key", "image_path") ON TABLE public.rule_projectile_types FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_projectile_types FROM service_role;

-- campaign_maps: campaign-map
REVOKE SELECT ("id", "campaign_id", "image_path", "width", "height") ON TABLE public.campaign_maps FROM service_role;
GRANT UPDATE ("image_path", "width", "height") ON TABLE public.campaign_maps FROM service_role;

-- campaign_combat_scenes: combat-scene-background
REVOKE SELECT ("id", "campaign_id", "background_image_path", "background_width", "background_height") ON TABLE public.campaign_combat_scenes FROM service_role;
GRANT UPDATE ("background_image_path", "background_width", "background_height") ON TABLE public.campaign_combat_scenes FROM service_role;

-- rule_hit_figure_images: hit-figure
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_hit_figure_images FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_hit_figure_images FROM service_role;

-- race_battle_poses: race-pose-published, race-pose-draft
REVOKE SELECT ("id", "image_path", "base_key", "mounting_profile", "is_active", "publication_status", "staging_path", "pending_staging_path", "pending_base_key", "pending_mounting_profile", "source_sha256", "source_drive_file_id") ON TABLE public.race_battle_poses FROM service_role;
GRANT UPDATE ("image_path", "source_sha256", "source_drive_file_id") ON TABLE public.race_battle_poses FROM service_role;

-- campaign_npcs: campaign-npc-portrait
REVOKE SELECT ("id", "campaign_id", "image_path") ON TABLE public.campaign_npcs FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.campaign_npcs FROM service_role;

-- campaign_monsters: campaign-monster-portrait
REVOKE SELECT ("id", "campaign_id", "image_path") ON TABLE public.campaign_monsters FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.campaign_monsters FROM service_role;

-- campaign_materials: campaign-material-image
REVOKE SELECT ("id", "campaign_id", "storage_path", "storage_bucket", "asset_kind", "mime_type", "file_size_bytes", "sha256", "archived_at", "thumbnail_path") ON TABLE public.campaign_materials FROM service_role;
GRANT UPDATE ("storage_path", "mime_type", "file_size_bytes", "sha256") ON TABLE public.campaign_materials FROM service_role;

-- campaign_images: campaign-gallery-image
REVOKE SELECT ("id", "campaign_id", "storage_path", "storage_bucket", "mime_type") ON TABLE public.campaign_images FROM service_role;
GRANT UPDATE ("storage_path", "mime_type") ON TABLE public.campaign_images FROM service_role;

-- campaign_location_assets: campaign-location-asset
REVOKE SELECT ("id", "campaign_id", "location_id", "asset_type", "asset_kind", "storage_path", "player_visible") ON TABLE public.campaign_location_assets FROM service_role;
GRANT UPDATE ("storage_path") ON TABLE public.campaign_location_assets FROM service_role;

-- rule_combat_round_backgrounds: round-background-catalog
REVOKE SELECT ("id", "image_path", "is_active", "archived_at") ON TABLE public.rule_combat_round_backgrounds FROM service_role;
GRANT UPDATE ("image_path") ON TABLE public.rule_combat_round_backgrounds FROM service_role;
COMMIT;
```

No broad table grants, RLS policy changes, or sequence grants are proposed. After an approved grant or rollback, refresh PostgREST’s schema/privilege cache if required by the deployment process, then recheck privileges read-only.

## Credential verification

The LIVE workflow refers to the existing secret HERMES_SUPABASE_SERVICE_ROLE_KEY; DEV uses a separate secret. Secret values are never read into this PR or printed. The PR adds a manual workflow_dispatch input that runs only a GET against the fixed LIVE project’s registry endpoint, masks the key, and reports HTTP success/failure. The publish job remains push-only and cannot run from the validation dispatch.

The GitHub connector cannot inspect the stored secret or prove its project binding. After OLYMPIA review, Zeus must separately approve and manually start this read-only check on main with verify_live_credential=true. A successful HTTP 200 means the stored key is accepted by the fixed LIVE project’s read-only registry endpoint. No new secret is required unless this check fails.

## HERMES 4.1 source and ownership

The arcane-paper-doll-workshop.js client uploads through the authenticated ALEA Pages session to alea-battle-pose-staging and creates hermes_web_jobs; the scheduled worker then archives and publishes pose files. This is Pages-originated, so under the accepted upload-source rule it belongs to HERMES ALEA, not CORE. Current ALEA target RPCs allow honor definitions and relief variants; no ALEA battle-pose target is verified. The existing 4.1 publisher must therefore remain until ALEA coverage is separately implemented and verified. This CORE candidate does not change or disable it.

PR #610 is merged to DEV. This candidate carries its narrow runtime cleanup: the 5-minute worker no longer checks out tests or runs py_compile and the offline unittest suite; publication, scheduling, credential checks, and runtime prerequisites remain. Tests stay in the existing PR test workflow. The 4.1 publisher itself remains active.

## Release and rollback sequence

1. OLYMPIA reviews this isolated PR against main; no automatic merge.
2. Separately approve and apply the column grants above, then verify them read-only. Do not merge/publish CORE before this is complete.
3. Run the prepared read-only credential validation after Zeus approval.
4. After separate LIVE approval, merge/deploy the candidate and run one isolated LIVE publication to a pre-created inactive test target; verify public/signed readback, resolver, hashes, and target fields.
5. Keep old publishers and historical data. If the pilot fails, stop new CORE queue submissions, revert the release commit, and preserve Storage objects, Drive originals, queue records, and pointers. Restore any pointer only with compare-and-set to its recorded prior value.
6. Migrate and retire each old publisher only after source ownership, pending jobs, rollback path, and replacement are verified; each deactivation needs separate approval.

No LIVE publication, grant, merge, credential edit, job retry, or workflow deactivation is included in this candidate.