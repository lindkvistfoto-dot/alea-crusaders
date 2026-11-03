#!/usr/bin/env python3
"""Reproduce the five-file protocol using tiny synthetic PNGs, with sockets blocked.

Only the plan's category/variant and metadata identifiers are reused. Real image
bytes are never copied by this runner. All image writes are in a temporary local
sandbox; its two stores never constitute independent production backup evidence.
"""
import argparse
import io
import json
from pathlib import Path
import socket
import tempfile
from unittest.mock import patch

from PIL import Image

import kerberos_archive as k


def run(plan):
    if plan.get("mode") != "planning_only" or len(plan.get("originals", [])) != 5:
        raise k.Blocked("EXPECTED_FIVE_FILE_PLANNING_MANIFEST")
    results = []
    with tempfile.TemporaryDirectory(prefix="kerberos-five-file-synthetic-") as directory, patch.object(
            socket.socket, "connect", side_effect=AssertionError("NETWORK_FORBIDDEN")):
        root = Path(directory)
        for index, original in enumerate(plan["originals"], 1):
            mode = original["color_mode"]
            color = (index * 23, 70, 110, 128) if mode == "RGBA" else (index * 23, 70, 110)
            stream = io.BytesIO()
            Image.new(mode, (8, 6), color).save(stream, "PNG")
            raw = stream.getvalue()
            source = root / f"source-{index}.png"
            with source.open("xb") as output:
                output.write(raw)
            descriptor = {"sha256": k.digest(raw), "size_bytes": len(raw),
                          "version_id": "synthetic-sha256:" + k.digest(raw)}
            sandbox_root = root / f"sandbox-{index}"
            sandbox_root.mkdir()
            k.create_json(sandbox_root / ".kerberos-simulation.json",
                          {"simulation": True, "capability": "synthetic-pilot-only"})
            sandbox = k.Sandbox(sandbox_root, "synthetic-pilot-only")
            first = k.simulate(source, descriptor, sandbox)
            repeat = k.simulate(source, descriptor, sandbox)
            destination = root / f"synthetic-backup-{index}"
            destination.mkdir()
            k.create_json(destination / ".kerberos-backup-destination.json", {
                "provider": "offline_encrypted", "account": "synthetic-local-test-only",
                "location": "temporary-local-directory", "custodian": "synthetic-test",
                "provisioning_evidence": "NOT_A_PROVISIONED_PRODUCTION_BACKUP"})
            before = list(destination.iterdir())
            dry_run = k.export_backup(source, descriptor, destination)
            dry_run_no_writes = list(destination.iterdir()) == before
            exported = k.export_backup(source, descriptor, destination, enable_write=True)
            negative = {"corrupt_png_rejected": k.verify_png(raw[:-12], k.digest(raw), len(raw))["status"] == "corrupt",
                        "wrong_sha_rejected": k.verify_png(raw, "0" * 64, len(raw))["status"] == "identity_mismatch"}
            try:
                k.read_supabase(None, "synthetic/a.png", k.digest(raw), len(raw))
            except k.Blocked as error:
                negative["missing_auth_rejected_without_network"] = str(error) == "AUTHENTICATION_REQUIRED"
            try:
                sandbox.put(f"archive/{k.digest(raw)}.png", b"conflicting-content")
            except k.Blocked as error:
                negative["overwrite_rejected"] = str(error) == "IMMUTABLE_IDENTITY_CONFLICT"
            checks = {"source_verified": first["source"]["status"] == "verified_complete",
                      "archive_readback_verified": first["archive"]["status"] == "verified_complete",
                      "export_verified": exported["export_verified"],
                      "restore_equal_original": exported["restore_verified"],
                      "idempotent_archive": repeat["archive"]["write"] == "already_present",
                      "idempotent_backup": repeat["backup"]["write"] == "already_present",
                      "dry_run_no_writes": dry_run["dry_run"] and dry_run_no_writes,
                      "source_unchanged": source.read_bytes() == raw, **negative}
            if not all(checks.values()):
                raise k.Blocked("SYNTHETIC_PILOT_CHECK_FAILED")
            results.append({"pilot_id": original["pilot_id"], "planned_asset": original["asset_key"],
                            "simulation": True, "synthetic_sha256": k.digest(raw),
                            "synthetic_size_bytes": len(raw), "synthetic_dimensions": "8x6",
                            "checks": checks, "independent_production_backup_proven": False,
                            "production_archive_verified": False, "safe_to_delete": False})
    return {"schema": "kerberos-five-file-simulation/v1", "simulation": True,
            "network_allowed": False, "originals_count": len(results),
            "all_checks_passed": True, "production_archive_copies": 0,
            "independent_production_backups": 0, "safe_to_delete": False, "results": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        k.create_json(args.output, run(k.load_json(args.plan)))
        print("KERBEROS_SYNTHETIC_PILOT_OK:5_FILES;PRODUCTION_COPIES:0")
    except k.Blocked as error:
        parser.exit(2, f"KERBEROS_BLOCKED:{error}\n")
    except Exception:
        parser.exit(2, "KERBEROS_BLOCKED:INVALID_INPUT_OR_IO\n")


if __name__ == "__main__":
    main()
