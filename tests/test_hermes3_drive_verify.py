"""HERMES 3: offline safety regression tests; no Drive login or public publishing."""
import io
import json
import unittest
import zipfile
from PIL import Image
from scripts.hermes3_drive_verify import check_png_jpeg, check_sprite_zip

def sprite(max_alpha=253, opaque=False):
    im = Image.new("RGBA", (64, 48), (145, 112, 68, 255 if opaque else max_alpha))
    if not opaque:
        im.putpixel((0, 0), (0, 0, 0, 0))
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()

def bundle(members):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in members.items():
            z.writestr(name, data)
    return b.getvalue()

class Hermes3DriveVerifierTests(unittest.TestCase):
    def test_safely_accepts_semitransparent_real_art(self):
        self.assertEqual(check_png_jpeg(sprite(), "image/png", "required"), [64, 48])

    def test_requires_real_alpha_not_opaque_or_empty(self):
        with self.assertRaisesRegex(ValueError, "TRANSPARENCY_REQUIRED"):
            check_png_jpeg(sprite(opaque=True), "image/png", "required")
        with self.assertRaisesRegex(ValueError, "TRANSPARENCY_REQUIRED"):
            check_png_jpeg(sprite(max_alpha=0), "image/png", "required")

    def test_ui_package_allows_inert_documentation_but_only_decodes_png(self):
        content = bundle({
            "arcane_morphing_frame/gear.png": sprite(),
            "arcane_morphing_frame/README.md": b"Original components",
            "arcane_morphing_frame/demo.html": b"<h1>Source preview (not deployed)</h1>",
            "arcane_morphing_frame/manifest.json": json.dumps({"version": 1}).encode()
        })
        report = check_sprite_zip(content)
        self.assertEqual(report["sprites"], 1)
        self.assertEqual(len(report["parts"][0]["sha256"]), 64)

    def test_rejects_executable_scripts_or_traversal(self):
        for member in ["arcane/frame.js", "../outside.png", "arcane/../../outside.png"]:
            with self.subTest(member=member):
                with self.assertRaises(ValueError):
                    check_sprite_zip(bundle({"arcane/gear.png": sprite(), member: b"unsafe"}))

if __name__ == "__main__":
    unittest.main()
