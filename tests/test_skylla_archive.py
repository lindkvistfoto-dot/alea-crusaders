"""Synthetic SKYLLA protocol checks. No production writes or network credentials."""
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import skylla_archive as s
k = s.k
FOLDERS = k.load_json(ROOT / "config/hermes-drive-folders.json")
POLICY = k.load_json(ROOT / "config/skylla-fast-track-policy.json")


def fixture(color=3):
    stream = io.BytesIO()
    Image.new("RGBA", (8, 8), (color, 40, 70, 128)).save(stream, "PNG")
    raw = stream.getvalue()
    sha = k.digest(raw)
    return raw, {"bucket": s.BUCKET, "kind": "spell", "target_key": "synthetic",
                 "object_path": f"spell/synthetic/{sha}.png", "expected_sha256": sha,
                 "expected_size_bytes": len(raw), "inbox_file_id": f"synthetic-inbox-{color}",
                 "target_folder_id": FOLDERS["spell_types"]["icon"]}


class Drive:
    def __init__(self, raw, desc):
        self.data = {desc["inbox_file_id"]: raw}
        self.meta = {desc["inbox_file_id"]: {"id": desc["inbox_file_id"], "parents": [FOLDERS["inbox_folder_id"]],
                     "mimeType": "image/png", "size": str(len(raw)), "trashed": False}}
        self.names = {}
        self.copy_calls = 0

    def read(self, file_id):
        if file_id not in self.data: raise k.Blocked("MISSING_DRIVE_COPY")
        return self.data[file_id]

    def metadata(self, file_id): return self.meta[file_id]
    def find_exact(self, parent, name): return self.names.get((parent, name), [])
    def copy_new(self, source, parent, name):
        self.copy_calls += 1
        file_id = f"synthetic-archive-{self.copy_calls}"
        self.data[file_id] = self.data[source]
        self.meta[file_id] = {"id": file_id, "parents": [parent], "mimeType": "image/png",
                              "size": str(len(self.data[file_id])), "trashed": False}
        self.names[(parent, name)] = [file_id]
        return file_id


