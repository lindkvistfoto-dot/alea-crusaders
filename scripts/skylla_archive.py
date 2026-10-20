#!/usr/bin/env python3
"""SKYLLA archive verification and explicit source-only eligibility; no delete API.

Drive copies are opt-in, content-addressed, fully decoded and read back. Missing
authentication/dependencies never establish eligibility. KERBEROS is unchanged.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request

import kerberos_archive as k

ROOT = Path(__file__).resolve().parents[1]
BUCKET = "alea-hermes-source"
KINDS = {"spell": ("spells", "icon"), "spell-cutout": ("spells", "cutout"),
         "spell-illustration": ("spells", "square"), "spell-illustration-wide": ("spells", "wide"),
         "skill": ("skills", "icon"), "skill-illustration": ("skills", "square"),
         "skill-illustration-wide": ("skills", "wide")}


def target_folder(kind, folders):
    if kind not in KINDS:
        raise k.Blocked("CATEGORY_REQUIRES_EXPLICIT_REVIEW")
    category, variant = KINDS[kind]
    return folders["spell_types" if category == "spells" else "skill_types"][variant]


def validate_descriptor(desc, folders):
    if desc.get("bucket") != BUCKET or desc.get("kind") not in KINDS:
        raise k.Blocked("BUCKET_OR_CATEGORY_FORBIDDEN")
    if desc.get("target_folder_id") != target_folder(desc["kind"], folders):
        raise k.Blocked("WRONG_ARCHIVE_CATEGORY")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", desc.get("target_key", "")):
        raise k.Blocked("INVALID_TARGET_KEY")
    expected = f"{desc['kind']}/{desc['target_key']}/{desc['expected_sha256']}.png"
    if desc.get("object_path") != expected:
        raise k.Blocked("EXACT_OBJECT_PATH_REQUIRED")
    k.require_identity(desc["expected_sha256"], desc["expected_size_bytes"])
    if not k.DRIVE_ID.fullmatch(desc.get("inbox_file_id", "")):
        raise k.Blocked("INVALID_INBOX_ID")


def verify_variant(data, desc):
    proof = k.verified(data, desc["expected_sha256"], desc["expected_size_bytes"])
    width, height = proof["width"], proof["height"]
    if desc["kind"].endswith("-wide"):
        ratio = width / height
        valid = (abs(ratio - 16 / 9) / (16 / 9) <= 0.003 if desc["kind"].startswith("skill")
                 else 1.25 <= ratio <= 2.4)
    else:
        valid = width == height
    if not valid:
        raise k.Blocked("CATEGORY_SHAPE_MISMATCH")
    return proof


def pair_proof(source, archived, desc, metadata, folders):
    """Fresh actual bytes on both sides; never promote Drive proof to Storage proof."""
    validate_descriptor(desc, folders)
    if (metadata.get("id") == desc["inbox_file_id"] or not metadata.get("id")
            or desc["target_folder_id"] not in metadata.get("parents", [])
            or metadata.get("mimeType") != "image/png" or metadata.get("trashed") is not False):
        raise k.Blocked("MISSING_OR_WRONG_PERMANENT_DRIVE_COPY")
    left = verify_variant(source, desc)
    right = verify_variant(archived, desc)
    if source != archived or str(metadata.get("size")) != str(len(archived)):
        raise k.Blocked("ARCHIVE_BYTE_IDENTITY_MISMATCH")
    return {"schema": "skylla-drive-proof/v1", "archive_status": "verified_readback",
            "inbox_file_id": desc["inbox_file_id"], "permanent_drive_file_id": metadata["id"],
            "target_folder_id": desc["target_folder_id"], "version_id": "sha256:" + left["sha256"],
            "source_drive_verification": left, "archive_verification": right,
            "drive_sha256": right["sha256"], "size_bytes": len(archived),
            "bytes_equal": True, "verified_at": k.now()}


class DriveAPI:
    """Concrete binary Drive adapter: GET and explicitly enabled files.copy only."""
    def __init__(self, journal_dir, enable_copy=False):
        self.token = os.environ.get("SKYLLA_DRIVE_TOKEN")
        if not self.token:
            raise k.Blocked("DRIVE_AUTHENTICATION_REQUIRED")
        self.journal = Path(journal_dir)
        self.enable_copy = enable_copy

    def request(self, endpoint, payload=None, limit=k.MAX_BYTES):
        try:
            data = json.dumps(payload).encode() if payload is not None else None
            headers = {"Authorization": "Bearer " + self.token}
            if data is not None:
                headers["Content-Type"] = "application/json"
                if not self.enable_copy or not re.fullmatch(r"files/[A-Za-z0-9_-]+/copy\?fields=id", endpoint):
                    raise k.Blocked("PRODUCTION_WRITE_FORBIDDEN")
            req = urllib.request.Request("https://www.googleapis.com/drive/v3/" + endpoint,
                                         data=data, headers=headers, method="POST" if data is not None else "GET")
            with urllib.request.build_opener(k.NoRedirect()).open(req, timeout=30) as response:
                raw = response.read(limit + 1)
                length = response.headers.get("Content-Length")
                if not 200 <= response.status < 300 or len(raw) > limit or (length and int(length) != len(raw)):
                    raise k.Blocked("INCOMPLETE_DRIVE_RESPONSE")
                return raw
        except k.Blocked:
            raise
        except Exception:
            raise k.Blocked("DRIVE_REQUEST_FAILED_OR_INTERRUPTED") from None

    def metadata(self, file_id):
        if not k.DRIVE_ID.fullmatch(file_id): raise k.Blocked("INVALID_DRIVE_ID")
        return json.loads(self.request("files/" + file_id + "?fields=id,parents,size,mimeType,trashed", limit=65536))

    def read(self, file_id):
        if not k.DRIVE_ID.fullmatch(file_id): raise k.Blocked("INVALID_DRIVE_ID")
        return self.request("files/" + file_id + "?alt=media")

    def find_exact(self, parent, name):
        if not k.DRIVE_ID.fullmatch(parent) or not re.fullmatch(r"[a-f0-9]{64}\.png", name):
            raise k.Blocked("INVALID_ARCHIVE_LOOKUP")
        query = urllib.parse.urlencode({"q": f"'{parent}' in parents and name = '{name}' and trashed = false",
                                       "fields": "files(id),nextPageToken", "pageSize": 100})
        response = json.loads(self.request("files?" + query, limit=65536))
        if response.get("nextPageToken") or "files" not in response:
            raise k.Blocked("INCOMPLETE_ARCHIVE_LOOKUP")
        return [row["id"] for row in response["files"]]

    def copy_new(self, source, parent, name):
        if not self.enable_copy: raise k.Blocked("COPY_NOT_ENABLED")
        if not k.DRIVE_ID.fullmatch(source) or not k.DRIVE_ID.fullmatch(parent) or not re.fullmatch(r"[a-f0-9]{64}\.png", name):
            raise k.Blocked("INVALID_COPY_IDENTITY")
        if self.journal.is_symlink() or any(p.is_symlink() for p in self.journal.parents):
            raise k.Blocked("UNSAFE_JOURNAL")
        if self.journal.resolve().is_relative_to(ROOT) and not self.journal.resolve().is_relative_to(ROOT / "docs/skylla"):
            raise k.Blocked("UNSAFE_JOURNAL")
        self.journal.mkdir(parents=True, exist_ok=True)
        identity = k.digest(k.canonical({"parent": parent, "name": name}))
        # Atomic intent is the lock. An unknown outcome may never trigger a blind retry.
        try:
            with (self.journal / (identity + ".intent.json")).open("x") as stream:
                stream.write(json.dumps({"source": source, "parent": parent, "name": name}))
        except FileExistsError:
            raise k.Blocked("COPY_INTENT_EXISTS_RECONCILE") from None
        response = json.loads(self.request("files/" + source + "/copy?fields=id",
                                           {"name": name, "parents": [parent]}, limit=65536))
        file_id = response.get("id", "")
        if not k.DRIVE_ID.fullmatch(file_id) or file_id == source:
            raise k.Blocked("INVALID_COPY_RESPONSE_RECONCILE")
        with (self.journal / (identity + ".result.json")).open("x") as stream:
            stream.write(json.dumps({"id": file_id}))
        return file_id


def archive_one(desc, folders, adapter, allow_copy=False):
    """Adapter: read(id), metadata(id), find_exact(parent,name), copy_new(id,parent,name).

    One executor must hold an external per-content lock for production writes.
    Reconcile ambiguous copy outcomes before retry; never overwrite or move.
    """
    validate_descriptor(desc, folders)
    source_meta = adapter.metadata(desc["inbox_file_id"])
    if (source_meta.get("id") != desc["inbox_file_id"]
            or folders["inbox_folder_id"] not in source_meta.get("parents", [])):
        raise k.Blocked("SOURCE_ID_OR_INBOX_MISMATCH")
    source = adapter.read(desc["inbox_file_id"])
    verify_variant(source, desc)
    name = desc["expected_sha256"] + ".png"
    matches = adapter.find_exact(desc["target_folder_id"], name)
    if len(matches) > 1:
        raise k.Blocked("MULTIPLE_ARCHIVE_IDENTITIES_REQUIRE_REVIEW")
    if matches:
        archive_id = matches[0]
    else:
        if not allow_copy:
            raise k.Blocked("ARCHIVE_COPY_REQUIRES_EXPLICIT_ENABLE")
        # No automatic retry: exceptions can mean an unknown server-side result.
        try:
            archive_id = adapter.copy_new(desc["inbox_file_id"], desc["target_folder_id"], name)
        except Exception:
            raise k.Blocked("COPY_OUTCOME_UNKNOWN_RECONCILE_BEFORE_RETRY") from None
    return pair_proof(source, adapter.read(archive_id), desc, adapter.metadata(archive_id), folders)


def eligibility(desc, drive, supabase, dependencies, policy):
    """Technical candidate only; deletion always awaits a separate exact-batch approval."""
    reasons = []
    if (policy.get("policy_id") != "SKYLLA-FAST-TRACK-123" or policy.get("bucket") != BUCKET
            or policy.get("project_id") != "wbmosmkirsitkonejzpg" or desc.get("bucket") != BUCKET
            or policy.get("independent_backup_required") is not False
            or policy.get("separate_approval_per_delete_batch_required") is not True
            or policy.get("automatic_deletion_enabled") is not False):
        reasons.append("policy_scope_mismatch")
    if (not drive or drive.get("archive_status") != "verified_readback" or drive.get("bytes_equal") is not True
            or drive.get("target_folder_id") != desc.get("target_folder_id")
            or not drive.get("permanent_drive_file_id")
            or drive.get("permanent_drive_file_id") == desc.get("inbox_file_id")
            or drive.get("archive_verification", {}).get("complete_decode") is not True):
        reasons.append("permanent_drive_readback_missing")
    if (not supabase or supabase.get("system") != "supabase" or supabase.get("bucket") != BUCKET
            or supabase.get("object_path") != desc.get("object_path")
            or supabase.get("status") != "verified_complete" or not supabase.get("complete_decode")):
        reasons.append("current_supabase_bytes_not_verified")
    if drive and supabase:
        if (supabase.get("sha256") != drive.get("drive_sha256")
                or supabase.get("size_bytes") != drive.get("size_bytes")
                or supabase.get("sha256") != desc.get("expected_sha256")):
            reasons.append("supabase_drive_identity_mismatch")
    if (not dependencies or dependencies.get("status") != "clear"
            or dependencies.get("object_path") != desc.get("object_path")
            or dependencies.get("active_consumers") != [] or not dependencies.get("observed_at")
            or not dependencies.get("evidence_reference")):
        reasons.append("active_or_unknown_dependencies")
    if (not dependencies or dependencies.get("app_images_verified") is not True
            or dependencies.get("reference_paths_unchanged") is not True):
        reasons.append("display_image_or_reference_health_not_verified")
    restore_path = ROOT / "docs/skylla/SKYLLA_ACCESS_AND_RESTORE.md"
    if (not dependencies or dependencies.get("restore_plan_reference") != "docs/skylla/SKYLLA_ACCESS_AND_RESTORE.md"
            or not restore_path.is_file()
            or dependencies.get("restore_plan_sha256") != k.digest(restore_path.read_bytes())):
        reasons.append("documented_restore_plan_missing_or_changed")
    for name, proof in (("drive", drive), ("supabase", supabase), ("dependencies", dependencies)):
        try:
            value = proof.get("observed_at" if name == "dependencies" else "verified_at")
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(value.replace("Z", "+00:00"))).total_seconds()
            if not 0 <= age <= 600:
                raise ValueError()
        except (AttributeError, TypeError, ValueError):
            reasons.append(name + "_evidence_missing_or_stale")
    eligible = not reasons
    return {"eligible_for_delete_proposal": eligible, "safe_to_delete": False,
            "owner_approval_verified": False,
            "restore_readback_verified": bool(drive and drive.get("bytes_equal") is True
                and drive.get("archive_verification", {}).get("complete_decode") is True),
            "deletion_status": "awaiting_separate_batch_approval" if eligible else "blocked",
            "blocking_issues": reasons, "estimated_reclaimable_bytes": desc["expected_size_bytes"] if eligible else 0,
            "independent_backup_waived_by": policy.get("decision_reference"),
            "delete_api_invoked": False}


def archive_batch(descriptors, folders, adapter, allow_copy=False):
    results = []
    for desc in descriptors:
        try:
            proof = archive_one(desc, folders, adapter, allow_copy)
            results.append({"object_path": desc["object_path"], "status": "verified", "proof": proof})
        except k.Blocked as error:
            results.append({"object_path": desc["object_path"], "status": "blocked", "reason": str(error)})
        except Exception:
            results.append({"object_path": desc.get("object_path"), "status": "blocked",
                            "reason": "UNEXPECTED_READ_OR_METADATA_FAILURE"})
    return results


def write_manifest(output, manifest):
    output = Path(output)
    if output.resolve().is_relative_to(ROOT) and not output.resolve().is_relative_to(ROOT / "docs/skylla"):
        raise k.Blocked("UNSAFE_REPORT_DIRECTORY")
    if output.is_symlink() or any(p.is_symlink() for p in output.parents):
        raise k.Blocked("SYMLINK_FORBIDDEN")
    output.mkdir(parents=True, exist_ok=True)
    with (output / "SKYLLA_ARCHIVE_MANIFEST.json").open("x") as stream:
        stream.write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    fields = ["bucket", "object_path", "source_actual_sha256", "drive_sha256", "permanent_drive_file_id",
              "size_bytes", "eligible_for_delete_proposal", "safe_to_delete", "estimated_reclaimable_bytes"]
    with (output / "SKYLLA_DELETE_CANDIDATES.csv").open("x", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(row for row in manifest["objects"] if row["eligible_for_delete_proposal"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    pair = sub.add_parser("verify-pair")
    pair.add_argument("--source", type=Path, required=True)
    pair.add_argument("--archive", type=Path, required=True)
    pair.add_argument("--metadata", type=Path, required=True)
    drive = sub.add_parser("archive-drive")
    drive.add_argument("--journal", type=Path, required=True)
    drive.add_argument("--enable-copy", action="store_true")
    for command in (pair, drive):
        command.add_argument("--descriptor", type=Path, required=True)
        command.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        desc = k.load_json(args.descriptor)
        folders = k.load_json(ROOT / "config/hermes-drive-folders.json")
        if args.command == "archive-drive":
            report = archive_one(desc, folders, DriveAPI(args.journal, args.enable_copy), args.enable_copy)
        else:
            source, _ = k.read_local(args.source, desc["expected_sha256"], desc["expected_size_bytes"])
            archive, _ = k.read_local(args.archive, desc["expected_sha256"], desc["expected_size_bytes"])
            report = pair_proof(source, archive, desc, k.load_json(args.metadata), folders)
        resolved = args.output.resolve()
        if (args.output.suffix != ".json" or args.output.is_symlink()
                or any(p.is_symlink() for p in args.output.parents)
                or (resolved.is_relative_to(ROOT) and not resolved.is_relative_to(ROOT / "docs/skylla"))):
            raise k.Blocked("UNSAFE_OUTPUT")
        with args.output.open("x") as stream:
            stream.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print("SKYLLA_DRIVE_READBACK_VERIFIED;DELETIONS:0")
    except k.Blocked as error:
        parser.exit(2, f"SKYLLA_BLOCKED:{error}\n")
    except Exception:
        parser.exit(2, "SKYLLA_BLOCKED:INVALID_INPUT_OR_IO\n")


if __name__ == "__main__":
    main()
