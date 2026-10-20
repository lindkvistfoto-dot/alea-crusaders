"""Synthetic bytes only. No credentials, production transfers or publisher calls."""
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("kerberos", ROOT / "scripts/kerberos_archive.py")
k = importlib.util.module_from_spec(spec)
spec.loader.exec_module(k)
FOLDERS = json.loads((ROOT / "config/hermes-drive-folders.json").read_text())


def png(mode="RGBA", color=(3, 40, 80, 128)):
    out = io.BytesIO()
    Image.new(mode, (8, 6), color).save(out, "PNG")
    return out.getvalue()


def descriptor(raw):
    sha = hashlib.sha256(raw).hexdigest()
    return {"sha256": sha, "size_bytes": len(raw), "drive_file_id": "synthetic-drive-id",
            "folder_id": FOLDERS["spell_types"]["icon"], "category": "spells", "variant": "icon",
            "register_links": [{"entity": "spells", "key": "synthetic", "field": "icon_path"}],
            "version_id": "sha256:" + sha, "inbox_file_id": "synthetic-inbox-id", "batch": "test-only"}


def manifest(raw):
    d = descriptor(raw)
    common = {"sha256_actual": d["sha256"], "size_bytes": len(raw), "format": "PNG", "mode": "RGBA",
              "dimensions": "8x6", "bytes_read": True, "integrity": "verified_image_decode"}
    path = "assets/hermes/originals/spell/synthetic/" + d["sha256"] + ".png"
    return {"generated_at": "2026-10-20T00:00:00Z", "drive_records": [
                {**common, "drive_file_id": "synthetic-drive-id", "mime_type": "image/png"}],
            "github_current_main_originals": [{**common, "path": path, "git_blob_sha": "a" * 40,
                     "database_reference_fields": d["register_links"]}],
            "github_historical_unique_blob_reads": [], "supabase_source_objects": []}


def archive_reader(raw):
    def read(file_id, folder_id, sha, size):
        return raw, {**k.verified(raw, sha, size), "drive_file_id": file_id, "folder_id": folder_id,
                     "readback": True, "system": "drive"}
    return read


class IntegrityTests(unittest.TestCase):
    def test_complete_png_actual_bytes_and_modes(self):
        for mode, color in (("RGBA", (1, 2, 3, 128)), ("RGB", (1, 2, 3)), ("P", 1)):
            raw = png(mode, color)
            r = k.verified(raw, k.digest(raw), len(raw))
            self.assertEqual((r["width"], r["height"], r["color_mode"]), (8, 6, mode))
            self.assertTrue(r["complete_decode"])

    def test_corrupt_crc_truncated_pixels_iend_and_trailing_bytes(self):
        raw = png()
        corrupt = bytearray(raw)
        corrupt[29] ^= 1
        for bad in (bytes(corrupt), raw[:45], raw[:-12], raw[:-1], raw + b"extra"):
            r = k.verify_png(bad, k.digest(bad), len(bad))
            self.assertEqual(r["status"], "corrupt")
            self.assertEqual(r["sha256"], k.digest(bad))

    def test_sha_or_size_mismatch_is_never_accepted_as_historical_version(self):
        raw = png()
        for sha, size in (("0" * 64, len(raw)), (k.digest(raw), len(raw) + 1)):
            self.assertEqual(k.verify_png(raw, sha, size)["status"], "identity_mismatch")

    def test_jpeg_is_not_a_png(self):
        out = io.BytesIO()
        Image.new("RGB", (8, 6)).save(out, "JPEG")
        raw = out.getvalue()
        self.assertEqual(k.verify_png(raw, k.digest(raw), len(raw))["status"], "corrupt")

    def test_permissive_decoder_and_unbounded_identities_blocked(self):
        raw = png()
        with patch.object(ImageFile, "LOAD_TRUNCATED_IMAGES", True), self.assertRaisesRegex(k.Blocked, "PERMISSIVE"):
            k.verify_png(raw, k.digest(raw), len(raw))
        for sha, size in (("bad", len(raw)), (k.digest(raw), k.MAX_BYTES + 1), (k.digest(raw), True)):
            with self.assertRaisesRegex(k.Blocked, "EXPECTED_IDENTITY"):
                k.verify_png(raw, sha, size)


