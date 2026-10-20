#!/usr/bin/env python3
"""Offline MEDUSA evidence supplement. No HTTP, Storage SDK, credentials or publisher.

Reads existing Git objects and MEDUSA's byte-verified Drive records. Private
Storage bytes remain unverified: SQL/job hashes are never substituted for them.
Only explicitly requested report files are written. Missing Git objects fail
locally (GIT_NO_LAZY_FETCH); this tool never downloads or modifies originals.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import struct
import subprocess
from datetime import datetime, timezone
import warnings
import zipfile
import zlib

from PIL import Image, ImageFile

FIELDS = (
    "asset_kind target_key drive_file_id drive_sha256 github_path github_blob_sha "
    "github_content_sha256 supabase_bucket supabase_object_path "
    "supabase_content_sha256 source_bytes verification_status integrity_result "
    "discrepancy recommended_action"
).split()
GIT_ENV = {**os.environ, "GIT_NO_LAZY_FETCH": "1", "GIT_OPTIONAL_LOCKS": "0"}


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], env=GIT_ENV,
                                   stderr=subprocess.DEVNULL)


def png_structure(data):
    """Require every complete chunk/CRC and a terminal IEND, including the tail."""
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("PNG_SIGNATURE")
    pos = 8
    while pos < len(data):
        if pos + 12 > len(data):
            raise ValueError("PNG_TRUNCATED_CHUNK")
        size = struct.unpack_from(">I", data, pos)[0]
        end = pos + 12 + size
        if end > len(data):
            raise ValueError("PNG_TRUNCATED_PAYLOAD")
        kind = data[pos + 4:pos + 8]
        expected = struct.unpack_from(">I", data, end - 4)[0]
        if zlib.crc32(data[pos + 4:end - 4]) & 0xffffffff != expected:
            raise ValueError("PNG_CRC")
        if kind == b"IEND":
            if size or end != len(data):
                raise ValueError("PNG_TRAILING_BYTES_OR_INVALID_IEND")
            return
        pos = end
    raise ValueError("PNG_MISSING_IEND")


def inspect_bytes(data, expected_sha=None, expected_size=None, require_png=False):
    digest = hashlib.sha256(data).hexdigest()
    result = {"bytes_read": len(data), "content_sha256": digest,
              "size_matches": None if expected_size is None else len(data) == expected_size,
              "hash_matches": None if expected_sha is None else digest == expected_sha}
    try:
        if require_png or data.startswith(b"\x89PNG\r\n\x1a\n"):
            png_structure(data)
        if data.startswith(b"PK\x03\x04") and not require_png:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if archive.testzip() is not None:
                    raise ValueError("ZIP_CRC")
                members = []
                for entry in archive.infolist():
                    if entry.filename.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
                        check = inspect_bytes(archive.read(entry), expected_size=entry.file_size,
                                              require_png=entry.filename.lower().endswith(".png"))
                        members.append({"member": entry.filename, **check})
                        if check["integrity_result"] != "valid":
                            raise ValueError("ZIP_IMAGE_DECODE")
                result.update(format="ZIP", image_members=members)
        else:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as image:
                    result.update(format=image.format, width=image.width, height=image.height,
                                  color_mode=image.mode)
                    image.verify()
                with Image.open(io.BytesIO(data)) as image:
                    for frame in range(getattr(image, "n_frames", 1)):
                        image.seek(frame)
                        image.load()
        result["integrity_result"] = "valid"
    except (ValueError, OSError, SyntaxError, EOFError, Image.DecompressionBombWarning,
            Image.DecompressionBombError, zipfile.BadZipFile, RuntimeError) as error:
        result["integrity_result"] = "corrupt_original"
        # Exception messages may include caller-supplied data; record only type.
        result["decode_error_type"] = type(error).__name__
    if result["integrity_result"] != "valid":
        result["verification_status"] = "corrupt_original"
    elif result["hash_matches"] is False or result["size_matches"] is False:
        result["verification_status"] = "different_valid_version"
    elif expected_sha is not None:
        result["verification_status"] = "verified_identical_copy"
    else:
        result["verification_status"] = "valid_bytes_identity_unverified"
    return result


def read_git_blob(repo, oid, object_format):
    if not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", oid):
        raise ValueError("INVALID_GIT_OBJECT_ID")
    try:
        raw = git(repo, "cat-file", "blob", oid)
    except subprocess.CalledProcessError:
        return None
    header = f"blob {len(raw)}\0".encode()
    if hashlib.new(object_format, header + raw).hexdigest() != oid:
        raise ValueError("GIT_OBJECT_ID_MISMATCH")
    return raw


def verified_drive_index(manifest):
    by_hash = {}
    for row in manifest["drive_records"]:
        digest = row.get("sha256_actual")
        if (row.get("bytes_read") is True and digest
                and row.get("integrity") in ("verified_image_decode", "verified_zip")):
            by_hash.setdefault(digest, []).append(row)
    return by_hash


def source_rows(manifest, snapshot, github, observed_at):
    live = {row["object_path"]: row for row in snapshot["rows"]}
    originals = {row["path"]: row for row in manifest["supabase_source_objects"]}
    if len(live) != len(snapshot["rows"]) or set(live) != set(originals):
        raise ValueError("SOURCE_METADATA_SET_CHANGED_OR_DUPLICATED")
    drive = verified_drive_index(manifest)
    result = []
    for path, obj in sorted(originals.items()):
        current = live[path]
        recorded = current.get("recorded_sha256")
        matches = [r for r in drive.get(recorded, [])
                   if r["size_bytes"] == current["recorded_bytes"]]
        # Prefer canonical original path, but also find legacy source originals.
        candidates = [r for r in github if r.get("content_sha256") == recorded
                      and r.get("integrity_result") == "valid"]
        candidates.sort(key=lambda r: (not r["github_path"].startswith("assets/hermes/originals/"),
                                       r["github_path"]))
        g = candidates[0] if candidates else {}
        drift = []
        for old, new in ((obj["size_bytes"], current["storage_metadata_bytes"]),
                         (obj.get("hermes_recorded_sha256"), recorded),
                         (obj["size_bytes"], current["recorded_bytes"])):
            if old != new:
                drift.append("metadata_or_job_identity_changed")
        if not matches:
            drift.append("no_verified_Drive_counterpart_for_recorded_identity")
        row = {field: None for field in FIELDS}
        row.update(asset_kind=current.get("kind") or path.split("/")[0],
                   target_key=current.get("target_key") or path.split("/")[1],
                   drive_file_id=matches[0]["drive_file_id"] if matches else None,
                   drive_sha256=matches[0]["sha256_actual"] if matches else None,
                   github_path=g.get("github_path"), github_blob_sha=g.get("github_blob_sha"),
                   github_content_sha256=g.get("content_sha256"),
                   supabase_bucket="alea-hermes-source", supabase_object_path=path,
                   verification_status="not_verified",
                   integrity_result="not_verified_private_storage_bytes",
                   discrepancy=";".join(["private_storage_read_authentication_unavailable", *drift]),
                   recommended_action="authenticated_read_only_download_then_SHA256_size_full_decode;"
                                      "archive_readback_independent_backup_restore_dependency_audit;preserve",
                   recorded_original_sha256=recorded,
                   storage_metadata_bytes=current["storage_metadata_bytes"],
                   hermes_recorded_source_bytes=current["recorded_bytes"],
                   hermes_job_id=current["job_id"],
                   drive_sha256_provenance="MEDUSA full-byte verification; not re-downloaded in this run"
                   if matches else None,
                   matching_drive_file_ids=[r["drive_file_id"] for r in matches],
                   matching_github_paths=[r["github_path"] for r in candidates],
                   metadata_matches_medusa=not any(x.startswith("metadata") for x in drift),
                   verification_method="SQL metadata reconciliation only; no private bytes read",
                   verified_at=observed_at)
        result.append(row)
    return result


def verify_github(repo, manifest):
    baseline = manifest["github"]["main_commit_sha"]
    if not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", baseline):
        raise ValueError("INVALID_BASELINE")
    if git(repo, "rev-parse", f"{baseline}^{{tree}}").decode().strip() != manifest["github"]["tree_sha"]:
        raise ValueError("BASELINE_TREE_MISMATCH")
    object_format = git(repo, "rev-parse", "--show-object-format").decode().strip()
    tree = {}
    for entry in git(repo, "ls-tree", "-rz", baseline).split(b"\0"):
        if entry:
            head, path = entry.split(b"\t", 1)
            mode, kind, oid = head.decode().split()
            if kind == "blob":
                tree[path.decode()] = oid
    groups = [("current_original", manifest["github_current_main_originals"]),
              ("other_or_quarantine", manifest["github_other_image_assets"]),
              ("historical_original", manifest["github_historical_unique_blob_reads"])]
    # Find historical objects outside the old directory by scanning all selected
    # history path events; the selected 18 must be present in the actual history.
    history = git(repo, "log", "--raw", "--no-abbrev", "--no-renames", "--format=%H",
                  baseline, "--", "assets/hermes/originals/").decode()
    history_commits = [line for line in history.splitlines()
                       if re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", line)]
    historical_ids = set(re.findall(r"[a-f0-9]{40,64}", history))
    history_blob_ids = set()
    history_events = 0
    for line in history.splitlines():
        if line.startswith(":"):
            head, path = line.split("\t", 1)
            if path.endswith((".png", ".zip")):
                history_events += 1
                for oid in head.split()[2:4]:
                    if set(oid) != {"0"}:
                        history_blob_ids.add(oid)
    expected_history = {r["git_blob_sha"] for r in manifest["github_history_change_records"]}
    if history_blob_ids != expected_history:
        raise ValueError("HISTORICAL_BLOB_SET_MISMATCH")
    cache, results = {}, []
    for scope, rows in groups:
        for row in rows:
            oid, path = row["git_blob_sha"], row["path"]
            bound = (oid in historical_ids if scope == "historical_original" else tree.get(path) == oid)
            if not bound:
                raise ValueError("MANIFEST_GIT_PATH_BINDING_MISMATCH")
            if oid not in cache:
                raw = read_git_blob(repo, oid, object_format)
                if raw is None:
                    cache[oid] = {"content_sha256": None, "bytes_read": None,
                                  "verification_status": "missing_counterpart",
                                  "integrity_result": "missing_git_blob"}
                else:
                    cache[oid] = inspect_bytes(raw, require_png=path.endswith((".png", ".png.corrupt")))
            check = dict(cache[oid])
            if check.get("content_sha256"):
                check["hash_matches_medusa"] = check["content_sha256"] == row.get("sha256_actual")
                check["size_matches_medusa"] = check["bytes_read"] == row.get("size_bytes")
                if check["integrity_result"] == "valid":
                    check["verification_status"] = ("verified_identical_copy" if
                        check["hash_matches_medusa"] and check["size_matches_medusa"] else "different_valid_version")
            check.update(scope=scope, github_path=path, github_blob_sha=oid,
                         git_object_format=object_format, git_object_hash_verified=check["bytes_read"] is not None,
                         git_path_binding_verified=bound,
                         verification_method="local git cat-file blob; recomputed Git object ID; "
                                             "SHA256(all bytes); PNG chunks/CRC/IEND; Pillow verify+load; ZIP testzip",
                         historical_tree_commit=row.get("tree_commit_sha"))
            claimed = re.search(r"/([a-f0-9]{64})\.(?:png|zip)(?:\.corrupt)?$", path)
            check["filename_sha256_matches"] = (check.get("content_sha256") == claimed[1]
                                                 if claimed and check.get("content_sha256") else None)
            results.append(check)
    return results, {"object_format": object_format, "unique_blobs_read": sum(
        r.get("bytes_read") is not None for r in cache.values()),
        "history_commits_touching_originals": len(history_commits),
        "history_unique_blob_versions": len(history_blob_ids),
        "history_path_events": history_events,
        "image_paths_on_baseline_outside_medusa": sorted(p for p in tree
            if p.lower().endswith((".png", ".webp", ".jpg", ".jpeg", ".gif", ".png.corrupt"))
            and p not in {r["github_path"] for r in results})}


def build(manifest_path, snapshot_path, repo):
    manifest = json.loads(Path(manifest_path).read_text())
    snapshot = json.loads(Path(snapshot_path).read_text())
    if ImageFile.LOAD_TRUNCATED_IMAGES:
        raise ValueError("PERMISSIVE_IMAGE_DECODING_FORBIDDEN")
    at = datetime.now(timezone.utc).isoformat()
    github, git_summary = verify_github(repo, manifest)
    sources = source_rows(manifest, snapshot, github, at)
    drive = verified_drive_index(manifest)
    for row in github:
        row["matching_drive_file_ids"] = [d["drive_file_id"] for d in drive.get(row.get("content_sha256"), [])
                                           if d["size_bytes"] == row["bytes_read"]]
        row["verified_at"] = at
    current = [r for r in github if r["scope"] == "current_original"]
    historical = [r for r in github if r["scope"] == "historical_original"]
    other = [r for r in github if r["scope"] == "other_or_quarantine"]
    cleanup = []
    for row in sources:
        if row["drive_sha256"]:
            cleanup.append({"system": "supabase_source", "path": row["supabase_object_path"],
                            "content_sha256": None, "candidate_basis": "historical_job_identity_only",
                            "safe_to_delete": False})
    for row in current:
        if row["matching_drive_file_ids"] and row["integrity_result"] == "valid":
            cleanup.append({"system": "github_current_original", "path": row["github_path"],
                            "content_sha256": row["content_sha256"],
                            "candidate_basis": "local_Git_bytes_match_MEDUSA_Drive_byte_evidence",
                            "safe_to_delete": False})
    for group in manifest["drive_duplicate_sha256_groups"]:
        cleanup.append({"system": "drive_duplicate_group", **group, "safe_to_delete": False})
    summary = {"supabase_objects": len(sources), "supabase_byte_verified": 0,
               "supabase_unverified": len(sources), "three_system_full_matches": 0,
               "supabase_corrupt": None, "supabase_missing": None,
               "source_metadata_drift": sum(not r["metadata_matches_medusa"] for r in sources),
               "source_historical_drive_candidates": sum(bool(r["drive_sha256"]) for r in sources),
               "source_historical_identity_matches_local_github": sum(bool(r["github_content_sha256"]) for r in sources),
               "github_current_original_paths": len(current),
               "github_current_valid": sum(r["integrity_result"] == "valid" for r in current),
               "github_current_matching_medusa_drive": sum(bool(r["matching_drive_file_ids"]) for r in current),
               "github_current_missing_drive": sum(not r["matching_drive_file_ids"] for r in current),
               "github_other_paths": len(other),
               "github_other_corrupt": sum(r["integrity_result"] == "corrupt_original" for r in other),
               "github_historical_versions_not_current": len(historical),
               "github_historical_corrupt": sum(r["integrity_result"] == "corrupt_original" for r in historical),
               "github_unique_corrupt_contents": len({r["content_sha256"] for r in github if r["integrity_result"] == "corrupt_original"}),
               "github_missing_blobs": sum(r["integrity_result"] == "missing_git_blob" for r in github),
               "github_medusa_hash_discrepancies": sum(r.get("hash_matches_medusa") is False for r in github),
               "github_current_filename_hash_mismatches": sum(r.get("filename_sha256_matches") is False for r in current),
               "drive_duplicate_groups_from_medusa": len(manifest["drive_duplicate_sha256_groups"]),
               "safe_to_delete_files": 0, **git_summary}
    provenance = {}
    for label, path in (("master_manifest", manifest_path), ("storage_metadata_snapshot", snapshot_path)):
        provenance[label] = {"file": Path(path).name, "bytes": Path(path).stat().st_size,
                             "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest()}
    return {"schema": "medusa-sha-verification/v1", "generated_at": at,
            "status": "BLOCKED_PRIVATE_STORAGE_READ_AUTHENTICATION",
            "github_baseline": manifest["github"], "summary": summary,
            "method": {"supabase": "metadata only; no private Storage bytes read",
                       "drive": "inherited per-file MEDUSA byte verification; no new original downloads",
                       "github": "offline existing checkout; no lazy fetch; full Git blob and content hashes plus full decode",
                       "metadata_observed_at": snapshot["observed_at"]},
            "access_evidence": snapshot.get("access_probe"),
            "input_provenance": provenance, "source_objects": sources,
            "github_verifications": github, "cleanup_candidates": cleanup,
            "cleanup_gate": "No deletion approval. Require verified permanent archive, independent backup, "
                            "successful restore test, active dependency audit and separate reviewed plan.",
            "limitations": ["No current private Storage object bytes have been read.",
                            "Source source_bytes is null: metadata sizes are separate fields.",
                            "Drive hashes are MEDUSA evidence, not new byte reads by this run.",
                            "Active dependency mapping, archive readback and independent backup/restore are unverified.",
                            "Git history scan covers MEDUSA original directory; other historical media outside its inventory are not exhaustive."]}


def write_reports(report, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "MEDUSA_SHA_VERIFICATION.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    extra = ["recorded_original_sha256", "storage_metadata_bytes", "hermes_recorded_source_bytes",
             "drive_sha256_provenance", "verification_method", "verified_at"]
    with (output / "MEDUSA_SHA_VERIFICATION.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS + extra, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(report["source_objects"])
    with (output / "MEDUSA_SHA_CLEANUP_CANDIDATES.csv").open("w", newline="") as stream:
        fields = ["system", "path", "content_sha256", "sha256", "drive_file_ids", "candidate_basis", "safe_to_delete"]
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for entry in report["cleanup_candidates"]:
            writer.writerow({**entry, "drive_file_ids": ";".join(entry.get("drive_file_ids", []))})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build(args.manifest, args.metadata, args.repo)
    write_reports(report, args.output)
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
