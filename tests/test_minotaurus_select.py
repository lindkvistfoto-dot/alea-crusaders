import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from minotaurus_select import select


class MinotaurusSelection(unittest.TestCase):
    def test_unrelated_character_ui_does_not_select_hermes4_or_vitest(self):
        result = select(["features/ui/character-sheet.js"])
        self.assertFalse(result["hermes4_python"])
        self.assertEqual(result["vitest_files"], "")
        self.assertFalse(result["deno_hermes2"])

    def test_hermes4_changes_select_legacy_tests(self):
        result = select(["scripts/hermes_drive_intake.py"])
        self.assertTrue(result["hermes4_python"])
        self.assertIn("tests/hermes4-batch-publisher.test.mjs", result["vitest_files"])
        self.assertTrue(result["deno_hermes2"])

    def test_core_changes_do_not_select_legacy_minotaurus_tests(self):
        result = select(["features/hermes-core/core.js"])
        self.assertFalse(result["hermes4_python"])
        self.assertEqual(result["vitest_files"], "")

    def test_workflow_changes_force_full_relevant_vitest_selection(self):
        result = select([".github/workflows/minotaurus-guard.yml"])
        self.assertTrue(result["full"])
        self.assertIn("tests/hermes4-batch-publisher.test.mjs", result["vitest_files"])

    def test_shared_database_changes_select_all_relevant_suites(self):
        result = select(["supabase/migrations/20261027000000_change.sql"])
        self.assertTrue(result["hermes4_python"])
        self.assertIn("tests/hermes-v2-gates.test.mjs", result["vitest_files"])


if __name__ == "__main__":
    unittest.main()