class PlannerTests(unittest.TestCase):
    def test_determinism_and_all_deletion_and_movement_gates_closed(self):
        m = manifest(png())
        first = k.build_plan(m, FOLDERS)
        self.assertEqual(k.canonical(first), k.canonical(k.build_plan(m, FOLDERS)))
        item = first["items"][0]
        self.assertEqual(item["archive_status"], "verified_complete")
        self.assertTrue(item["copy_candidate"])
        for field in ("may_move", "may_archive_now", "safe_to_delete"):
            self.assertFalse(item[field])
        self.assertFalse(item["cleanup_gate"]["all_conditions_met"])
        self.assertIsNone(item["permanent_drive_file_id"])

    def test_duplicate_sources_one_content_entry_retains_all_ids(self):
        m = manifest(png())
        m["drive_records"].append({**m["drive_records"][0], "drive_file_id": "another-drive-id"})
        p = k.build_plan(m, FOLDERS)
        self.assertEqual(len(p["items"]), 1)
        self.assertEqual(p["items"][0]["archive_status"], "duplicate")
        self.assertEqual(len(p["items"][0]["inbox_file_ids"]), 2)

    def test_versions_are_distinct_and_related(self):
        m = manifest(png())
        other = manifest(png(color=(9, 9, 9, 9)))
        historical = other["github_current_main_originals"][0]
        m["github_historical_unique_blob_reads"].append(historical)
        p = k.build_plan(m, FOLDERS)
        self.assertEqual(len(p["items"]), 2)
        self.assertEqual(len(p["items"][0]["related_versions"]), 1)
        self.assertEqual(sum(i["historical_version"] for i in p["items"]), 1)

    def test_corrupt_history_and_unverified_storage_do_not_merge_by_job_hash(self):
        m = manifest(png())
        hist = {**m["github_current_main_originals"][0], "sha256_actual": "b" * 64,
                "integrity": "decode_error:OSError:Truncated File Read"}
        m["github_historical_unique_blob_reads"].append(hist)
        m["supabase_source_objects"] = [{"path": "spell/synthetic/a.png", "bucket": "alea-hermes-source",
                "hermes_recorded_sha256": k.digest(png()), "size_bytes": len(png())}]
        p = k.build_plan(m, FOLDERS)
        self.assertEqual(len(p["items"]), 3)
        self.assertEqual(p["summary"]["statuses"]["corrupt"], 1)
        self.assertEqual(p["summary"]["statuses"]["not_verified"], 1)

    def test_wrong_metadata_and_unknown_category_block_copy(self):
        m = manifest(png())
        m["drive_records"][0]["size_bytes"] += 1
        p = k.build_plan(m, FOLDERS)
        self.assertIn("conflicting_byte_metadata", p["items"][0]["blocking_issues"])
        self.assertFalse(p["items"][0]["copy_candidate"])
        m["github_current_main_originals"] = []
        self.assertIsNone(k.build_plan(m, FOLDERS)["items"][0]["target_folder_id"])


