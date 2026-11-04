import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from minotaurus_select import select


(unittest.TestCase):
    def test_plain_ui_change_skips_legacy_hermes_environments(self):
        result = select(["features/ui/character-sheet.js"])
        self.assertFalse(result["full"])
        self.assertFalse(result["hermes4_python"])
        self.assertEqual(result["vitest_files"], "")
        self.assertFalse(result["deno_hermes2"])
        self.assertFalse(result["deno_hermes_v2"])

    def test_hermes_change_selects_only_legacy_groups(self):
        result = select(["scripts/hermes_drive_intake.py"])
        self.assertTrue(result["hermes4_python"])
        self.assertIn("tests/hermes4-batch-publisher.test.mjs", result["vitest_files"])
        self.assertFalse(result["deno_hermes_v2"])

    def test_hermes2_change_selects_v2_gate(self):
        result = select(["features/combat/hermes2.js"])
        self.assertIn("tests/hermes-v2-gates.test.mjs", result["vitest_files"])
        self.assertFalse(result["hermes4_python"])

    def test_shared_database_change_selects_every_focused_suite(self):
        result = select(["supabase/migrations/change.sql"])
        self.assertTrue(result["full"])
        self.assertEqual(set(result["vitest_files"].split()), {
            "tests/minotaurus-publisher.test.mjs",
            "tests/hermes4-batch-publisher.test.mjs",
            "tests/hermes-system-assets-publisher.test.mjs",
            "tests/hermes-wide-publisher.test.mjs",
            "tests/hermes-spell-cutout-profile.test.js",
            "tests/arcane-paper-doll-assets.test.js",
            "tests/arcane-system-assets-rls.test.mjs",
            "tests/arcane-gallery-release-smoke.test.js",
            "tests/arcane-morph-art-assets.test.js",
            "tests/hermes-v2-gates.test.mjs",
        })

    def test_workflow_change_selects_all_and_configures_fallback(self):
        result = select([".github/workflows/minotaurus-guard.yml"])
        self.assertTrue(result["full"])
        self.assertTrue(result["hermes4_python"])
        self.assertTrue(result["deno_hermes_v2"])

    def test_unknown_path_falls_back_to_full(self):
        self.assertTrue(select(["new/unclassified/file.txt"])["full"])



if __name__ == "__main__":
    unittest.main()
