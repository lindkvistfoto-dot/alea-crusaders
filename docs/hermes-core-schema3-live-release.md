# HERMES CORE schema 3 — isolated LIVE release

Status: release candidate only. This PR does not deploy, merge, change credentials, alter LIVE, or deactivate any publisher.

## Candidate scope

Based on the verified DEV starting commit a07ba9c09ef4142f20a8fa0b15e9dcdb87889871, now advanced by merged PR #610 to bab7e581139cf73bbc143daf60dd1ecf3577a34a, and LIVE e606e4bfccba02f4164535475fb859412e6c3aae. The branches remain significantly diverged; this candidate is based on current main and ports only the HERMES files in this PR. It excludes gameplay code, OLYMPIA application code, DEV queue requests, and unrelated migrations.

The candidate adds schema-3 profiles/adapters while retaining schema 1/2 compatibility; fixes the LIVE workflow checkout and write permissions needed by the publisher; pins the LIVE endpoint and branch/environment guard; keeps Drive read-only through existing Google Workload Identity; and preserves the independent ALEA direct-upload path. It adds an opt-in read-only credential check, which is not run by this PR.

## LIVE metadata and permissions

Read-only privilege snapshot of LIVE project wbmosmkirsitkonejzpg on 2026-11-05 confirmed all 15 target tables and the declared columns exist. Relevant public/private bucket flags match the DEV profile declarations. Supabase reports service_role with BYPASSRLS; no RLS or policy change is proposed.

### Effective privilege baseline (before any proposed grant)

For each of these 15 tables — rule_weapons, rule_shields, rule_armor_types, rule_shop_items, rule_projectile_types, campaign_maps, campaign_combat_scenes, rule_hit_figure_images, race_battle_poses, campaign_npcs, campaign_monsters, campaign_materials, campaign_images, campaign_location_assets, and rule_combat_round_backgrounds — read-only has_*_privilege checks returned:

| Effective table privilege | Before |
|---|---:|
| SELECT | No |
| INSERT | No |
| UPDATE | No |
| DELETE | No |
| REFERENCES | Yes |
| TRIGGER | Yes |
| TRUNCATE | Yes |
| MAINTAIN | Yes |

The existing REFERENCES, TRIGGER, TRUNCATE, and MAINTAIN ACL entries are granted directly to service_role by postgres and are not grantable. They predate this release and the candidate does not change them. The recursive role-membership check found no parent roles whose privileges service_role inherits. Effective checks also found no PUBLIC or inherited SELECT/INSERT/UPDATE/DELETE access to these tables. On every column in these tables, the only effective column privilege found before the proposal was REFERENCES. In particular, SELECT and UPDATE were false for every column in the proposed lists below.

The proposed statements add only column-level SELECT on the lookup, path, and guard columns CORE reads, and column-level UPDATE on the image pointer and explicitly declared image metadata it writes. Expected after-state: those listed column privileges become true; table-level SELECT/INSERT/UPDATE/DELETE remain false; all existing REFERENCES/TRIGGER/TRUNCATE/MAINTAIN privileges remain unchanged; and no INSERT, DELETE, sequence, RLS, or policy permission is added.

The existing arcane_system_assets adapter is a separate exception and needs no new grant: LIVE already has table-level SELECT; column SELECT on asset_key and asset_path; column UPDATE on asset_path; and column INSERT on id, asset_key, and label. It has no table-level INSERT or UPDATE. No sequence privilege is needed because app-image target rows must already exist and the registry’s narrow column INSERT privileges suffice.

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

This is a conditional rollback, not a standalone REVOKE script. Immediately before applying the grants, save a read-only snapshot of table ACLs, column ACLs for the listed fields, effective has_*_privilege results, and the service_role membership graph with the release approval record. Save the same snapshot immediately after applying them. The current baseline above records that each proposed SELECT/UPDATE privilege was effectively absent before release and that table-level DML was absent on all 15 target tables.

Run the statements only if a fresh pre-rollback snapshot matches the expected post-release snapshot: exactly the listed column SELECT/UPDATE grants are present, no table-level privileges or role memberships changed, and there are no other grantors or consumers relying on those new rights. If any ACL, membership, or dependency differs, abort rollback and review the delta; do not run a broad REVOKE. The REVOKE statements below target only the exact columns granted above, leaving pre-existing table and unrelated column privileges untouched.

PostgreSQL ACL entries do not carry a release identifier. If later activity adds the same privilege to the same role/column, particularly under the same grantor, provenance cannot be reliably distinguished. In that case the snapshot/dependency precondition fails and the grant is blocked from automatic rollback; preserve the right until an operator resolves the dependency.

