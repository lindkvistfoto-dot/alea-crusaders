# HERMES CORE – developer image publication

HERMES CORE is the single image publication path for **ChatGPT, Work and Codex**, using original files in Drive and one trusted publisher. HERMES ALEA remains independent for direct user uploads from ALEA Pages.

The shared [image contract](./contract.json) defines profile-specific source constraints, processing, output metadata, archive folders, Storage policy and approved target adapters. A new image category uses an existing profile or a new declarative profile attached to an approved adapter; it does not add another publisher or workflow.

## Safety contract

1. Preserve the exact original in the configured Drive Inbox and a separate configured archive folder; verify both files' folder membership and identical SHA-256 bytes.
2. Accept only schema 1/2 compatibility requests or schema 3 profile requests from the CORE queue. Profile IDs, adapter IDs and target IDs are validated against repository-owned rules.
3. Never accept queue-provided Storage buckets, paths, table names, columns, SQL, or arbitrary processing code.
4. Convert the exact source according to the selected profile, preserve its required alpha, dimensions, framing, metadata and byte budget, and store immutable SHA-addressed WebP output.
5. Use only the configured public or private bucket. Verify byte-for-byte Storage readback and public or signed URL readback as appropriate.
6. Activate only the selected existing target through its approved adapter, using compare-and-set protection where available. Preserve prior references and metadata, then read the target back.
7. Never delete Drive originals, previous Storage objects or historical records.

| Profile family | Adapter behavior | Readback |
| --- | --- | --- |
| Unrestricted system asset | `arcane_system_assets.asset_path` | Public Storage and registry |
| Spell, skill, symbol | Approved existing table and image column per profile | Public or signed Storage and selected column |
| Honor or relief | Existing honor reference to a registered system asset | Public Storage and reference |
| NPC portrait | Existing `global_npcs` image pointer plus merged `image_reference` metadata | Private bucket via signed URL and record |
| Equipment master art | Existing weapon, shield, armor-slot, projectile, or shop-item image pointer in public `alea-equipment-art` | Public Storage readback and pointer CAS; old UUID-addressed objects remain untouched |
| Campaign map | Existing `campaign_maps` row, `campaign_id`-scoped private path, `image_path`, `width`, and `height` | Private Storage readback and row readback; no map row is created or activated |
| Combat-scene background | Existing `campaign_combat_scenes` row, campaign-scoped private path, background pointer and dimensions | Private Storage readback and row readback; scene geometry and map selection are untouched |
| Hit-area figure | Existing `rule_hit_figure_images` pointer and private `alea-hit-figures` object | Signed Storage readback and pointer CAS; previous object is retained |
| Battle pose | Existing combatant/race pose row and public immutable cutout path | Publication status, activation, base, mounting and any ALEA staging claim are guarded and left unchanged |
| Campaign NPC/monster portrait | Existing campaign actor row and campaign-scoped private path | Campaign ownership path is read from the row; app signing remains in the existing portrait resolver |
| Campaign material/gallery/location image | Existing private material, gallery or location-asset row | Fixed bucket per profile; campaign scope, visibility, archive state and existing links are preserved |
| Round-background catalog | Existing catalog row and `round/{id}.webp` private path | Row ID and active state remain unchanged; no catalog row is created or activated |

Schema-3 app-image identifiers and all write destinations remain repository-owned. UUID-keyed profiles accept only UUID targets, slug-keyed profiles only slugs; campaign path segments are read from the selected existing row. The publisher derives a stable UUIDv8 filename from the output SHA-256 where an existing Storage path contract requires UUID filenames.

CORE publishes developer-supplied battle-pose bytes only to existing published rows or unclaimed draft rows. It refuses pending ALEA replacements and leaves `publication_status`, `is_active`, pose keys, base keys and mounting data unchanged. ALEA Pages uploads continue through the independent ALEA staging/worker lifecycle. Personal character portrait uploads remain ALEA-owned; CORE profiles target developer-managed campaign NPC/monster images.

Round-background publication requires an existing, unarchived, inactive catalog row. Active catalog entries are rejected. The fixed row-ID path is write-once (`upsert: false`); republishing different bytes to the same row safely fails, and CORE never changes `is_active`.

If a target is not covered by a safe adapter, stop that target and report the missing integration; do not fall back to an older publisher. Older workflows remain active until their replacement is verified and separately approved. This release candidate does not publish to LIVE. Any merge or LIVE publication requires separate approval.

The normal success evidence is the DEV Actions run matching the request commit, the emitted `HERMES_CORE_ACTIVE` record, the Storage hash/readback, and the selected target readback.
