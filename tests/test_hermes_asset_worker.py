"""Mock-only tests for the HERMES asset worker; no Drive or Supabase writes."""
import hashlib
import importlib.util
import io
import os
import pathlib
import unittest
from unittest.mock import patch
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[1]
WORKER=ROOT/"scripts"/"hermes_asset_worker.py"

def load():
    spec=importlib.util.spec_from_file_location("hermes_asset_worker_test",WORKER)
    module=importlib.util.module_from_spec(spec)
    with patch.dict(os.environ,{"SUPABASE_URL":"https://example.invalid","SUPABASE_SERVICE_ROLE_KEY":"test-only"}):
        spec.loader.exec_module(module)
    return module

def png(mode="RGBA",size=(640,640),color=(20,30,40,0)):
    image=Image.new(mode,size,color)
    out=io.BytesIO();image.save(out,format="PNG")
    return out.getvalue()

class AssetWorkerTests(unittest.TestCase):
    def setUp(self):
        self.w=load()
        self.token="offline"
        self.job={"id":"00000000-0000-4000-8000-000000000001","lease_token":"00000000-0000-4000-8000-000000000002",
            "target_id":"00000000-0000-4000-8000-000000000003","target_key":"sigill-kraft","target_type":"symbol",
            "image_type":"icon","source_bucket":"alea-hermes-source","source_path":"hermes-assets/test/source",
            "source_sha256":"","source_bytes":0,"previous_path":"old.webp","inbox_drive_file_id":None,
            "archive_drive_file_id":None,"output_path":None,"app_sha256":None,"attempts":1}
        self.source=png()
        self.job["source_sha256"]=hashlib.sha256(self.source).hexdigest()
        self.job["source_bytes"]=len(self.source)

    def test_image_signature_recognizes_supported_types_and_rejects_other_bytes(self):
        self.assertEqual(self.w.image_mime(self.source),"image/png")
        self.assertEqual(self.w.image_mime(b"\xff\xd8\xff"+b"x"*100),"image/jpeg")
        self.assertEqual(self.w.image_mime(b"RIFF"+b"x"*4+b"WEBP"+b"x"*20),"image/webp")
        with self.assertRaisesRegex(ValueError,"INVALID_IMAGE_SIGNATURE"):self.w.image_mime(b"not an image")

    def test_square_profiles_convert_to_expected_webp_size(self):
        for kind in ("icon","effect","cutout","illustration"):
            with self.subTest(kind=kind):
                data,width,height=self.w.optimized_webp(self.source,kind)
                self.assertEqual((width,height),(640,640))
                self.assertTrue(data.startswith(b"RIFF") and data[8:12]==b"WEBP")

    def test_wide_profile_requires_16_by_9_and_outputs_1280_by_720(self):
        source=png(size=(1600,900),color=(255,255,255,255))
        data,width,height=self.w.optimized_webp(source,"illustration-wide")
        self.assertEqual((width,height),(1280,720))
        self.assertEqual(data[8:12],b"WEBP")
        with self.assertRaisesRegex(ValueError,"WIDE_IMAGE_MUST_BE_16_9"):
            self.w.optimized_webp(png(size=(640,640),color=(255,255,255,255)),"illustration-wide")

    def test_cutout_requires_alpha_and_fully_transparent_pixels(self):
        with self.assertRaisesRegex(ValueError,"TRANSPARENT_IMAGE_REQUIRED"):
            self.w.optimized_webp(png(mode="RGB",color=(1,2,3)),"cutout")
        with self.assertRaisesRegex(ValueError,"CUTOUT_NEEDS_TRANSPARENT_PIXELS"):
            self.w.optimized_webp(png(color=(1,2,3,255)),"cutout")

    def test_square_profile_rejects_rectangle(self):
        with self.assertRaisesRegex(ValueError,"SQUARE_IMAGE_REQUIRED"):
            self.w.optimized_webp(png(size=(640,480)),"effect")

    def test_drive_pipeline_is_ordered_and_archive_precedes_publish(self):
        calls=[]
        def ensure(token,job,parent,archive=False):
            calls.append("archive" if archive else "inbox")
            return "archive-id" if archive else "inbox-id"
        def fake_patch(job,values):
            calls.append(values.get("state","metadata"))
            job.update(values)
            return values
        def verify(token,file_id,parent,sha):calls.append("verify-"+parent)
        def publish(job,token,source):calls.append("publish")
        with patch.object(self.w,"storage_download",return_value=self.source), \
             patch.object(self.w,"ensure_drive_original",side_effect=ensure), \
             patch.object(self.w,"patch_job",side_effect=fake_patch), \
             patch.object(self.w,"verify_drive_file",side_effect=verify), \
             patch.object(self.w,"publish",side_effect=publish):
            self.w.process(self.job,self.token)
        self.assertEqual(calls[:4],["inbox","inboxed","archive","archived"])
        self.assertEqual(calls[-1],"publish")
        self.assertEqual(self.job["inbox_drive_file_id"],"inbox-id")
        self.assertEqual(self.job["archive_drive_file_id"],"archive-id")

    def test_archive_failure_never_reaches_publish_and_keeps_inbox_receipt(self):
        calls=[]
        def ensure(token,job,parent,archive=False):
            if archive:raise OSError("temporary drive failure")
            return "inbox-id"
        def patch(job,values):job.update(values);calls.append(values)
        with patch.object(self.w,"storage_download",return_value=self.source), \
             patch.object(self.w,"ensure_drive_original",side_effect=ensure), \
             patch.object(self.w,"patch_job",side_effect=patch), \
             patch.object(self.w,"publish") as publish:
            with self.assertRaisesRegex(OSError,"temporary drive failure"):self.w.process(self.job,self.token)
            publish.assert_not_called()
        self.assertEqual(self.job["inbox_drive_file_id"],"inbox-id")
        self.assertIsNone(self.job["archive_drive_file_id"])

    def test_bad_staging_hash_stops_before_drive(self):
        with patch.object(self.w,"storage_download",return_value=b"wrong bytes"), \
             patch.object(self.w,"ensure_drive_original") as drive:
            with self.assertRaisesRegex(ValueError,"STAGING_SHA256_MISMATCH"):self.w.process(self.job,self.token)
            drive.assert_not_called()

    def test_concurrent_pointer_change_refuses_activation(self):
        with patch.object(self.w,"pointer",return_value={"symbol_key":self.job["target_key"],"icon_path":"newer.webp"}), \
             patch.object(self.w,"patch_job") as patch_job:
            with self.assertRaisesRegex(ValueError,"TARGET_CHANGED_DURING_PUBLICATION"):
                self.w.publish(self.job,self.token,self.source)
            patch_job.assert_not_called()

    def test_already_activated_job_completes_idempotently_after_hash_readback(self):
        data=b"published webp bytes";sha=hashlib.sha256(data).hexdigest()
        self.job.update({"output_path":"hermes/symbol/sigill-kraft/"+sha+".webp","app_sha256":sha})
        with patch.object(self.w,"pointer",return_value={"symbol_key":self.job["target_key"],"icon_path":self.job["output_path"]}), \
             patch.object(self.w,"storage_download",return_value=data), \
             patch.object(self.w,"patch_job") as patch_job:
            self.w.publish(self.job,self.token,self.source)
            patch_job.assert_called_once()
            self.assertEqual(patch_job.call_args.args[1]["state"],"published")

    def test_retry_backoff_is_bounded_and_keeps_original_fields(self):
        values={}
        def patch(job,data):values.update(data);return data
        with patch.object(self.w,"patch_job",side_effect=patch):
            self.w.fail_job(self.job,TimeoutError("temporary"))
        self.assertEqual(values["state"],"failed")
        self.assertEqual(values["error_code"],"TIMEOUTERROR")
        self.assertGreater(values["next_attempt_at"],"")
        self.assertIsNone(values["lease_token"])
        self.assertEqual(self.job["source_path"],"hermes-assets/test/source")

if __name__=="__main__":unittest.main()
