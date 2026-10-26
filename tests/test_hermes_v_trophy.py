import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hermes_v_trophy", ROOT / "scripts/hermes_v_trophy.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class HermesVTrophyTest(unittest.TestCase):
    def test_three_pinned_approved_assets(self):
        keys = set()
        for color in module.COLORS:
            payload = module.request(color, "verify")
            self.assertEqual(payload["schema"], 4)
            self.assertEqual(len(payload["items"]), 1)
            item = payload["items"][0]
            self.assertTrue(item["visual_approved"])
            self.assertNotEqual(item["drive_file_id"], item["archive_file_id"])
            self.assertEqual(item["kind"], "system-asset")
            self.assertEqual(item["target_key"], "arcane-medal-display-" + color)
            self.assertEqual(len(item["source_sha256"]), 64)
            keys.add(item["target_id"])
        self.assertEqual(len(keys), 3)

    def test_rejects_unapproved_color_and_mode(self):
        for color, mode in (("purple", "publish"), ("red", "unsafe")):
            with self.assertRaises(ValueError):
                module.request(color, mode)

if __name__ == "__main__":
    unittest.main()