class SkyllaTests(unittest.TestCase):
    def test_restore_plan_is_a_machine_checked_gate(self):
        desc, drive, source, deps = self.proofs()
        deps.pop('restore_plan_sha256')
        report = s.eligibility(desc, drive, source, deps, POLICY)
        self.assertFalse(report['eligible_for_delete_proposal'])
        self.assertIn('documented_restore_plan_missing_or_changed', report['blocking_issues'])

    def proofs(self):
        raw, desc = fixture()
        backend = Drive(raw, desc)
        drive = s.archive_one(desc, FOLDERS, backend, True)
        source = {**k.verified(raw, desc["expected_sha256"], len(raw)), "system": "supabase",
                  "bucket": s.BUCKET, "object_path": desc["object_path"]}
        deps = {"status": "clear", "object_path": desc["object_path"], "active_consumers": [],
                "observed_at": k.now(), "evidence_reference": "synthetic-live-audit",
                "app_images_verified": True, "reference_paths_unchanged": True}
        deps.update({"restore_plan_reference": "docs/skylla/SKYLLA_ACCESS_AND_RESTORE.md",
                     "restore_plan_sha256": k.digest((ROOT / "docs/skylla/SKYLLA_ACCESS_AND_RESTORE.md").read_bytes())})
        return desc, drive, source, deps

    def test_complete_png_copy_readback_and_restore(self):
        raw, desc = fixture()
        backend = Drive(raw, desc)
        proof = s.archive_one(desc, FOLDERS, backend, True)
        restored = backend.read(proof["permanent_drive_file_id"])
        self.assertEqual(restored, raw)
        self.assertTrue(proof["archive_verification"]["complete_decode"])
        self.assertEqual(backend.read(desc["inbox_file_id"]), raw)

    def test_truncated_png_is_blocked_before_copy(self):
        raw, desc = fixture()
        backend = Drive(raw[:-12], desc)
        with self.assertRaisesRegex(k.Blocked, "CORRUPT"):
            s.archive_one(desc, FOLDERS, backend, True)
        self.assertEqual(backend.copy_calls, 0)

        wrong = {**desc, "kind": "spell-illustration-wide", "target_folder_id": FOLDERS["spell_types"]["wide"],
                 "object_path": "spell-illustration-wide/synthetic/" + desc["expected_sha256"] + ".png"}
        with self.assertRaisesRegex(k.Blocked, "CATEGORY_SHAPE"):
            s.archive_one(wrong, FOLDERS, Drive(raw, desc), True)

    def test_wrong_sha_is_rejected(self):
        raw, desc = fixture()
        other = {**desc, "expected_sha256": "0" * 64, "object_path": "spell/synthetic/" + "0" * 64 + ".png"}
        with self.assertRaisesRegex(k.Blocked, "IDENTITY_MISMATCH"):
            s.archive_one(other, FOLDERS, Drive(raw, desc), True)

    def test_missing_or_wrong_drive_copy(self):
        raw, desc = fixture()
        with self.assertRaisesRegex(k.Blocked, "PERMANENT"):
            s.pair_proof(raw, raw, desc, {"id": desc["inbox_file_id"]}, FOLDERS)
        class Missing(Drive):
            def copy_new(self, *args): return "missing-file-id"
        with self.assertRaisesRegex(k.Blocked, "MISSING_DRIVE"):
            s.archive_one(desc, FOLDERS, Missing(raw, desc), True)

    def test_wrong_category_never_copies(self):
        raw, desc = fixture()
        backend = Drive(raw, desc)
        with self.assertRaisesRegex(k.Blocked, "CATEGORY"):
            s.archive_one({**desc, "target_folder_id": FOLDERS["spell_types"]["wide"]}, FOLDERS, backend, True)
        self.assertEqual(backend.copy_calls, 0)

    def test_active_dependency_blocks_deletion_proposal(self):
        desc, drive, source, deps = self.proofs()
        deps["active_consumers"] = ["pending retry"]
        result = s.eligibility(desc, drive, source, deps, POLICY)
        self.assertFalse(result["eligible_for_delete_proposal"])
        self.assertFalse(result["safe_to_delete"])

    def test_interrupted_copy_is_not_automatically_retried(self):
        raw, desc = fixture()
        class Interrupted(Drive):
            def copy_new(self, *args):
                self.copy_calls += 1
                raise TimeoutError("secret provider response")
        backend = Interrupted(raw, desc)
        with self.assertRaisesRegex(k.Blocked, "RECONCILE"):
            s.archive_one(desc, FOLDERS, backend, True)
        self.assertEqual(backend.copy_calls, 1)

    def test_double_run_keeps_same_id_without_duplicate_copy(self):
        raw, desc = fixture()
        backend = Drive(raw, desc)
        first = s.archive_one(desc, FOLDERS, backend, True)
        second = s.archive_one(desc, FOLDERS, backend, True)
        self.assertEqual(first["permanent_drive_file_id"], second["permanent_drive_file_id"])
        self.assertEqual(backend.copy_calls, 1)

    def test_missing_auth_is_blocked_without_network(self):
        raw, desc = fixture()
        class NoAuth(Drive):
            def read(self, *args): raise k.Blocked("AUTHENTICATION_REQUIRED")
        with self.assertRaisesRegex(k.Blocked, "AUTHENTICATION"):
            s.archive_one(desc, FOLDERS, NoAuth(raw, desc), True)
        with self.assertRaisesRegex(k.Blocked, "AUTHENTICATION"):
            k.read_supabase(None, desc["object_path"], desc["expected_sha256"], len(raw))

    def test_partial_batch_records_every_result(self):
        raw, desc = fixture()
        bad_raw, bad = fixture(9)
        backend = Drive(raw, desc)
        backend.data[bad["inbox_file_id"]] = bad_raw[:-12]
        backend.meta[bad["inbox_file_id"]] = {**backend.meta[desc["inbox_file_id"]], "id": bad["inbox_file_id"]}
        result = s.archive_batch([bad, desc], FOLDERS, backend, True)
        self.assertEqual([r["status"] for r in result], ["blocked", "verified"])
        original_metadata = backend.metadata
        def failing_metadata(file_id):
            if file_id == bad["inbox_file_id"]:
                raise ValueError("provider response contains secret material")
            return original_metadata(file_id)
        with patch.object(backend, "metadata", side_effect=failing_metadata):
            result = s.archive_batch([bad, desc], FOLDERS, backend, True)
        self.assertEqual(result[0]["reason"], "UNEXPECTED_READ_OR_METADATA_FAILURE")
        self.assertEqual(result[1]["status"], "verified")

    def test_metadata_hashes_cannot_replace_current_storage_bytes(self):
        desc, drive, source, deps = self.proofs()
        for false_proof in (None, {"sha256": desc["expected_sha256"], "size_bytes": desc["expected_size_bytes"]}):
            self.assertFalse(s.eligibility(desc, drive, false_proof, deps, POLICY)["eligible_for_delete_proposal"])

    def test_policy_exception_is_source_only_and_still_needs_batch_approval(self):
        desc, drive, source, deps = self.proofs()
        result = s.eligibility(desc, drive, source, deps, POLICY)
        self.assertTrue(result["eligible_for_delete_proposal"])
        self.assertFalse(result["safe_to_delete"])
        self.assertEqual(result["deletion_status"], "awaiting_separate_batch_approval")
        result = s.eligibility({**desc, "bucket": "alea-hermes-public"}, drive, source, deps, POLICY)
        self.assertFalse(result["eligible_for_delete_proposal"])

    def test_copy_disabled_by_default_and_duplicate_ids_blocked(self):
        raw, desc = fixture()
        backend = Drive(raw, desc)
        with self.assertRaisesRegex(k.Blocked, "EXPLICIT_ENABLE"):
            s.archive_one(desc, FOLDERS, backend)
        backend.names[(desc["target_folder_id"], desc["expected_sha256"] + ".png")] = ["a", "b"]
        with self.assertRaisesRegex(k.Blocked, "MULTIPLE"):
            s.archive_one(desc, FOLDERS, backend, True)

    def test_stale_or_wrong_object_evidence_blocks_proposal(self):
        desc, drive, source, deps = self.proofs()
        for changes in ({"verified_at": "2000-01-01T00:00:00Z"}, {"object_path": "other/object.png"}):
            self.assertFalse(s.eligibility(desc, drive, {**source, **changes}, deps, POLICY)["eligible_for_delete_proposal"])

    def test_report_outputs_are_exclusive(self):
        with tempfile.TemporaryDirectory() as directory:
            s.write_manifest(directory, {"objects": []})
            with self.assertRaises(FileExistsError):
                s.write_manifest(directory, {"objects": []})

    def test_wrong_archive_parent_does_not_open_candidate_gate(self):
        desc, drive, source, deps = self.proofs()
        drive["target_folder_id"] = FOLDERS["inbox_folder_id"]
        self.assertFalse(s.eligibility(desc, drive, source, deps, POLICY)["eligible_for_delete_proposal"])

    def test_candidate_csv_never_contains_a_blocked_object(self):
        import csv
        with tempfile.TemporaryDirectory() as directory:
            rows = [{"bucket": s.BUCKET, "object_path": "blocked.png", "eligible_for_delete_proposal": False},
                    {"bucket": s.BUCKET, "object_path": "candidate.png", "eligible_for_delete_proposal": True,
                     "safe_to_delete": False}]
            s.write_manifest(directory, {"objects": rows})
            with (Path(directory) / "SKYLLA_DELETE_CANDIDATES.csv").open() as stream:
                result = list(csv.DictReader(stream))
            self.assertEqual([r["object_path"] for r in result], ["candidate.png"])
            self.assertEqual(result[0]["safe_to_delete"], "False")

    def test_unverified_private_display_image_blocks_proposal(self):
        desc, drive, source, deps = self.proofs()
        deps["app_images_verified"] = False
        self.assertFalse(s.eligibility(desc, drive, source, deps, POLICY)["eligible_for_delete_proposal"])

    def test_concrete_copy_journal_prevents_second_remote_creation(self):
        raw, desc = fixture()
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"SKYLLA_DRIVE_TOKEN": "synthetic"}):
            api = s.DriveAPI(directory, True)
            with patch.object(api, "request", return_value=b'{"id":"synthetic-archive-id"}') as request:
                first = api.copy_new(desc["inbox_file_id"], desc["target_folder_id"], desc["expected_sha256"] + ".png")
                self.assertEqual(first, "synthetic-archive-id")
                with self.assertRaisesRegex(k.Blocked, "RECONCILE"):
                    api.copy_new(desc["inbox_file_id"], desc["target_folder_id"], desc["expected_sha256"] + ".png")
                self.assertEqual(request.call_count, 1)

    def test_concrete_adapter_auth_and_write_scope_fail_closed(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(k.Blocked, "AUTHENTICATION"):
            s.DriveAPI('/tmp/synthetic-journal')
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"SKYLLA_DRIVE_TOKEN": "synthetic"}):
            api = s.DriveAPI(directory, True)
            with self.assertRaisesRegex(k.Blocked, "WRITE_FORBIDDEN"):
                api.request('files/other-id?alt=media', {"overwrite": True})


if __name__ == "__main__":
    unittest.main()
