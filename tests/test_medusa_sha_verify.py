"""Small synthetic fixtures: exact bytes, damaged PNGs and fail-closed evidence."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("medusa", ROOT / "scripts/medusa_sha_verify.py")
medusa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(medusa)


def png(mode="RGBA", color=(12, 35, 60, 128)):
    stream = io.BytesIO()
    Image.new(mode, (8, 6), color).save(stream, "PNG")
    return stream.getvalue()


class IntegrityTests(unittest.TestCase):
    def test_complete_png_hash_size_dimensions_and_mode(self):
        raw = png()
        result = medusa.inspect_bytes(raw, hashlib.sha256(raw).hexdigest(), len(raw), True)
        self.assertEqual(result["verification_status"], "verified_identical_copy")
        self.assertEqual((result["width"], result["height"], result["color_mode"]), (8, 6, "RGBA"))
        self.assertEqual(result["bytes_read"], len(raw))

    def test_rgb_and_palette_are_valid_originals(self):
        for mode, color in (("RGB", (1, 2, 3)), ("P", 1)):
            result = medusa.inspect_bytes(png(mode, color), require_png=True)
            self.assertEqual(result["integrity_result"], "valid")
            self.assertEqual(result["color_mode"], mode)

    def test_corrupt_crc_and_truncated_pixels_and_missing_iend(self):
        raw = png()
        damaged = bytearray(raw)
        damaged[29] ^= 1
        for data in (bytes(damaged), raw[:45], raw[:-12], raw[:-1], raw + b"trailing"):
            result = medusa.inspect_bytes(data, require_png=True)
            self.assertEqual(result["integrity_result"], "corrupt_original")
            self.assertEqual(result["content_sha256"], hashlib.sha256(data).hexdigest())

    def test_valid_hash_or_size_mismatch_is_another_valid_version(self):
        raw = png()
        for digest, size in (("0" * 64, len(raw)), (hashlib.sha256(raw).hexdigest(), len(raw) + 1)):
            result = medusa.inspect_bytes(raw, digest, size, True)
            self.assertEqual(result["verification_status"], "different_valid_version")
            self.assertEqual(result["integrity_result"], "valid")

    def test_wrong_format_cannot_pass_as_png(self):
        stream = io.BytesIO()
        Image.new("RGB", (8, 6)).save(stream, "JPEG")
        self.assertEqual(medusa.inspect_bytes(stream.getvalue(), require_png=True)["integrity_result"],
                         "corrupt_original")

    def test_zip_and_member_decode(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("image.png", png())
        result = medusa.inspect_bytes(stream.getvalue())
        self.assertEqual(result["integrity_result"], "valid")
        self.assertEqual(len(result["image_members"]), 1)
        self.assertEqual(medusa.inspect_bytes(stream.getvalue()[:-10])["integrity_result"], "corrupt_original")


class EvidenceTests(unittest.TestCase):
    def fixture(self):
        raw = png()
        sha = hashlib.sha256(raw).hexdigest()
        manifest = {"drive_records": [{"drive_file_id": "drive-test", "bytes_read": True,
                     "sha256_actual": sha, "size_bytes": len(raw), "integrity": "verified_image_decode"}],
                    "supabase_source_objects": [{"path": "spell/test/a.png", "size_bytes": len(raw),
                     "hermes_recorded_sha256": sha}]}
        metadata = {"rows": [{"object_path": "spell/test/a.png", "recorded_sha256": sha,
                     "recorded_bytes": len(raw), "storage_metadata_bytes": len(raw), "job_id": "job-test"}]}
        return manifest, metadata

    def test_historical_hash_and_size_never_establish_current_storage_identity(self):
        manifest, metadata = self.fixture()
        row = medusa.source_rows(manifest, metadata, [], "2026-10-20T00:00:00Z")[0]
        self.assertEqual(row["drive_file_id"], "drive-test")
        self.assertIsNone(row["supabase_content_sha256"])
        self.assertIsNone(row["source_bytes"])
        self.assertEqual(row["verification_status"], "not_verified")

    def test_unverified_drive_hash_is_not_used(self):
        manifest, metadata = self.fixture()
        manifest["drive_records"][0]["bytes_read"] = False
        row = medusa.source_rows(manifest, metadata, [], "now")[0]
        self.assertIsNone(row["drive_sha256"])
        self.assertIn("no_verified_Drive_counterpart", row["discrepancy"])

    def test_size_match_alone_does_not_match_drive(self):
        manifest, metadata = self.fixture()
        manifest["drive_records"][0]["sha256_actual"] = "0" * 64
        self.assertIsNone(medusa.source_rows(manifest, metadata, [], "now")[0]["drive_file_id"])

    def test_missing_new_or_duplicate_metadata_fail_closed(self):
        manifest, metadata = self.fixture()
        for rows in ([], metadata["rows"] * 2, [{**metadata["rows"][0], "object_path": "different"}]):
            with self.assertRaisesRegex(ValueError, "SOURCE_METADATA_SET"):
                medusa.source_rows(manifest, {"rows": rows}, [], "now")

    def test_metadata_drift_is_reported(self):
        manifest, metadata = self.fixture()
        metadata["rows"][0]["storage_metadata_bytes"] += 1
        row = medusa.source_rows(manifest, metadata, [], "now")[0]
        self.assertFalse(row["metadata_matches_medusa"])
        self.assertEqual(row["verification_status"], "not_verified")

    def test_missing_git_file_and_actual_git_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["git", "init", "--object-format=sha1", directory], check=True, capture_output=True)
            raw = png()
            oid = subprocess.check_output(["git", "-C", directory, "hash-object", "-w", "--stdin"], input=raw).decode().strip()
            self.assertEqual(medusa.read_git_blob(directory, oid, "sha1"), raw)
            self.assertNotEqual(oid, hashlib.sha256(raw).hexdigest())
            self.assertIsNone(medusa.read_git_blob(directory, "0" * 40, "sha1"))
            with self.assertRaisesRegex(ValueError, "INVALID_GIT_OBJECT_ID"):
                medusa.read_git_blob(directory, "--unsafe", "sha1")

    def test_sha256_git_object_id_still_differs_from_file_sha256(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["git", "init", "--object-format=sha256", directory], check=True, capture_output=True)
            raw = png()
            oid = subprocess.check_output(["git", "-C", directory, "hash-object", "-w", "--stdin"], input=raw).decode().strip()
            self.assertEqual(medusa.read_git_blob(directory, oid, "sha256"), raw)
            self.assertNotEqual(oid, hashlib.sha256(raw).hexdigest())

    def test_end_to_end_offline_git_and_manifest_keep_storage_unverified(self):
        manifest, metadata = self.fixture()
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            subprocess.run(["git", "init", "--object-format=sha1", str(repo)], check=True, capture_output=True)
            raw = png()
            sha = hashlib.sha256(raw).hexdigest()
            path = f"assets/hermes/originals/spell/test/{sha}.png"
            original = repo / path
            original.parent.mkdir(parents=True)
            original.write_bytes(raw)
            subprocess.run(["git", "-C", str(repo), "add", path], check=True)
            subprocess.run(["git", "-C", str(repo), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                            "commit", "-m", "Synthetic fixture"], check=True, capture_output=True)
            baseline = medusa.git(repo, "rev-parse", "HEAD").decode().strip()
            oid = medusa.git(repo, "rev-parse", f"HEAD:{path}").decode().strip()
            entry = {"path": path, "git_blob_sha": oid, "sha256_actual": sha, "size_bytes": len(raw)}
            manifest.update(github={"main_commit_sha": baseline,
                                    "tree_sha": medusa.git(repo, "rev-parse", "HEAD^{tree}").decode().strip()},
                            github_current_main_originals=[entry], github_other_image_assets=[],
                            github_historical_unique_blob_reads=[], github_history_change_records=[entry],
                            drive_duplicate_sha256_groups=[])
            metadata["observed_at"] = "2026-10-20T00:00:00Z"
            mp, sp = Path(directory) / "manifest.json", Path(directory) / "metadata.json"
            mp.write_text(json.dumps(manifest))
            sp.write_text(json.dumps(metadata))
            with patch.object(socket.socket, "connect", side_effect=AssertionError("NETWORK_FORBIDDEN")):
                report = medusa.build(mp, sp, repo)
                medusa.write_reports(report, Path(directory) / "reports")
            self.assertEqual(report["summary"]["supabase_byte_verified"], 0)
            self.assertEqual(report["summary"]["github_current_matching_medusa_drive"], 1)
            self.assertIsNone(report["source_objects"][0]["supabase_content_sha256"])
            self.assertEqual(original.read_bytes(), raw)
            self.assertEqual(medusa.git(repo, "rev-parse", "HEAD").decode().strip(), baseline)
            self.assertEqual(medusa.git(repo, "status", "--porcelain"), b"")
            self.assertTrue(all(not c["safe_to_delete"] for c in report["cleanup_candidates"]))

    def test_no_network_or_storage_writes_and_only_designated_report_outputs(self):
        manifest, metadata = self.fixture()
        with tempfile.TemporaryDirectory() as directory, patch.object(
                socket.socket, "connect", side_effect=AssertionError("NETWORK_FORBIDDEN")):
            original = Path(directory) / "original.png"
            original.write_bytes(png())
            before = original.read_bytes()
            source = medusa.source_rows(manifest, metadata, [], "now")
            medusa.inspect_bytes(before, require_png=True)
            output = Path(directory) / "reports"
            medusa.write_reports({"source_objects": source, "cleanup_candidates": []}, output)
            self.assertEqual(original.read_bytes(), before)
            self.assertEqual({p.name for p in output.iterdir()}, {
                "MEDUSA_SHA_VERIFICATION.json", "MEDUSA_SHA_VERIFICATION.csv", "MEDUSA_SHA_CLEANUP_CANDIDATES.csv"})
            text = (ROOT / "scripts/medusa_sha_verify.py").read_text()
            for forbidden in ("import requests", "import urllib", "create_client(", "createClient(",
                              ".storage.", "SUPABASE_SERVICE_ROLE_KEY", "workflow_dispatch"):
                self.assertNotIn(forbidden, text)
            self.assertEqual(medusa.GIT_ENV["GIT_NO_LAZY_FETCH"], "1")


if __name__ == "__main__":
    unittest.main()
