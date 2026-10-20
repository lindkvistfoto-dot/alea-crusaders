#!/usr/bin/env python3
"""KERBEROS: non-destructive archive planning, read-only verification and sandbox drill.

Production adapters expose GET only. No move, publish, delete or production upload
exists. Local writes require a sandbox capability; every destination is exclusive.
MEDUSA evidence is inherited evidence, never a fresh archive/backup attestation.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import struct
import urllib.error
import urllib.parse
import urllib.request
import warnings
import zlib

from PIL import Image, ImageFile

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 32 * 1024 * 1024
MAX_PIXELS = 20_000_000
SUPABASE_ORIGIN = "https://wbmosmkirsitkonejzpg.supabase.co"
SHA = re.compile(r"[0-9a-f]{64}\Z")
DRIVE_ID = re.compile(r"[A-Za-z0-9_-]{5,200}\Z")


class Blocked(Exception):
    """Only fixed error codes may leave this module; never provider error bodies."""


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def require_identity(sha, size):
    if not isinstance(sha, str) or not SHA.fullmatch(sha) or type(size) is not int or not 0 < size <= MAX_BYTES:
        raise Blocked("INVALID_EXPECTED_IDENTITY")


def verify_png(data, expected_sha, expected_size):
    """CRC + terminal IEND + full frame decoding; hashes always cover actual bytes."""
    require_identity(expected_sha, expected_size)
    result = {"sha256": digest(data), "size_bytes": len(data), "verified_at": now(),
              "format": None, "width": None, "height": None, "color_mode": None,
              "status": "corrupt", "complete_decode": False}
    try:
        if len(data) > MAX_BYTES or not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError()
        if ImageFile.LOAD_TRUNCATED_IMAGES:
            raise Blocked("PERMISSIVE_DECODER_FORBIDDEN")
        pos, ended = 8, False
        while pos < len(data):
            if pos + 12 > len(data):
                raise ValueError()
            size = struct.unpack_from(">I", data, pos)[0]
            end = pos + size + 12
            if end > len(data):
                raise ValueError()
            kind = data[pos + 4:pos + 8]
            if zlib.crc32(data[pos + 4:end - 4]) & 0xffffffff != struct.unpack_from(">I", data, end - 4)[0]:
                raise ValueError()
            if kind == b"IEND":
                if size or end != len(data):
                    raise ValueError()
                ended = True
            pos = end
        if not ended:
            raise ValueError()
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format != "PNG" or image.width * image.height > MAX_PIXELS:
                    raise ValueError()
                result.update(format=image.format, width=image.width, height=image.height, color_mode=image.mode)
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                for frame in range(getattr(image, "n_frames", 1)):
                    image.seek(frame)
                    image.load()
        result["complete_decode"] = True
        result["status"] = ("verified_complete" if result["sha256"] == expected_sha
                            and len(data) == expected_size else "identity_mismatch")
    except (ValueError, OSError, SyntaxError, EOFError, Image.DecompressionBombWarning,
            Image.DecompressionBombError, RuntimeError):
        pass
    return result


def verified(data, sha, size):
    result = verify_png(data, sha, size)
    if result["status"] != "verified_complete":
        raise Blocked(result["status"].upper())
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Blocked("REDIRECT_FORBIDDEN")


def get_bytes(url, headers=None, limit=MAX_BYTES):
    """Bounded binary GET; no redirects, retries, URLs or HTTP bodies in errors."""
    try:
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(urllib.request.Request(url, headers=headers or {}, method="GET"), timeout=30) as response:
            if response.status != 200:
                raise Blocked("HTTP_READ_FAILED")
            data = response.read(limit + 1)
            length = response.headers.get("Content-Length")
            if len(data) > limit or (length is not None and int(length) != len(data)):
                raise Blocked("INCOMPLETE_OR_OVERSIZE_TRANSFER")
            return data
    except Blocked:
        raise
    except Exception:
        raise Blocked("READ_FAILED_OR_INTERRUPTED") from None


def read_supabase(ticket, object_path, sha, size, fetch=get_bytes):
    """A per-object, expiring signed GET capability supplied through a private file."""
    require_identity(sha, size)
    if not ticket:
        raise Blocked("AUTHENTICATION_REQUIRED")
    try:
        url = ticket["signed_url"]
        expiry = datetime.fromisoformat(ticket["expires_at"].replace("Z", "+00:00"))
        ttl = (expiry - datetime.now(timezone.utc)).total_seconds()
        parts = urllib.parse.urlsplit(url)
        expected_path = "/storage/v1/object/sign/alea-hermes-source/" + urllib.parse.quote(object_path, safe="/")
        if (ticket["object_path"] != object_path or ticket["sha256"] != sha or ticket["size_bytes"] != size
                or not 0 < ttl <= 3600 or not object_path or any(p in ("", ".", "..") for p in object_path.split("/"))
                or "\\" in object_path or "%" in object_path or "?" in object_path or "#" in object_path
                or parts.scheme != "https" or parts.netloc != urllib.parse.urlsplit(SUPABASE_ORIGIN).netloc
                or parts.path != expected_path or parts.fragment or not parts.query
                or set(urllib.parse.parse_qs(parts.query)) != {"token"}):
            raise Blocked("INVALID_OR_EXPIRED_CAPABILITY")
    except Blocked:
        raise
    except Exception:
        raise Blocked("INVALID_OR_EXPIRED_CAPABILITY") from None
    data = fetch(url, limit=min(MAX_BYTES, size))
    result = verified(data, sha, size)
    return data, {**result, "system": "supabase", "bucket": "alea-hermes-source", "object_path": object_path}


def read_drive(file_id, folder_id, sha, size, fetch=get_bytes):
    """Read exact permanent ID and its bytes, pinned to archive parent and digest."""
    require_identity(sha, size)
    if not DRIVE_ID.fullmatch(file_id) or not DRIVE_ID.fullmatch(folder_id):
        raise Blocked("INVALID_DRIVE_ID")
    token = os.environ.get("KERBEROS_DRIVE_READ_TOKEN")
    if not token:
        raise Blocked("AUTHENTICATION_REQUIRED")
    headers = {"Authorization": "Bearer " + token}
    url = "https://www.googleapis.com/drive/v3/files/" + file_id
    try:
        metadata = json.loads(fetch(url + "?fields=id,parents,size,mimeType,trashed", headers, limit=65536))
    except Blocked:
        raise
    except Exception:
        raise Blocked("INVALID_DRIVE_METADATA") from None
    if (metadata.get("id") != file_id or folder_id not in metadata.get("parents", [])
            or metadata.get("trashed") is not False or metadata.get("mimeType") != "image/png"
            or str(metadata.get("size")) != str(size)):
        raise Blocked("DRIVE_ID_PARENT_OR_METADATA_MISMATCH")
    data = fetch(url + "?alt=media", headers, limit=min(MAX_BYTES, size))
    return data, {**verified(data, sha, size), "system": "drive", "drive_file_id": file_id,
                  "folder_id": folder_id, "readback": True}


def read_local(path, sha, size):
    path = Path(path)
    if path.is_symlink():
        raise Blocked("SYMLINK_FORBIDDEN")
    try:
        with path.open("rb") as stream:
            data = stream.read(MAX_BYTES + 1)
    except FileNotFoundError:
        raise Blocked("MISSING_ORIGINAL") from None
    except OSError:
        raise Blocked("LOCAL_READ_FAILED") from None
    return data, verified(data, sha, size)


def create_json(path, value):
    """Never replace an existing file, even a report or an interrupted receipt."""
    path = Path(path)
    resolved = path.resolve()
    if (path.suffix != ".json" or (resolved.is_relative_to(ROOT)
            and not resolved.is_relative_to(ROOT / "docs/kerberos"))):
        raise Blocked("UNSAFE_REPORT_DESTINATION")
    if path.is_symlink() or any(p.is_symlink() for p in path.parents):
        raise Blocked("SYMLINK_FORBIDDEN")
    try:
        with path.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    except FileExistsError:
        raise Blocked("OUTPUT_ALREADY_EXISTS") from None


class Sandbox:
    """Only simulator writes. An exclusive sentinel binds two separate local stores.

    These two local stores exercise the protocol but NEVER prove an independent
    production backup, even when the caller supplies different account labels.
    """
    def __init__(self, root, capability):
        self.root = Path(root).resolve()
        marker = self.root / ".kerberos-simulation.json"
        try:
            if marker.is_symlink() or json.loads(marker.read_text()) != {"simulation": True, "capability": capability}:
                raise Blocked("SANDBOX_CAPABILITY_REQUIRED")
        except (OSError, ValueError):
            raise Blocked("SANDBOX_CAPABILITY_REQUIRED") from None

    def path(self, name):
        candidate = self.root / name
        if candidate.is_symlink() or not candidate.resolve().is_relative_to(self.root):
            raise Blocked("SANDBOX_ESCAPE")
        return candidate

    def put(self, name, data):
        path = self.path(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            if path.read_bytes() != data:
                raise Blocked("IMMUTABLE_IDENTITY_CONFLICT")
            return "already_present"
        try:
            with path.open("xb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
        except FileExistsError:
            if path.read_bytes() != data:
                raise Blocked("IMMUTABLE_IDENTITY_CONFLICT") from None
        return "created"


def simulate(original, descriptor, sandbox):
    """Export, verify, re-read backup and compare recovered bytes to source bytes."""
    sha, size = descriptor["sha256"], descriptor["size_bytes"]
    data, source = read_local(original, sha, size)
    identity = "sha256:" + sha
    archive_name, backup_name = f"archive/{sha}.png", f"independent-store/{sha}.png"
    archived = sandbox.put(archive_name, data)
    archive_data, archive_check = read_local(sandbox.path(archive_name), sha, size)
    exported = sandbox.put(backup_name, archive_data)
    backup_data, export_check = read_local(sandbox.path(backup_name), sha, size)
    # A separate open/read models restoring from the external backend.
    restored, restore_check = read_local(sandbox.path(backup_name), sha, size)
    if restored != data or backup_data != archive_data:
        raise Blocked("RESTORE_BYTE_COMPARISON_FAILED")
    return {"schema": "kerberos-drill/v1", "simulation": True, "identity": identity,
            "version_id": descriptor.get("version_id", identity), "source": source,
            "archive": {**archive_check, "simulated_file_id": archive_name, "write": archived},
            "backup": {**export_check, "location": backup_name, "object_identity": sha,
                       "write": exported, "independent_production_backup": False},
            "restore": {**restore_check, "bytes_equal_original": True},
            "safe_to_delete": False, "production_archive_verified": False}


def restore_backup(original, backup, sha, size, backup_identity):
    """Verify a materialized external backup without writing a restore over a source.

    Provider/account/custodian identity is recorded as operator-supplied inventory,
    never promoted to independence proof merely because its strings differ.
    """
    if not all(backup_identity.get(k) for k in ("provider", "account", "object_id", "location")):
        raise Blocked("BACKUP_IDENTITY_REQUIRED")
    if Path(original).resolve() == Path(backup).resolve() or (Path(backup).exists() and os.path.samefile(original, backup)):
        raise Blocked("BACKUP_CANNOT_BE_SOURCE_FILE")
    before, source = read_local(original, sha, size)
    restored, check = read_local(backup, sha, size)
    return {"schema": "kerberos-restore/v1", "source": source, "backup_identity": backup_identity,
            "restore": check, "bytes_equal_original": before == restored,
            "independence_verified": False, "safe_to_delete": False}


def export_backup(original, descriptor, destination, enable_write=False):
    """Export to an explicitly provisioned independent mount, never a Drive folder.

    The operator provisions the mount and its identity marker out of band. This
    records that assertion but does not certify the provider/account boundary.
    Dry-run is the default; no directory is created by this function.
    """
    root = Path(destination)
    if root.is_symlink() or any(p.is_symlink() for p in root.parents) or root.resolve().is_relative_to(ROOT):
        raise Blocked("BACKUP_DESTINATION_MUST_BE_EXTERNAL")
    try:
        marker = root / ".kerberos-backup-destination.json"
        if marker.is_symlink():
            raise Blocked("SYMLINK_FORBIDDEN")
        identity = load_json(marker)
        if identity.get("provider") not in ("s3", "azure_blob", "offline_encrypted", "gcs_other_account"):
            raise Blocked("INDEPENDENT_BACKUP_PROVIDER_REQUIRED")
        if not all(identity.get(k) for k in ("account", "location", "custodian", "provisioning_evidence")):
            raise Blocked("BACKUP_PROVISIONING_EVIDENCE_REQUIRED")
    except Blocked:
        raise
    except Exception:
        raise Blocked("BACKUP_DESTINATION_NOT_PROVISIONED") from None
    sha, size = descriptor["sha256"], descriptor["size_bytes"]
    raw, source = read_local(original, sha, size)
    target = root / (sha + ".png")
    if target.is_symlink():
        raise Blocked("SYMLINK_FORBIDDEN")
    record = {"schema": "kerberos-backup/v1", "backup_identity": {**identity, "object_id": sha},
              "source": source, "independence_verified": False, "safe_to_delete": False,
              "dry_run": not enable_write, "export_verified": False, "restore_verified": False}
    if not enable_write:
        return record
    if target.exists():
        # Idempotence must re-read complete bytes; a partial export cannot pass.
        data, _ = read_local(target, sha, size)
        if data != raw:
            raise Blocked("BACKUP_IDENTITY_CONFLICT")
    else:
        with target.open("xb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
    _, exported = read_local(target, sha, size)
    restored = restore_backup(original, target, sha, size, record["backup_identity"])
    record.update(export_verified=True, restore_verified=restored["bytes_equal_original"],
                  export_readback=exported, restore=restored, backup_file_name=target.name)
    return record


def require_archive_destination(descriptor):
    folders = load_json(ROOT / "config/hermes-drive-folders.json")
    category, variant = descriptor["category"], descriptor["variant"]
    allowed_folder = (folders.get("spell_types", {}).get(variant) if category == "spells" else
                      folders.get("skill_types", {}).get(variant) if category == "skills" else
                      folders.get("archive_categories", {}).get(category))
    if not allowed_folder or descriptor["folder_id"] != allowed_folder:
        raise Blocked("UNREGISTERED_ARCHIVE_DESTINATION")


def register_archive(original, descriptor, registry, reader=read_drive):
    """Return a new registry snapshot only after source + pinned Drive byte readback.

    Existing content IDs are immutable. Different asset keys may reference the same
    content; a different SHA is a separate version. Never allocate a second copy.
    """
    required = ("drive_file_id", "folder_id", "sha256", "size_bytes", "category", "variant",
                "register_links", "inbox_file_id", "version_id")
    if any(not descriptor.get(key) for key in required):
        raise Blocked("INCOMPLETE_ARCHIVE_DESCRIPTOR")
    require_archive_destination(descriptor)
    sha, size = descriptor["sha256"], descriptor["size_bytes"]
    source, source_check = read_local(original, sha, size)
    archive, check = reader(descriptor["drive_file_id"], descriptor["folder_id"], sha, size)
    verified(archive, sha, size)
    if (source != archive or check.get("drive_file_id") != descriptor["drive_file_id"]
            or check.get("folder_id") != descriptor["folder_id"] or check.get("readback") is not True):
        raise Blocked("ARCHIVE_READBACK_IDENTITY_MISMATCH")
    identity = "sha256:" + sha
    if any(key != identity and entry.get("drive_file_id") == descriptor["drive_file_id"]
           for key, entry in registry.items()):
        raise Blocked("DRIVE_ID_REUSED_FOR_DIFFERENT_CONTENT")
    existing = registry.get(identity)
    record = {**descriptor, "identity": identity, "format": source_check["format"],
              "width": source_check["width"], "height": source_check["height"],
              "color_mode": source_check["color_mode"], "archive_status": "already_archived" if existing else "archived_verified",
              "verified_at": check["verified_at"], "archive_readback": check, "safe_to_delete": False}
    if existing:
        for key in required:
            if existing.get(key) != descriptor[key]:
                raise Blocked("ARCHIVE_REGISTRY_IDENTITY_CONFLICT")
    return {**registry, identity: record}


def evaluate_cleanup(original, descriptor, backup, backup_identity, governance, reader=read_drive):
    """Recompute all technical checks; governance binds to this exact version/hash.

    Attestations require separate project-owner review. Even complete evidence is
    informational here: this operation can never authorize or execute deletion.
    """
    require_archive_destination(descriptor)
    sha, size = descriptor["sha256"], descriptor["size_bytes"]
    source, _ = read_local(original, sha, size)
    archive, _ = reader(descriptor["drive_file_id"], descriptor["folder_id"], sha, size)
    verified(archive, sha, size)
    restored = restore_backup(original, backup, sha, size, backup_identity)
    binding = {"sha256": sha, "version_id": descriptor["version_id"],
               "drive_file_id": descriptor["drive_file_id"]}
    def attestation(name):
        value = governance.get(name, {})
        return (all(value.get(k) == v for k, v in binding.items())
                and value.get("approved") is True and bool(value.get("reviewer"))
                and bool(value.get("evidence_reference")) and bool(value.get("reviewed_at")))
    checks = {"source_bytes_verified": True, "drive_readback_verified": source == archive,
              "independent_backup_verified": (backup_identity.get("provider") in
                  ("s3", "azure_blob", "offline_encrypted", "gcs_other_account")
                  and attestation("independence") and governance["independence"].get("backup_identity") == backup_identity),
              "restore_passed": restored["bytes_equal_original"],
              "dependencies_checked": attestation("dependencies")
                  and governance["dependencies"].get("active_references") == [],
              "restore_plan_documented": attestation("restore_plan"),
              "owner_cleanup_approved": attestation("owner_cleanup")}
    return {"binding": binding, "checks": checks, "missing": [k for k, v in checks.items() if not v],
            "all_conditions_met": all(checks.values()), "phase_allows_deletion": False,
            "safe_to_delete": False, "governance_trust": "operator_supplied_requires_owner_review"}


KIND_MAP = {
    "spell": ("spells", "icon"), "spell-cutout": ("spells", "cutout"),
    "spell-illustration": ("spells", "square"), "spell-illustration-wide": ("spells", "wide"),
    "skill": ("skills", "icon"), "skill-illustration": ("skills", "square"),
    "skill-illustration-wide": ("skills", "wide"), "ui": ("ui", "original"),
}


def cleanup_gate(item):
    """Machine-readable requirements. No deletion authorization in this phase."""
    checks = {name: False for name in ("source_bytes_verified", "drive_readback_verified",
              "independent_backup_verified", "restore_passed", "dependencies_checked",
              "restore_plan_documented", "owner_cleanup_approved")}
    # Inherited manifest metadata must never satisfy these live evidence gates.
    return {"checks": checks, "missing": list(checks), "all_conditions_met": False,
            "phase_allows_deletion": False, "safe_to_delete": False}


def build_plan(manifest, folders):
    """Deterministic content-addressed plan; one content entry plus all source aliases.

    Private source objects stay separate until current bytes are authenticated.
    Folder entries are not originals; ZIP/JPEG retained but blocked for PNG pilot.
    """
    groups = {}
    def add(system, key, row, byte_verified, corrupt=False):
        sha = row.get("sha256_actual")
        if not isinstance(sha, str) or not SHA.fullmatch(sha):
            sha = None
        identity = "sha256:" + sha if sha and byte_verified else system + ":" + key
        item = groups.setdefault(identity, {"identity": identity, "sha256": sha if byte_verified else None,
                   "sources": [], "github_paths": [], "register_links": [], "kinds": [],
                   "inbox_file_ids": [], "batches": [], "observations": [], "corrupt": False})
        source = {"system": system, "identity": key, "size_bytes": row.get("size_bytes"),
                  "evidence": "MEDUSA_full_bytes" if byte_verified else "metadata_only"}
        if system == "supabase":
            source["bucket"] = row.get("bucket")
            source["recorded_sha256"] = row.get("hermes_recorded_sha256")
            source["candidate_drive_file_id"] = row.get("candidate_drive_file_id")
        item["sources"].append(source)
        item["observations"].append({"format": row.get("format"), "dimensions": row.get("dimensions"),
                                     "color_mode": row.get("mode"), "size_bytes": row.get("size_bytes")})
        item["corrupt"] |= corrupt
        if system == "drive":
            item["inbox_file_ids"].append(key)
        if system in ("github", "github_history"):
            item["github_paths"].append(row["path"])
            parts = row["path"].split("/")
            if parts[:3] == ["assets", "hermes", "originals"] and len(parts) >= 6:
                item["kinds"].append((parts[3], parts[4]))
            item["register_links"].extend(row.get("database_reference_fields", []))
        if row.get("spell_key"):
            item["kinds"].append(("spell", row["spell_key"]))
            item["register_links"].append({"entity": "spells", "key": row["spell_key"], "field": "icon_path"})
    for row in manifest.get("drive_records", []):
        if row.get("mime_type") == "application/vnd.google-apps.folder":
            continue
        add("drive", row["drive_file_id"], row,
            row.get("bytes_read") is True and row.get("integrity") in ("verified_image_decode", "verified_zip"))
    for system, field in (("github", "github_current_main_originals"),
                          ("github_history", "github_historical_unique_blob_reads")):
        for row in manifest.get(field, []):
            add(system, row["path"] + "@" + row["git_blob_sha"], row, row.get("bytes_read") is True,
                any(v in str(row.get("integrity")).lower() for v in ("corrupt", "truncat", "decode_error")))
    for row in manifest.get("supabase_source_objects", []):
        add("supabase", row["path"], row, False)
    items = []
    by_asset = defaultdict(list)
    for identity, item in sorted(groups.items()):
        kinds = sorted(set(item.pop("kinds")))
        targets = {KIND_MAP[kind] for kind, _ in kinds if kind in KIND_MAP}
        category, variant = next(iter(targets)) if len(targets) == 1 else (None, None)
        folder = (folders.get("spell_types", {}).get(variant) if category == "spells" else
                  folders.get("skill_types", {}).get(variant) if category == "skills" else
                  folders.get("archive_categories", {}).get(category))
        metadata = item.pop("observations")
        first = metadata[0]
        consistent = all(m == first for m in metadata)
        png = first["format"] == "PNG"
        sha = item["sha256"]
        reasons = []
        if not sha:
            reasons.append("current_bytes_not_verified")
        if item["corrupt"]:
            reasons.append("corrupt_or_incomplete_original")
        if not consistent:
            reasons.append("conflicting_byte_metadata")
        if not png:
            reasons.append("not_PNG_requires_separate_format_review")
        if not folder or not item["register_links"]:
            reasons.append("category_variant_or_register_link_unresolved")
        if not item["inbox_file_ids"]:
            reasons.append("no_byte_verified_inbox_counterpart")
        historical = all(s["system"] == "github_history" for s in item["sources"])
        duplicate = len(item["inbox_file_ids"]) > 1 or sum(s["system"] == "github" for s in item["sources"]) > 1
        status = ("corrupt" if item["corrupt"] else "not_verified" if not sha else
                  "historical_version" if historical else "duplicate" if duplicate else "verified_complete")
        candidate = not reasons
        item.update(**first, category=category, variant=variant,
                    asset_keys=[f"{kind}/{key}" for kind, key in kinds],
                    version_id=identity, historical_version=historical, duplicate=duplicate,
                    permanent_drive_file_id=None, target_folder_id=folder, archive_status=status,
                    copy_candidate=candidate, fresh_verification_required=True, verified_at=None,
                    evidence_observed_at=manifest.get("generated_at"),
                    evidence_provenance="MEDUSA; no KERBEROS source/archive download",
                    backup_requirement={"independent_account": True, "restore_byte_comparison": True,
                                        "same_Drive_account_accepted": False},
                    dependency_review={"status": "not_reviewed", "active_references": item["register_links"],
                                       "github_paths_may_be_pipeline_dependencies": item["github_paths"]},
                    blocking_issues=reasons + ["fresh_source_verification_required", "archive_readback_missing",
                        "independent_backup_missing", "restore_missing", "active_dependency_audit_missing",
                        "owner_cleanup_approval_missing"],
                    may_move=False, may_archive_now=False, safe_to_delete=False)
        item["cleanup_gate"] = cleanup_gate(item)
        item["register_links"] = sorted({canonical(v).decode(): v for v in item["register_links"]}.values(), key=canonical)
        item["sources"].sort(key=lambda s: (s["system"], s["identity"]))
        for key in ("inbox_file_ids", "github_paths"):
            item[key] = sorted(set(item[key]))
        for key in item["asset_keys"]:
            by_asset[key].append(identity)
        items.append(item)
    for item in items:
        item["related_versions"] = sorted({v for key in item["asset_keys"] for v in by_asset[key] if v != item["identity"]})
    return {"schema": "kerberos-archive-plan/v1", "mode": "simulation_only", "manifest_sha256": digest(canonical(manifest)),
            "folder_registry_sha256": digest(canonical(folders)), "source_inventory_at": manifest.get("generated_at"),
            "archive_root_folder_id": folders["folders"]["original_archive"],
            "summary": {"unique_plan_entries": len(items), "source_records": sum(len(i["sources"]) for i in items),
                        "copy_candidates_after_fresh_verification": sum(i["copy_candidate"] for i in items),
                        "safely_archived_originals": 0, "may_move": 0, "safe_to_delete": 0,
                        "statuses": dict(sorted(Counter(i["archive_status"] for i in items).items()))},
            "items": items}


def load_json(path):
    return json.loads(Path(path).read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    plan = sub.add_parser("plan")
    plan.add_argument("--manifest", required=True, type=Path)
    plan.add_argument("--folders", type=Path, default=ROOT / "config/hermes-drive-folders.json")
    plan.add_argument("--output", type=Path, required=True)
    check = sub.add_parser("verify-local")
    check.add_argument("--file", required=True, type=Path)
    for command in (check,):
        command.add_argument("--sha256", required=True)
        command.add_argument("--size", type=int, required=True)
        command.add_argument("--output", type=Path, required=True)
    drill = sub.add_parser("simulate")
    drill.add_argument("--file", required=True, type=Path)
    drill.add_argument("--descriptor", required=True, type=Path)
    drill.add_argument("--sandbox", required=True, type=Path)
    drill.add_argument("--capability", required=True)
    drill.add_argument("--output", required=True, type=Path)
    storage = sub.add_parser("verify-supabase")
    storage.add_argument("--ticket-file", required=True, type=Path)
    storage.add_argument("--descriptor", required=True, type=Path)
    storage.add_argument("--output", required=True, type=Path)
    drive = sub.add_parser("verify-drive")
    drive.add_argument("--descriptor", required=True, type=Path)
    drive.add_argument("--output", required=True, type=Path)
    restore = sub.add_parser("restore-test")
    restore.add_argument("--file", required=True, type=Path)
    restore.add_argument("--backup", required=True, type=Path)
    restore.add_argument("--descriptor", required=True, type=Path)
    restore.add_argument("--output", required=True, type=Path)
    register = sub.add_parser("register-readback")
    register.add_argument("--file", required=True, type=Path)
    register.add_argument("--descriptor", required=True, type=Path)
    register.add_argument("--registry", required=True, type=Path)
    register.add_argument("--output", required=True, type=Path)
    gate = sub.add_parser("check-cleanup-gates")
    gate.add_argument("--file", required=True, type=Path)
    gate.add_argument("--descriptor", required=True, type=Path)
    gate.add_argument("--backup", required=True, type=Path)
    gate.add_argument("--governance", required=True, type=Path)
    gate.add_argument("--output", required=True, type=Path)
    export = sub.add_parser("export-backup")
    export.add_argument("--file", required=True, type=Path)
    export.add_argument("--descriptor", required=True, type=Path)
    export.add_argument("--destination", required=True, type=Path)
    export.add_argument("--enable-backup-export", action="store_true")
    export.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "plan":
            report = build_plan(load_json(args.manifest), load_json(args.folders))
        elif args.command == "verify-local":
            _, report = read_local(args.file, args.sha256, args.size)
        elif args.command == "simulate":
            report = simulate(args.file, load_json(args.descriptor), Sandbox(args.sandbox, args.capability))
        else:
            desc = load_json(args.descriptor)
            if args.command == "verify-supabase":
                # Restrict bearer capabilities to owner-readable local files.
                if args.ticket_file.is_symlink() or args.ticket_file.stat().st_mode & 0o077:
                    raise Blocked("CAPABILITY_FILE_MUST_BE_PRIVATE")
                _, report = read_supabase(load_json(args.ticket_file), desc["object_path"], desc["sha256"], desc["size_bytes"])
            elif args.command == "verify-drive":
                _, report = read_drive(desc["drive_file_id"], desc["folder_id"], desc["sha256"], desc["size_bytes"])
            elif args.command == "register-readback":
                report = register_archive(args.file, desc, load_json(args.registry))
            elif args.command == "check-cleanup-gates":
                report = evaluate_cleanup(args.file, desc, args.backup, desc["backup_identity"], load_json(args.governance))
            elif args.command == "export-backup":
                report = export_backup(args.file, desc, args.destination, args.enable_backup_export)
            else:
                report = restore_backup(args.file, args.backup, desc["sha256"], desc["size_bytes"], desc["backup_identity"])
        create_json(args.output, report)
        print(json.dumps({"status": "report_created", "production_original_writes": 0, "safe_to_delete": False}))
    except Blocked as error:
        parser.exit(2, f"KERBEROS_BLOCKED:{error}\n")
    except Exception:
        parser.exit(2, "KERBEROS_BLOCKED:INVALID_INPUT_OR_IO\n")


if __name__ == "__main__":
    main()
