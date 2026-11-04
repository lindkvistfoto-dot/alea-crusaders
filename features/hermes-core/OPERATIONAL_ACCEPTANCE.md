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

If a target is not covered by a safe adapter, stop that target and report the missing integration; do not fall back to an older publisher. Older workflows remain active until their replacement is verified and separately approved. No LIVE workflow or deployment is part of this DEV change.

The normal success evidence is the DEV Actions run matching the request commit, the emitted `HERMES_CORE_ACTIVE` record, the Storage hash/readback, and the selected target readback.
