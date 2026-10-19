"""HERMES spell-cutout validation and alpha-preserving optimization tests."""
import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]


def load_module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, REPO_ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def transparent_png(size=(1024, 1024)):
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    opaque = Image.new("RGBA", (size[0] - 200, size[1] - 200), (255, 156, 32, 255))
    image.paste(opaque, (100, 100))
    output = io.BytesIO()
    image.save(output, "PNG")
    return image, output.getvalue()


class SpellCutoutHermesTests(unittest.TestCase):
    def test_drive_intake_requires_square_rgba_with_real_transparency(self):
        intake = load_module("spell_cutout_intake", "scripts/hermes_drive_intake.py")
        _, raw = transparent_png()
        self.assertEqual(intake.validate_png(raw, "spell-cutout", "stenvagg"), hashlib.sha256(raw).hexdigest())

        opaque = Image.new("RGBA", (1024, 1024), (255, 156, 32, 255))
        output = io.BytesIO()
        opaque.save(output, "PNG")
        with self.assertRaisesRegex(ValueError, "INVALID_ALPHA"):
            intake.validate_png(output.getvalue(), "spell-cutout", "stenvagg")

        _, too_small = transparent_png((512, 512))
        with self.assertRaisesRegex(ValueError, "BAD_PNG_DIMENSIONS"):
            intake.validate_png(too_small, "spell-cutout", "bad-size")

    def test_prepare_publishes_640_webp_and_preserves_the_alpha_plane(self):
        pipeline = load_module("spell_cutout_prepare", "scripts/hermes2_prepare.py")
        with tempfile.TemporaryDirectory(prefix="hermes-spell-cutout-") as directory:
            root = Path(directory) / "assets" / "hermes" / "originals"
            output_root = Path(directory) / "prepared"
            pipeline.ROOT = root
            image, raw = transparent_png()
            digest = hashlib.sha256(raw).hexdigest()
            source = root / "spell-cutout" / "stenvagg" / f"{digest}.png"
            source.parent.mkdir(parents=True)
            source.write_bytes(raw)

            manifest = pipeline.prepare(source, output_root)
            self.assertEqual(manifest["kind"], "spell-cutout")
            self.assertEqual((manifest["width"], manifest["height"]), (640, 640))
            self.assertTrue(manifest["alpha_preserved"])
            app = output_root / manifest["app_file"]
            with Image.open(app) as rendered:
                self.assertEqual(rendered.format, "WEBP")
                self.assertEqual(rendered.size, (640, 640))
                expected = image.getchannel("A").resize((640, 640), Image.Resampling.LANCZOS)
                self.assertEqual(rendered.convert("RGBA").getchannel("A").tobytes(), expected.tobytes())

    def test_publisher_targets_only_cutout_field_and_private_spell_bucket(self):
        publisher = (REPO_ROOT / "scripts/hermes2_publish.ts").read_text(encoding="utf-8")
        self.assertIn('spellCutout?"cutout_path"', publisher)
        self.assertIn('a.kind==="spell-cutout"||a.kind==="spell-illustration-wide"', publisher)
        self.assertIn("assertSpellCutoutWritable(target.cutout_path,appPath)", publisher)


if __name__ == "__main__":
    unittest.main()
