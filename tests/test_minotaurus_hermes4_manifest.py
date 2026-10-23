import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))
from hermes4_manifest_to_queue import build_requests


def sample_manifest():
    records = []
    for i, key in enumerate(("beskyddare", "snabbvax", "forandra", "tala-med-dod", "vindkontroll")):
        records.append({
            "spell_name": key.upper(),
            "spell_id": f"spell-{i}",
            "spell_key": key,
            "image_type": "spell-cutout",
            "source_drive_archive_id": f"archiveFile{i:012d}",
            "source_drive_inbox_id": f"inboxFile{i:012d}",
            "source_sha256": f"{i + 1:064x}",
            "source_bytes": 2_000_000,
            "derivative_sha256": f"{i + 11:064x}",
            "derivative_bytes": 350_000,
            "dimensions": {"width": 1024, "height": 1024},
            "mime_type": "image/webp",
            "alpha_channel_verified": True,
            "storage_uploaded": False,
            "quality_status": "validated_and_drive_staged_pending_supabase",
            "active_cutout_reference_changed": False,
        })
    return {
        "project": "Alea Crusaders",
        "schema_version": "1.0",
        "contract": {
            "derivative_format": "WebP with alpha",
            "github_media": "none",
            "active_references_changed": False,
        },
        "records": records,
    }


class ManifestAdapterTests(unittest.TestCase):
    def test_five_records_become_native_pilot_queue_requests(self):
        result = build_requests(sample_manifest())
        self.assertEqual(len(result), 5)
        first = result["hermes/queue/cutout-pilot-beskyddare-000000000000.json"]
        self.assertEqual(first, {
            "schema": 1, "kind": "spell-cutout", "target_key": "beskyddare",
            "drive_file_id": "inboxFile000000000000", "source_sha256": f"{1:064x}",
            "mode": "pilot",
        })
        self.assertTrue(all(request["mode"] == "pilot" for request in result.values()))
        self.assertTrue(all(request["kind"] == "spell-cutout" for request in result.values()))

    def test_refuses_incomplete_or_unsafe_manifest(self):
        for mutate in (
            lambda m: m["records"].pop(),
            lambda m: m["records"][0].update(storage_uploaded=True),
            lambda m: m["records"][0].update(source_sha256="not-a-hash"),
            lambda m: m["records"][1].update(spell_key=m["records"][0]["spell_key"]),
            lambda m: m["contract"].update(github_media="originals"),
            lambda m: m["records"][0].update(alpha_channel_verified=False),
        ):
            manifest = copy.deepcopy(sample_manifest())
            mutate(manifest)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                build_requests(manifest)


if __name__ == "__main__":
    unittest.main()
