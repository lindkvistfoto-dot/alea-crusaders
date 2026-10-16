#!/usr/bin/env python3
"""Offline acceptance fixture for the already public, immutable ARCANE v0.1 archive.
Does NOT authenticate with Drive, approve rights or publish to the live site.
"""
from __future__ import annotations
import hashlib
import json
import sys
import tempfile
from pathlib import Path

from scripts.hermes3_drive_verify import ROOT, check, check_sprite_zip
from scripts.hermes3_stage import stage_assets

ARCANE_SHA = "4878fe146bcaaf301e535b34fc9402ecaa5eff33e9caa0adfb2910984c314178"
ARCHIVE = ROOT / "assets/hermes/originals/ui/arcane-gallery-kit" / (ARCANE_SHA + ".zip")
REQUEST = ROOT / "hermes3/requests/arcane-gallery-kit-v01.json"

def verify_archive_fixture(output):
    payload = ARCHIVE.read_bytes()
    check(hashlib.sha256(payload).hexdigest() == ARCANE_SHA, "FIXTURE_SHA_MISMATCH")
    job = json.loads(REQUEST.read_text("utf8"))
    check(job["source"]["sha256"] == ARCANE_SHA and job["profile"] == "ui-sprite-package"
          and job["intent"] == "verify-only", "FIXTURE_JOB_MISMATCH")
    registry = json.loads((ROOT / "config/hermes3-profiles.json").read_text("utf8"))
    with tempfile.TemporaryDirectory() as scratch:
        verified = Path(scratch)
        (verified / "verified-source.zip").write_bytes(payload)
        (verified / "verification.json").write_text(json.dumps({
            "schema": 3, "status": "verified-only", "job_id": job["job_id"],
            "profile": job["profile"], "source_sha256": ARCANE_SHA,
            "source_bytes": len(payload), "mime_type": "application/zip",
            "artifact_filename": "verified-source.zip",
            "package": check_sprite_zip(payload),
            "production_published": False, "database_activated": False,
            "verification_origin": "offline-public-archive-fixture"
        }), encoding="utf8")
        manifest = stage_assets(job, verified, output, registry)
        check(len(manifest["assets"]) == 29, "FIXTURE_EXPECTED_29_SPRITES")
        check(all(a["alpha_preserved"] for a in manifest["assets"].values()),
              "FIXTURE_ALPHA_NOT_PRESERVED")
        (output / "fixture-provenance.json").write_text(json.dumps({
            "origin": "offline-archived-public-original", "source_sha256": ARCANE_SHA,
            "comparison": "source SHA and 29 lossless PNG alpha to WebP sprites",
            "drive_authentication_performed": False, "production_published": False
        }, indent=2) + "\n", encoding="utf8")
    print("HERMES3_ARCANE_OFFLINE_PILOT_OK", len(manifest["assets"]), ARCANE_SHA)

if __name__ == "__main__":
    check(len(sys.argv) == 2, "FIXTURE_ARGUMENTS")
    verify_archive_fixture(Path(sys.argv[1]))
