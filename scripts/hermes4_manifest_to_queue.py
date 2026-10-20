#!/usr/bin/env python3
"""Translate the HERMES 4.0 five-cutout Drive manifest into native HERMES queue jobs.

This is a manifest adapter only. It never downloads or writes image bytes and it
does not publish. The generated requests are consumed by the existing
hermes-drive-intake workflow and MINOTAURUS publisher.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HASH = re.compile(r"^[a-f0-9]{64}$")
DRIVE_ID = re.compile(r"^[A-Za-z0-9_-]{10,160}$")
KEY = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAX_SOURCE = 8_388_608
MAX_WEBP = 500_000
EXPECTED_COUNT = 5


def build_requests(manifest: dict) -> dict[str, dict]:
    if not isinstance(manifest, dict):
        raise ValueError("MANIFEST_MUST_BE_OBJECT")
    contract = manifest.get("contract")
    if (manifest.get("project") != "Alea Crusaders"
            or manifest.get("schema_version") != "1.0"
            or not isinstance(contract, dict)
            or contract.get("derivative_format") != "WebP with alpha"
            or contract.get("github_media") != "none"
            or contract.get("active_references_changed") is not False):
        raise ValueError("UNSUPPORTED_HERMES4_MANIFEST")
    records = manifest.get("records")
    if not isinstance(records, list) or len(records) != EXPECTED_COUNT:
        raise ValueError("EXPECTED_EXACTLY_FIVE_CUTOUTS")

    result: dict[str, dict] = {}
    seen_ids: set[str] = set()
    seen_keys: set[str] = set()
    for item in records:
        if not isinstance(item, dict):
            raise ValueError("INVALID_RECORD")
        key = item.get("spell_key")
        file_id = item.get("source_drive_inbox_id")
        sha = item.get("source_sha256")
        if (item.get("image_type") != "spell-cutout" or not isinstance(key, str)
                or not KEY.fullmatch(key) or not isinstance(file_id, str)
                or not DRIVE_ID.fullmatch(file_id) or not isinstance(sha, str)
                or not HASH.fullmatch(sha)):
            raise ValueError("INVALID_CUTOUT_SOURCE")
        if key in seen_keys or file_id in seen_ids:
            raise ValueError("DUPLICATE_CUTOUT_TARGET_OR_SOURCE")
        seen_keys.add(key)
        seen_ids.add(file_id)
        if (not isinstance(item.get("source_bytes"), int)
                or not 100 <= item["source_bytes"] <= MAX_SOURCE
                or item.get("alpha_channel_verified") is not True):
            raise ValueError("SOURCE_NOT_HERMES_READY")
        dimensions = item.get("dimensions")
        if dimensions != {"width": 1024, "height": 1024}:
            raise ValueError("CUTOUT_DIMENSIONS_NOT_SUPPORTED")
        if (item.get("storage_uploaded") is not False
                or item.get("active_cutout_reference_changed") is not False
                or item.get("quality_status") != "validated_and_drive_staged_pending_supabase"):
            raise ValueError("MANIFEST_NOT_IN_UNPUBLISHED_STAGED_STATE")
        if (not HASH.fullmatch(item.get("derivative_sha256", ""))
                or not isinstance(item.get("derivative_bytes"), int)
                or not 1 <= item["derivative_bytes"] <= MAX_WEBP
                or item.get("mime_type") != "image/webp"):
            raise ValueError("DERIVATIVE_NOT_HERMES_READY")
        queue_name = f"hermes/queue/cutout-pilot-{key}-{sha[:12]}.json"
        result[queue_name] = {
            "schema": 1,
            "kind": "spell-cutout",
            "target_key": key,
            "drive_file_id": file_id,
            "source_sha256": sha,
            "mode": "pilot",
        }
    return result


def write_requests(manifest_path: Path, output_root: Path) -> list[Path]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    requests = build_requests(manifest)
    written = []
    for relative, request in requests.items():
        target = output_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
        written.append(target)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="read-only HERMES 4.0 manifest JSON")
    parser.add_argument("--output", type=Path, required=True, help="queue output root")
    args = parser.parse_args()
    paths = write_requests(args.manifest, args.output)
    print(f"HERMES_QUEUE_REQUESTS_READY {len(paths)} mode=pilot")
    for path in paths:
        print(path.as_posix())


if __name__ == "__main__":
    main()
