import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.hermes_core_prepare import prepare, valid_core_target_id
from scripts.hermes_system_assets import system_asset
from scripts.hermes_core_workflow_paths import route_changed_paths

class CoreImageProfileTests(unittest.TestCase):
    def test_uppercase_arcane_map_system_asset_keys_are_supported(self):
        keys = [
            "ARCANE_MAP_ICON_HIDDEN",
            "ARCANE_MAP_ICON_ITEM",
            "ARCANE_MAP_ICON_NPC",
            "ARCANE_MAP_ICON_TRAP",
            "ARCANE_MAP_ICON_EVENT",
            "ARCANE_MAP_ICON_ENEMY",
        ]
        for key in keys:
            with self.subTest(key=key):
                self.assertTrue(valid_core_target_id("system", "unrestricted-system", key))
                self.assertIsNotNone(system_asset(key))
        self.assertFalse(valid_core_target_id("system", "unrestricted-system", "ARCANE-MAP-ICON"))

    def test_app_profiles_accept_only_the_declared_target_key_shape(self):
        self.assertTrue(valid_core_target_id("app-image", "campaign-map", "123e4567-e89b-42d3-a456-426614174000"))
        self.assertTrue(valid_core_target_id("app-image", "projectile-art", "arrow"))
        self.assertTrue(valid_core_target_id("app-image", "projectile-art", "hermes_dev_test_universal_core"))
        self.assertFalse(valid_core_target_id("app-image", "projectile-art", "123e4567-e89b-42d3-a456-426614174000"))
        self.assertFalse(valid_core_target_id("app-image", "campaign-map", "not-a-uuid"))

    def test_unrestricted_profile_preserves_real_alpha_without_category_rules(self):
        image = Image.new("RGBA", (24, 12), (40, 80, 120, 255))
        image.putpixel((0, 0), (40, 80, 120, 0))
        source = io.BytesIO()
        image.save(source, "PNG")
        with tempfile.TemporaryDirectory() as directory:
            result = prepare(source.getvalue(), Path(directory), "unrestricted-system")
            with Image.open(Path(directory) / result["webp_file"]) as webp:
                self.assertEqual(webp.format, "WEBP")
                self.assertEqual(webp.convert("RGBA").getpixel((0, 0))[3], 0)
            self.assertTrue(result["alpha_preserved"])
            self.assertEqual((result["width"], result["height"]), (24, 12))


    def test_private_portrait_applies_exif_orientation_and_keeps_private_profile_dimensions(self):
        image = Image.new("RGB", (1200, 800), (70, 90, 110))
        exif = Image.Exif()
        exif[274] = 6
        source = io.BytesIO()
        image.save(source, "JPEG", quality=90, exif=exif)
        with tempfile.TemporaryDirectory() as directory:
            result = prepare(source.getvalue(), Path(directory), "npc-portrait-private")
            self.assertEqual((result["width"], result["height"]), (800, 1200))
            self.assertFalse(result["alpha_preserved"])
            self.assertLessEqual(result["source_bytes"], 8_388_608)

    def test_opaque_square_profile_enforces_its_unique_policy(self):
        image = Image.new("RGB", (640, 640), (40, 80, 120))
        source = io.BytesIO()
        image.save(source, "PNG")
        with tempfile.TemporaryDirectory() as directory:
            result = prepare(source.getvalue(), Path(directory), "skill-illustration-square")
            self.assertFalse(result["alpha_preserved"])
            self.assertEqual((result["width"], result["height"]), (640, 640))

class CoreWorkflowRoutingTests(unittest.TestCase):
    def test_dev_queue_request_selects_publish_only(self):
        routes = route_changed_paths(["hermes/core/queue/dev/submit-test.json"])
        self.assertEqual(routes, {"publish": True, "asset_cleanup": False})

    def test_dev_cleanup_request_selects_cleanup_only(self):
        routes = route_changed_paths(["hermes/core/cleanup/dev/cleanup-test.json"])
        self.assertEqual(routes, {"publish": False, "asset_cleanup": True})

    def test_unrelated_paths_select_neither_job(self):
        routes = route_changed_paths(["features/hermes-core/asset-cleanup.js"])
        self.assertEqual(routes, {"publish": False, "asset_cleanup": False})

    def test_mixed_push_routes_each_request_to_its_own_job(self):
        routes = route_changed_paths([
            "hermes/core/queue/dev/submit-test.json",
            "hermes/core/cleanup/dev/cleanup-test.json",
        ])
        self.assertEqual(routes, {"publish": True, "asset_cleanup": True})

    def test_workflow_routes_from_git_diff_outputs(self):
        workflow_path = Path(__file__).resolve().parents[1] / ".github/workflows/hermes-core-publish-dev.yml"
        workflow = workflow_path.read_text(encoding="utf-8")
        self.assertNotIn("github.event.commits", workflow)
        self.assertIn("git diff --name-only --diff-filter=AM", workflow)
        self.assertIn("needs.detect-changed-requests.outputs.publish == 'true'", workflow)
        self.assertIn("needs.detect-changed-requests.outputs.asset_cleanup == 'true'", workflow)
        self.assertIn("      - 'hermes/core/queue/dev/**'", workflow)
        self.assertIn("      - 'hermes/core/cleanup/dev/**'", workflow)


if __name__ == "__main__":
    unittest.main()