```sql
BEGIN;
-- rule_weapons: weapon-art
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_weapons FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.rule_weapons FROM service_role;

-- rule_shields: shield-art
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_shields FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.rule_shields FROM service_role;

-- rule_armor_types: armor-art, armor-head-art, armor-arms-art, armor-torso-art, armor-legs-art
REVOKE SELECT ("id", "image_path", "image_head_path", "image_arms_path", "image_torso_path", "image_legs_path") ON TABLE public.rule_armor_types FROM service_role;
REVOKE UPDATE ("image_path", "image_head_path", "image_arms_path", "image_torso_path", "image_legs_path") ON TABLE public.rule_armor_types FROM service_role;

-- rule_shop_items: shop-item-art
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_shop_items FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.rule_shop_items FROM service_role;

-- rule_projectile_types: projectile-art
REVOKE SELECT ("projectile_key", "image_path") ON TABLE public.rule_projectile_types FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.rule_projectile_types FROM service_role;

-- campaign_maps: campaign-map
REVOKE SELECT ("id", "campaign_id", "image_path", "width", "height") ON TABLE public.campaign_maps FROM service_role;
REVOKE UPDATE ("image_path", "width", "height") ON TABLE public.campaign_maps FROM service_role;

-- campaign_combat_scenes: combat-scene-background
REVOKE SELECT ("id", "campaign_id", "background_image_path", "background_width", "background_height") ON TABLE public.campaign_combat_scenes FROM service_role;
REVOKE UPDATE ("background_image_path", "background_width", "background_height") ON TABLE public.campaign_combat_scenes FROM service_role;

-- rule_hit_figure_images: hit-figure
REVOKE SELECT ("id", "image_path") ON TABLE public.rule_hit_figure_images FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.rule_hit_figure_images FROM service_role;

-- race_battle_poses: race-pose-published, race-pose-draft
REVOKE SELECT ("id", "image_path", "base_key", "mounting_profile", "is_active", "publication_status", "staging_path", "pending_staging_path", "pending_base_key", "pending_mounting_profile", "source_sha256", "source_drive_file_id") ON TABLE public.race_battle_poses FROM service_role;
REVOKE UPDATE ("image_path", "source_sha256", "source_drive_file_id") ON TABLE public.race_battle_poses FROM service_role;

-- campaign_npcs: campaign-npc-portrait
REVOKE SELECT ("id", "campaign_id", "image_path") ON TABLE public.campaign_npcs FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.campaign_npcs FROM service_role;

-- campaign_monsters: campaign-monster-portrait
REVOKE SELECT ("id", "campaign_id", "image_path") ON TABLE public.campaign_monsters FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.campaign_monsters FROM service_role;

-- campaign_materials: campaign-material-image
REVOKE SELECT ("id", "campaign_id", "storage_path", "storage_bucket", "asset_kind", "mime_type", "file_size_bytes", "sha256", "archived_at", "thumbnail_path") ON TABLE public.campaign_materials FROM service_role;
REVOKE UPDATE ("storage_path", "mime_type", "file_size_bytes", "sha256") ON TABLE public.campaign_materials FROM service_role;

-- campaign_images: campaign-gallery-image
REVOKE SELECT ("id", "campaign_id", "storage_path", "storage_bucket", "mime_type") ON TABLE public.campaign_images FROM service_role;
REVOKE UPDATE ("storage_path", "mime_type") ON TABLE public.campaign_images FROM service_role;

-- campaign_location_assets: campaign-location-asset
REVOKE SELECT ("id", "campaign_id", "location_id", "asset_type", "asset_kind", "storage_path", "player_visible") ON TABLE public.campaign_location_assets FROM service_role;
REVOKE UPDATE ("storage_path") ON TABLE public.campaign_location_assets FROM service_role;

-- rule_combat_round_backgrounds: round-background-catalog
REVOKE SELECT ("id", "image_path", "is_active", "archived_at") ON TABLE public.rule_combat_round_backgrounds FROM service_role;
REVOKE UPDATE ("image_path") ON TABLE public.rule_combat_round_backgrounds FROM service_role;
COMMIT;
```

No broad table grants, RLS policy changes, or sequence grants are proposed. After an approved grant or rollback, refresh PostgREST’s schema/privilege cache if required by the deployment process, then recheck privileges read-only.

## Credential verification

The LIVE workflow refers to the existing secret HERMES_SUPABASE_SERVICE_ROLE_KEY; DEV uses a separate secret. Secret values are never read into this PR or printed. The PR adds a manual workflow_dispatch input that runs only a GET against the fixed LIVE project’s registry endpoint, masks the key, and reports HTTP success/failure. The publish job remains push-only and cannot run from the validation dispatch.

The GitHub connector cannot inspect the stored secret or prove its project binding. After OLYMPIA review, Zeus must separately approve and manually start this read-only check on main with verify_live_credential=true. A successful HTTP 200 means the stored key is accepted by the fixed LIVE project’s read-only registry endpoint. No new secret is required unless this check fails.

## HERMES 4.1 source and ownership

The arcane-paper-doll-workshop.js client uploads through the authenticated ALEA Pages session to alea-battle-pose-staging and creates hermes_web_jobs; the scheduled worker then archives and publishes pose files. This is Pages-originated, so under the accepted upload-source rule it belongs to HERMES ALEA, not CORE. Current ALEA target RPCs allow honor definitions and relief variants; no ALEA battle-pose target is verified. The existing 4.1 publisher must therefore remain until ALEA coverage is separately implemented and verified. This CORE candidate does not change or disable it.

PR #610 is merged to DEV. This candidate carries PR #610’s narrow runtime cleanup: the 5-minute worker no longer checks out tests or runs py_compile and the offline unittest suite. It also removes the workflow-file self-trigger so merging this configuration does not immediately start the LIVE worker. Scheduled/manual delivery and worker-code-change triggers remain. Tests stay in the existing PR test workflow. The 4.1 publisher itself remains active.

## Release and rollback sequence

1. OLYMPIA reviews this isolated PR against main; no automatic merge.
2. Separately approve and apply the column grants above, then verify them read-only. Do not merge/publish CORE before this is complete.
3. Run the prepared read-only credential validation after Zeus approval.
4. After separate LIVE approval, merge/deploy the candidate and run one isolated LIVE publication to a pre-created inactive test target; verify public/signed readback, resolver, hashes, and target fields.
5. Keep old publishers and historical data. If the pilot fails, stop new CORE queue submissions, revert the release commit, and preserve Storage objects, Drive originals, queue records, and pointers. Restore any pointer only with compare-and-set to its recorded prior value.
6. Migrate and retire each old publisher only after source ownership, pending jobs, rollback path, and replacement are verified; each deactivation needs separate approval.

No LIVE publication, grant, merge, credential edit, job retry, or workflow deactivation is included in this candidate.