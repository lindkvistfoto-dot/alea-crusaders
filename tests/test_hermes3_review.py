"""HERMES 3: human-review evidence never becomes deployment authorization."""
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.hermes3_review import evidence, make_contact_sheet

def make_sprite(size=(72,56)):
    im = Image.new("RGBA", size, (140, 120, 60, 245))
    im.putpixel((0,0), (0,0,0,0))
    dest = io.BytesIO()
    im.save(dest, "WEBP", lossless=True, exact=True)
    return dest.getvalue()

def create_staging(folder):
    blob = make_sprite()
    digest = hashlib.sha256(blob).hexdigest()
    name = "gear-left-" + digest[:16] + ".webp"
    (folder/name).write_bytes(blob)
    manifest = {
        "schema":3, "state":"staged-not-published",
        "job_id":"arcane-verified", "profile":"ui-sprite-package",
        "source_sha256":"a"*64, "production_deployment":False,
        "supabase_activation":False,
        "assets":{"gear-left":{"file":name,"sha256":digest,
          "bytes":len(blob),"width":72,"height":56,"alpha_preserved":True}}
    }
    (folder/"staging-manifest.json").write_text(json.dumps(manifest), encoding="utf8")
    return manifest, name

class ReviewTest(unittest.TestCase):
    def test_staging_produces_visual_review_but_blocks_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            stage=Path(tmp)/"stage"
            stage.mkdir()
            create_staging(stage)
            manifest, original_hash, verified=evidence(stage)
            out=Path(tmp)/"report"
            make_contact_sheet(manifest, original_hash, verified, out)
            self.assertEqual(len(verified), 1)
            with Image.open(out/"review-contact-sheet.png") as sheet:
                self.assertEqual(sheet.size, (1200,339))
            release=json.loads((out/"release-candidate-BLOCKED.json").read_text())
            self.assertFalse(release["allowed_to_publish"])
            self.assertFalse(release["approvals_recorded"])
            self.assertFalse(release["production_deployment"])
            self.assertEqual(release["staging_manifest_sha256"],original_hash)
            self.assertIn("blocked", release["status"])
            self.assertEqual(len(list(out.iterdir())),3)

    def test_corrupted_webp_rejected_even_when_manifest_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            stage=Path(tmp)
            _, name=create_staging(stage)
            (stage/name).write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError,"REVIEW_SHA_MISMATCH"):
                evidence(stage)

    def test_traversal_and_forged_published_state_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            stage=Path(tmp)
            manifest,name=create_staging(stage)
            manifest["assets"]["gear-left"]["file"]="../outside.webp"
            (stage/"staging-manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,"REVIEW_BAD_FILENAME"):
                evidence(stage)
            manifest["assets"]["gear-left"]["file"]=name
            manifest["production_deployment"]=True
            (stage/"staging-manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,"REVIEW_NOT_STAGED"):
                evidence(stage)

if __name__=="__main__":
    unittest.main()