class TransferTests(unittest.TestCase):
    def ticket(self, raw):
        d = descriptor(raw)
        path = "spell/synthetic/a.png"
        return {"signed_url": k.SUPABASE_ORIGIN + "/storage/v1/object/sign/alea-hermes-source/" + path + "?token=synthetic",
                "object_path": path, "sha256": d["sha256"], "size_bytes": len(raw),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()}

    def test_missing_auth_does_not_attempt_network(self):
        raw = png()
        with patch.object(socket.socket, "connect", side_effect=AssertionError("NETWORK")):
            with self.assertRaisesRegex(k.Blocked, "AUTHENTICATION_REQUIRED"):
                k.read_supabase(None, "spell/x/a.png", k.digest(raw), len(raw))
            with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(k.Blocked, "AUTHENTICATION_REQUIRED"):
                k.read_drive("source-id", "parent-id", k.digest(raw), len(raw))

    def test_supabase_binary_get_and_credential_free_result(self):
        raw = png()
        t = self.ticket(raw)
        calls = []
        def fetch(url, limit):
            calls.append((url, limit))
            return raw
        data, report = k.read_supabase(t, t["object_path"], k.digest(raw), len(raw), fetch)
        self.assertEqual(data, raw)
        self.assertEqual(calls[0][1], len(raw))
        self.assertNotIn("signed_url", json.dumps(report))
        self.assertNotIn("token", json.dumps(report))

    def test_expired_wrong_object_host_bucket_or_hash_capability_never_fetches(self):
        raw = png()
        t = self.ticket(raw)
        variants = [{**t, "expires_at": "2000-01-01T00:00:00Z"},
                    {**t, "object_path": "spell/other/a.png"}, {**t, "sha256": "0" * 64},
                    {**t, "signed_url": t["signed_url"].replace("https://", "http://")},
                    {**t, "signed_url": t["signed_url"].replace("wbmosmkirsitkonejzpg", "attacker")},
                    {**t, "signed_url": t["signed_url"].replace("alea-hermes-source", "other")},
                    {**t, "signed_url": t["signed_url"] + "&extra=1"}]
        def forbidden(*args, **kwargs):
            self.fail("invalid capability attempted network")
        for ticket in variants:
            with self.assertRaisesRegex(k.Blocked, "CAPABILITY"):
                k.read_supabase(ticket, t["object_path"], k.digest(raw), len(raw), forbidden)

    def test_partial_or_changed_download_fails_verification(self):
        raw = png()
        t = self.ticket(raw)
        for bad in (raw[:-12], png(color=(1, 1, 1, 1))):
            with self.assertRaises(k.Blocked):
                k.read_supabase(t, t["object_path"], k.digest(raw), len(raw), lambda *a, **kw: bad)

    def test_drive_checks_actual_file_id_parent_then_reads_full_bytes(self):
        raw = png()
        d = descriptor(raw)
        def fetch(url, headers, limit):
            self.assertEqual(headers, {"Authorization": "Bearer synthetic"})
            return (raw if url.endswith("alt=media") else json.dumps({"id": d["drive_file_id"],
                    "parents": [d["folder_id"]], "size": str(len(raw)), "trashed": False, "mimeType": "image/png"}).encode())
        with patch.dict(os.environ, {"KERBEROS_DRIVE_READ_TOKEN": "synthetic"}):
            data, report = k.read_drive(d["drive_file_id"], d["folder_id"], k.digest(raw), len(raw), fetch)
            self.assertEqual(data, raw)
            self.assertTrue(report["readback"])
            with self.assertRaisesRegex(k.Blocked, "MISMATCH"):
                k.read_drive(d["drive_file_id"], "wrong-folder", k.digest(raw), len(raw), fetch)

    def test_metadata_alone_wrong_drive_id_and_bad_bytes_fail(self):
        raw = png()
        d = descriptor(raw)
        for wrong_id, media in ((True, raw), (False, raw[:-12])):
            def fetch(url, headers, limit):
                if url.endswith("alt=media"):
                    return media
                return json.dumps({"id": "wrong" if wrong_id else d["drive_file_id"], "parents": [d["folder_id"]],
                                   "size": len(raw), "mimeType": "image/png", "trashed": False}).encode()
            with patch.dict(os.environ, {"KERBEROS_DRIVE_READ_TOKEN": "synthetic"}), self.assertRaises(k.Blocked):
                k.read_drive(d["drive_file_id"], d["folder_id"], k.digest(raw), len(raw), fetch)

    def test_real_http_adapter_get_only_and_interruptions_redacted(self):
        class Response:
            status = 200
            headers = {"Content-Length": "1000"}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b"partial"
        class Opener:
            def open(inner, request, timeout):
                self.assertEqual(request.get_method(), "GET")
                return Response()
        with patch.object(k.urllib.request, "build_opener", return_value=Opener()), self.assertRaisesRegex(k.Blocked, "INCOMPLETE"):
            k.get_bytes("https://example.invalid?token=secret")
        class BrokenOpener:
            def open(self, request, timeout):
                raise OSError("secret signed URL or bearer token")
        with patch.object(k.urllib.request, "build_opener", return_value=BrokenOpener()):
            with self.assertRaises(k.Blocked) as error:
                k.get_bytes("https://example.invalid?token=secret")
            self.assertEqual(str(error.exception), "READ_FAILED_OR_INTERRUPTED")
        handler = k.NoRedirect()
        with self.assertRaisesRegex(k.Blocked, "REDIRECT"):
            handler.redirect_request(None, None, 302, "", {}, "https://attacker.invalid")


