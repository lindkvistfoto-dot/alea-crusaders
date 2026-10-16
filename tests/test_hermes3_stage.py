"""HERMES 3: staging is deterministic and strictly nonpublishing."""
import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image
from scripts.hermes3_stage import stage_assets, render_webp
from scripts.hermes3_drive_verify import check_sprite_zip

def transparent_png():
    image = Image.new("RGBA", (80, 120), (100, 70, 40, 254))
    image.putpixel((0, 0), (0, 0, 0, 0))
    stream = io.BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()

def archive(data):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("clockwork/gear_left.png", data)
        z.writestr("clockwork/gear_right.png", data)
        z.writestr("clockwork/README.md", "# inert source documentation")
        z.writestr("clockwork/demo.html", "<script>alert('never extracted')</script>")
        z.writestr("clockwork/manifest.json", json.dumps({"sprites": 2}))
    return stream.getvalue()

def prepare(tmp, package):
    root = Path(tmp)
    verified = root / "verified"
    verified.mkdir()
    sha = hashlib.sha256(package).hexdigest()
    (verified / "verified-source.zip").write_bytes(package)
    receipt = {
        "schema": 3, "status": "verified-only", "job_id": "gear-test",
        "profile": "ui-sprite-package", "source_sha256": sha,
        "source_bytes": len(package), "mime_type": "application/zip",
        "artifact_filename": "verified-source.zip",
        "package": check_sprite_zip(package),
        "production_published": False, "database_activated": False
    }
    (verified / "verification.json").write_text(json.dumps(receipt))
    job = {"schema": 3, "job_id": "gear-test", "profile": "ui-sprite-package",
           "intent": "verify-only", "source": {
               "mime_type": "application/zip", "sha256": sha,
               "visibility": "public", "public_release_approved": True},
           "target": {"category": "ui-components", "key": "gear-test"}}
    registry = {"profiles": {"ui-sprite-package": {
        "stage": "verify", "alpha": "per-component", "media": "ui-components"}}}
    return job, verified, root / "staging", registry

class StageTest(unittest.TestCase):
    def test_webp_alpha_is_identical_to_png(self):
        original = transparent_png()
        optimized, dims, alpha = render_webp(original, "image/png")
        self.assertEqual(dims, [80, 120])
        self.assertTrue(alpha)
        with Image.open(io.BytesIO(optimized)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.convert("RGBA").getchannel("A").tobytes(),
                             Image.open(io.BytesIO(original)).getchannel("A").tobytes())

    def test_archive_stages_only_verified_sprites(self):
        with tempfile.TemporaryDirectory() as tmp:
            package = archive(transparent_png())
            job, verified, out, registry = prepare(tmp, package)
            manifest = stage_assets(job, verified, out, registry)
            self.assertEqual(manifest["state"], "staged-not-published")
            self.assertEqual(set(manifest["assets"]), {"gear_left", "gear_right"})
            self.assertFalse(manifest["supabase_activation"])
            self.assertFalse(manifest["production_deployment"])
            names = {f.name for f in out.iterdir()}
            self.assertEqual(len(names), 3)
            self.assertTrue(all(n.endswith(".webp") or n == "staging-manifest.json" for n in names))
            self.assertNotIn("demo.html", names)
            for item in manifest["assets"].values():
                self.assertEqual(hashlib.sha256((out / item["file"]).read_bytes()).hexdigest(), item["sha256"])

    def test_rejects_wrong_source_and_activation_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            job, verified, out, registry = prepare(tmp, archive(transparent_png()))
            job["source"]["sha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "STAGE_RECEIPT_MISMATCH"):
                stage_assets(job, verified, out, registry)
            job["source"]["sha256"] = json.loads(
                (verified / "verification.json").read_text())["source_sha256"]
            receipt_path = verified / "verification.json"
            receipt = json.loads(receipt_path.read_text())
            receipt["database_activated"] = True
            receipt_path.write_text(json.dumps(receipt))
            with self.assertRaisesRegex(ValueError, "STAGE_RECEIPT_MISMATCH"):
                stage_assets(job, verified, out, registry)

    def test_never_follows_uncontrolled_destination_in_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            package = io.BytesIO()
            with zipfile.ZipFile(package, "w") as z:
                z.writestr("clockwork/../../wrong.png", transparent_png())
            job, verified, out, registry = prepare_from_malicious(tmp, package.getvalue())
            with self.assertRaises(ValueError):
                stage_assets(job, verified, out, registry)

def prepare_from_malicious(tmp, payload):
    # Simulate malformed untrusted handoff data to ensure stage refuses it, too.
    root = Path(tmp)
    verified = root / "verified"
    verified.mkdir()
    h = hashlib.sha256(payload).hexdigest()
    (verified / "verified-source.zip").write_bytes(payload)
    (verified / "verification.json").write_text(json.dumps({
        "schema": 3, "status": "verified-only", "job_id": "gear-test",
        "profile": "ui-sprite-package", "source_sha256": h,
        "source_bytes": len(payload), "mime_type": "application/zip",
        "artifact_filename": "verified-source.zip", "package": {"sprites": 1},
        "database_activated": False, "production_published": False}))
    job = {"schema": 3, "job_id": "gear-test", "profile": "ui-sprite-package",
           "intent": "verify-only", "source": {"sha256": h,
             "mime_type": "application/zip", "visibility": "public",
             "public_release_approved": True}, "target": {"key": "gear-test"}}
    registry = {"profiles": {"ui-sprite-package": {
        "stage": "verify", "alpha": "per-component", "media": "ui-components"}}}
    return job, verified, root / "staging", registry

if __name__ == "__main__":
    unittest.main()
