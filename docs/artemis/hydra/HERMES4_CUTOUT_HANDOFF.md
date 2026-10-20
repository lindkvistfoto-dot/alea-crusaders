# HYDRA: HERMES 4.0 five-cutout handoff

This adapter consumes the HERMES 4.0 Drive manifest and emits five ordinary
HERMES queue requests. It does not create a publisher, download image bytes,
upload files, change spell references, or store originals in GitHub/Supabase.

## Input contract

Use `HERMES4_CUTOUT_PILOT_manifest_20261020.json` from the Drive staging folder.
The manifest must contain exactly five unique `spell-cutout` records with the
Inbox PNG Drive IDs and source SHA-256 values. The adapter rejects an incomplete
manifest, an already-uploaded item, changed active references, missing alpha
verification, or output values outside the existing HERMES limits.

After merge, download the manifest locally and run from the repository root:

```sh
python scripts/hermes4_manifest_to_queue.py /path/to/HERMES4_CUTOUT_PILOT_manifest_20261020.json --output .
```

Review the five generated files under `hermes/queue/`. Each is an existing
HERMES schema-1 request pinned to one Inbox PNG, `kind=spell-cutout`, and
`mode=pilot`. Commit only these small JSON requests to `main` in one commit.
That push invokes the existing `.github/workflows/hermes-drive-intake.yml`;
no second dispatcher or publisher is introduced. The workflow downloads the
PNG through the existing read-only Drive identity, verifies its source hash,
and uses the existing `hermes2_prepare.py` conversion before calling
`hermes2_publish.ts`. Thus HERMES regenerates its canonical WebP from the
immutable PNG; the manifest's Drive-staged WebPs remain useful verified
previews/evidence, but their bytes are not copied into GitHub or used as
unverified publisher inputs.

## Pilot acceptance

The generated requests are deliberately `mode=pilot`. They upload only
immutable WebPs to the existing isolated MINOTAURUS pilot path and require
Storage plus delivery URL SHA-256 readback. They do not write job rows or alter
`rule_spells` pointers. All five Actions jobs must show
`HERMES_DIRECT_PILOT_VERIFIED`, unchanged pointers, and exact hashes before a
production publish is considered. Do not switch requests to `mode=publish`
under this handoff. No queue requests are included in this PR, so merge itself
cannot trigger a publication.

## Targeted verification

```sh
python -m unittest -v tests/test_minotaurus_hermes4_manifest.py
```

No image originals or binaries belong in this repository.
