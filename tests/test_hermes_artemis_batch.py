"""Operation Artemis: isolate invalid source PNGs while preserving good batch assets."""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "hermes2_prepare.py"
spec = importlib.util.spec_from_file_location("hermes2_prepare_artemis_test", SCRIPT)
hermes = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(hermes)


class ArtemisBatchIsolationTest(unittest.TestCase):
    def test_invalid_image_does_not_block_valid_image(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "originals"
            output = Path(temporary) / "output"
            image = Image.new("RGBA", (640, 640), (0, 0, 0, 0))
            ImageDraw.Draw(image).rectangle((80, 80, 560, 560), fill=(200, 80, 40, 255))
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            payload = buffer.getvalue()
            sha = hashlib.sha256(payload).hexdigest()

            good = root / "spell" / "artemis-valid" / f"{sha}.png"
            bad = root / "spell" / "artemis-invalid" / ("0" * 64 + ".png")
            for path in (good, bad):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)

            with patch.object(hermes, "ROOT", root), patch.object(
                sys, "argv", [str(SCRIPT), "--output", str(output), "--source", str(good), "--source", str(bad)]
            ), contextlib.redirect_stdout(io.StringIO()):
                hermes.main()

            manifest = json.loads((output / "manifest.json").read_text())
            rejected = json.loads((output / "rejected.json").read_text())
            self.assertEqual([item["target_key"] for item in manifest["assets"]], ["artemis-valid"])
            self.assertEqual(len(rejected), 1)
            self.assertIn("artemis-invalid", rejected[0]["source"])
            self.assertIn("SHA-256 differs", rejected[0]["error"])
            self.assertTrue((output / manifest["assets"][0]["app_file"]).is_file())

    def test_all_invalid_images_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "originals"
            source = root / "spell" / "artemis-bad" / ("0" * 64 + ".png")
            source.parent.mkdir(parents=True)
            source.write_bytes(b"invalid PNG")
            with patch.object(hermes, "ROOT", root), patch.object(
                sys, "argv", [str(SCRIPT), "--output", str(Path(temporary) / "output"), "--source", str(source)]
            ), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit):
                    hermes.main()


if __name__ == "__main__":
    unittest.main()