class ArchiveRestoreTests(unittest.TestCase):
    def setup_files(self, directory):
        root = Path(directory)
        raw = png()
        original = root / "source.png"
        original.write_bytes(raw)
        sandbox = root / "sandbox"
        sandbox.mkdir()
        (sandbox / ".kerberos-simulation.json").write_text(json.dumps({"simulation": True, "capability": "test"}))
        return raw, original, k.Sandbox(sandbox, "test")

    def test_export_backup_restore_and_idempotence_without_source_changes(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(socket.socket, "connect", side_effect=AssertionError("NETWORK")):
            raw, original, sandbox = self.setup_files(directory)
            first = k.simulate(original, descriptor(raw), sandbox)
            second = k.simulate(original, descriptor(raw), sandbox)
            self.assertTrue(first["restore"]["bytes_equal_original"])
            self.assertEqual(second["archive"]["write"], "already_present")
            self.assertEqual(second["backup"]["write"], "already_present")
            self.assertFalse(second["backup"]["independent_production_backup"])
            self.assertEqual(original.read_bytes(), raw)

    def test_independent_export_is_dry_by_default_then_reads_and_restores_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, _ = self.setup_files(directory)
            destination = Path(directory) / "external-test-mount"
            destination.mkdir()
            marker = destination / ".kerberos-backup-destination.json"
            marker.write_text(json.dumps({"provider": "offline_encrypted", "account": "test-custodian",
                "location": "synthetic-mount", "custodian": "test-owner", "provisioning_evidence": "synthetic-only"}))
            before = list(destination.iterdir())
            report = k.export_backup(original, descriptor(raw), destination)
            self.assertTrue(report["dry_run"])
            self.assertEqual(list(destination.iterdir()), before)
            report = k.export_backup(original, descriptor(raw), destination, True)
            self.assertTrue(report["export_verified"])
            self.assertTrue(report["restore_verified"])
            self.assertFalse(report["independence_verified"])
            again = k.export_backup(original, descriptor(raw), destination, True)
            self.assertTrue(again["restore_verified"])
            self.assertEqual(len(list(destination.glob("*.png"))), 1)

    def test_same_drive_backup_or_unprovisioned_destination_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, _ = self.setup_files(directory)
            dest = Path(directory) / "not-provisioned"
            with self.assertRaisesRegex(k.Blocked, "NOT_PROVISIONED"):
                k.export_backup(original, descriptor(raw), dest, True)
            dest.mkdir()
            (dest / ".kerberos-backup-destination.json").write_text(json.dumps({"provider": "google_drive"}))
            with self.assertRaisesRegex(k.Blocked, "PROVIDER_REQUIRED"):
                k.export_backup(original, descriptor(raw), dest, True)
            self.assertEqual(len(list(dest.iterdir())), 1)

    def test_interrupted_or_conflicting_export_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, sandbox = self.setup_files(directory)
            target = sandbox.path("independent-store/" + k.digest(raw) + ".png")
            target.parent.mkdir()
            target.write_bytes(raw[:20])
            with self.assertRaisesRegex(k.Blocked, "IMMUTABLE"):
                k.simulate(original, descriptor(raw), sandbox)
            self.assertEqual(target.read_bytes(), raw[:20])

    def test_backup_restore_detects_missing_or_changed_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, sandbox = self.setup_files(directory)
            backup = Path(directory) / "backup.png"
            identity = {"provider": "s3", "account": "separate", "object_id": "version-1", "location": "offline-test"}
            with self.assertRaisesRegex(k.Blocked, "MISSING"):
                k.restore_backup(original, backup, k.digest(raw), len(raw), identity)
            backup.write_bytes(png(color=(7, 7, 7, 7)))
            with self.assertRaisesRegex(k.Blocked, "MISMATCH"):
                k.restore_backup(original, backup, k.digest(raw), len(raw), identity)
            backup.write_bytes(raw)
            r = k.restore_backup(original, backup, k.digest(raw), len(raw), identity)
            self.assertTrue(r["bytes_equal_original"])
            self.assertFalse(r["independence_verified"])

    def test_capability_paths_symlinks_and_production_write_guards(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, sandbox = self.setup_files(directory)
            with self.assertRaisesRegex(k.Blocked, "CAPABILITY"):
                k.Sandbox(sandbox.root, "wrong")
            with self.assertRaisesRegex(k.Blocked, "ESCAPE"):
                sandbox.put("../source.png", b"bad")
            sandbox.path("linked").symlink_to(original)
            with self.assertRaisesRegex(k.Blocked, "ESCAPE"):
                sandbox.put("linked", b"bad")
            with self.assertRaisesRegex(k.Blocked, "UNSAFE"):
                k.create_json(ROOT / "config/never-written.json", {})
            path = Path(directory) / "report.json"
            k.create_json(path, {})
            with self.assertRaisesRegex(k.Blocked, "EXISTS"):
                k.create_json(path, {"overwrite": True})
            self.assertEqual(original.read_bytes(), raw)

    def test_registry_readback_and_versions_idempotence(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, _ = self.setup_files(directory)
            d = descriptor(raw)
            first = k.register_archive(original, d, {}, archive_reader(raw))
            second = k.register_archive(original, d, first, archive_reader(raw))
            self.assertEqual(len(second), 1)
            self.assertEqual(second[d["version_id"]]["archive_status"], "already_archived")
            with self.assertRaisesRegex(k.Blocked, "CONFLICT"):
                k.register_archive(original, {**d, "drive_file_id": "different-id"}, first, archive_reader(raw))
            with self.assertRaisesRegex(k.Blocked, "UNREGISTERED"):
                k.register_archive(original, {**d, "folder_id": FOLDERS["inbox_folder_id"]}, {}, archive_reader(raw))
            new = png(color=(8, 8, 8, 8))
            original.write_bytes(new)
            with self.assertRaisesRegex(k.Blocked, "REUSED"):
                k.register_archive(original, descriptor(new), first, archive_reader(new))
            third = k.register_archive(original, {**descriptor(new), "drive_file_id": "new-version-id"}, first, archive_reader(new))
            self.assertEqual(len(third), 2)

    def test_restore_cannot_use_source_as_backup_even_with_different_inventory_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, _ = self.setup_files(directory)
            identity = {"provider": "s3", "account": "other", "location": "test", "object_id": "version-1"}
            with self.assertRaisesRegex(k.Blocked, "SOURCE_FILE"):
                k.restore_backup(original, original, k.digest(raw), len(raw), identity)
            linked = Path(directory) / "hardlink.png"
            os.link(original, linked)
            with self.assertRaisesRegex(k.Blocked, "SOURCE_FILE"):
                k.restore_backup(original, linked, k.digest(raw), len(raw), identity)

    def test_cleanup_cannot_count_an_inbox_file_as_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, _ = self.setup_files(directory)
            d = {**descriptor(raw), "folder_id": FOLDERS["inbox_folder_id"]}
            with self.assertRaisesRegex(k.Blocked, "UNREGISTERED"):
                k.evaluate_cleanup(original, d, Path(directory) / "backup.png", {}, {}, archive_reader(raw))

    def test_cleanup_all_seven_gates_are_bound_to_current_version_and_still_no_deletion(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, _ = self.setup_files(directory)
            d = descriptor(raw)
            backup = Path(directory) / "external.png"
            backup.write_bytes(raw)
            identity = {"provider": "s3", "account": "other", "location": "test", "object_id": "version-1"}
            bound = {"sha256": d["sha256"], "drive_file_id": d["drive_file_id"], "version_id": d["version_id"],
                     "approved": True, "reviewer": "synthetic-owner", "evidence_reference": "test-evidence",
                     "reviewed_at": "2026-10-20T00:00:00Z", "active_references": [], "backup_identity": identity}
            names = ("independence", "dependencies", "restore_plan", "owner_cleanup")
            governance = {name: dict(bound) for name in names}
            r = k.evaluate_cleanup(original, d, backup, identity, governance, archive_reader(raw))
            self.assertTrue(r["all_conditions_met"])
            self.assertFalse(r["safe_to_delete"])
            for name in names:
                changed = {**governance, name: {**bound, "sha256": "0" * 64}}
                self.assertFalse(k.evaluate_cleanup(original, d, backup, identity, changed, archive_reader(raw))["all_conditions_met"])
            self.assertFalse(k.evaluate_cleanup(original, d, backup, {**identity, "provider": "google_drive"},
                                                governance, archive_reader(raw))["all_conditions_met"])

    def test_cli_cannot_overwrite_original_or_accept_unknown_write_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, original, _ = self.setup_files(directory)
            result = subprocess.run(["python", str(ROOT / "scripts/kerberos_archive.py"), "verify-local",
                "--file", str(original), "--sha256", k.digest(raw), "--size", str(len(raw)),
                "--output", str(original)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("UNSAFE_REPORT_DESTINATION", result.stderr)
            self.assertEqual(original.read_bytes(), raw)
            result = subprocess.run(["python", str(ROOT / "scripts/kerberos_archive.py"), "delete"], capture_output=True)
            self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
