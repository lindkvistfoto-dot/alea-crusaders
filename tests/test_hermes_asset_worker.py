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

    def test_all_five_symbol_types_use_canonical_hermes_profile(self):
        captured=[]
        output=b"RIFF"+b"\\x00\\x00\\x00\\x00"+b"WEBP"+b"test"
        def prepare(raw,kind,key,sha,output_root,source_path):
            captured.append((kind,key,sha,source_path))
            relative=pathlib.Path(kind)/key/(hashlib.sha256(output).hexdigest()+".webp")
            target=output_root/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(output)
            return {"app_file":relative.as_posix(),"app_sha256":hashlib.sha256(output).hexdigest(),
                    "width":640,"height":640}
        expected={"icon":"symbol","effect":"symbol-effect","cutout":"symbol-cutout",
                  "illustration":"symbol-illustration","illustration-wide":"symbol-illustration-wide"}
        with patch("hermes2_prepare.prepare_bytes",side_effect=prepare):
            for image_type,kind in expected.items():
                with self.subTest(image_type=image_type):
                    data,width,height=self.w.optimized_webp(self.source,image_type,"sigill-kraft")
                    self.assertEqual(data,output)
                    self.assertEqual((width,height),(640,640))
                    self.assertEqual(captured[-1][0],kind)
                    self.assertEqual(captured[-1][1],"sigill-kraft")
                    self.assertEqual(captured[-1][2],hashlib.sha256(self.source).hexdigest())
                    self.assertTrue(captured[-1][3].startswith("drive://"))

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
        def fake_patch(job,values):job.update(values);calls.append(values)
        with patch.object(self.w,"storage_download",return_value=self.source), \
             patch.object(self.w,"ensure_drive_original",side_effect=ensure), \
             patch.object(self.w,"patch_job",side_effect=fake_patch), \
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

    def test_permanent_integrity_failure_becomes_terminal(self):
        values={}
        def fake_patch(job,data):values.update(data);return data
        with patch.object(self.w,"patch_job",side_effect=fake_patch):
            self.w.fail_job(self.job,ValueError("STAGING_SHA256_MISMATCH"))
        self.assertEqual(values["state"],"failed")
        self.assertEqual(values["attempts"],12)
        self.assertEqual(values["error_code"],"STAGING_SHA256_MISMATCH")

    def test_retry_backoff_is_bounded_and_keeps_original_fields(self):
        values={}
        def fake_patch(job,data):values.update(data);return data
        with patch.object(self.w,"patch_job",side_effect=fake_patch):
            self.w.fail_job(self.job,TimeoutError("temporary"))
        self.assertEqual(values["state"],"failed")
        self.assertEqual(values["error_code"],"TIMEOUTERROR")
        self.assertGreater(values["next_attempt_at"],"")
        self.assertIsNone(values["lease_token"])
        self.assertEqual(self.job["source_path"],"hermes-assets/test/source")

    def test_webp_profile_failure_does_not_upload_or_change_pointer(self):
        self.job.update({"archive_drive_file_id":"archive-id","inbox_drive_file_id":"inbox-id"})
        with patch.object(self.w,"pointer",return_value={"symbol_key":self.job["target_key"],"icon_path":"old.webp"}), \
             patch.object(self.w,"optimized_webp",side_effect=ValueError("symbol/icon profile invalid")), \
             patch.object(self.w,"request") as upload, \
             patch.object(self.w,"rest") as rest, \
             patch.object(self.w,"patch_job") as patch_job:
            with self.assertRaisesRegex(ValueError,"profile invalid"):
                self.w.publish(self.job,self.token,self.source)
            upload.assert_not_called()
            rest.assert_not_called()
            patch_job.assert_not_called()

    def test_process_recovers_after_temporary_archive_failure(self):
        ensure_calls=[];published=[];patches=[]
        def ensure(token,job,parent,archive=False):
            ensure_calls.append(archive)
            if archive and ensure_calls.count(True)==1:raise OSError("Drive temporarily unavailable")
            return "archive-id" if archive else "inbox-id"
        def fake_patch(job,values):
            patches.append(values.copy());job.update(values);return values
        with patch.object(self.w,"storage_download",return_value=self.source), \
             patch.object(self.w,"ensure_drive_original",side_effect=ensure), \
             patch.object(self.w,"verify_drive_file") as verify, \
             patch.object(self.w,"patch_job",side_effect=fake_patch), \
             patch.object(self.w,"publish",side_effect=lambda *args:published.append("published")):
            with self.assertRaisesRegex(OSError,"Drive temporarily unavailable"):
                self.w.process(self.job,self.token)
            self.assertEqual(self.job["inbox_drive_file_id"],"inbox-id")
            self.w.process(self.job,self.token)
        self.assertIn("published",published)
        self.assertEqual(ensure_calls,[False,True,False,True])\n        verify.assert_not_called()
        self.assertEqual(self.job["archive_drive_file_id"],"archive-id")
        self.assertEqual([p.get("state") for p in patches],["inboxed","archived"])

    def test_storage_upload_failure_preserves_previous_pointer(self):
        webp=b"deterministic webp bytes"
        self.job.update({"archive_drive_file_id":"archive-id","inbox_drive_file_id":"inbox-id"})
        with patch.object(self.w,"pointer",return_value={"symbol_key":self.job["target_key"],"icon_path":"old.webp"}), \
             patch.object(self.w,"optimized_webp",return_value=(webp,640,640)), \
             patch.object(self.w,"patch_job") as patch_job, \
             patch.object(self.w,"request",side_effect=OSError("temporary storage failure")), \
             patch.object(self.w,"storage_download") as download, \
             patch.object(self.w,"rest") as rest:
            with self.assertRaisesRegex(OSError,"temporary storage failure"):
                self.w.publish(self.job,self.token,self.source)
            download.assert_not_called()
            rest.assert_not_called()
        self.assertEqual(patch_job.call_args.args[1]["state"],"publishing")

    def test_webp_readback_hash_failure_preserves_previous_pointer(self):
        webp=b"deterministic webp bytes"
        self.job.update({"archive_drive_file_id":"archive-id","inbox_drive_file_id":"inbox-id"})
        with patch.object(self.w,"pointer",return_value={"symbol_key":self.job["target_key"],"icon_path":"old.webp"}), \
             patch.object(self.w,"optimized_webp",return_value=(webp,640,640)), \
             patch.object(self.w,"patch_job") as patch_job, \
             patch.object(self.w,"request"), \
             patch.object(self.w,"storage_download",return_value=b"wrong bytes"), \
             patch.object(self.w,"rest") as rest:
            with self.assertRaisesRegex(ValueError,"PUBLIC_READBACK_MISMATCH"):
                self.w.publish(self.job,self.token,self.source)
            rest.assert_not_called()
        self.assertEqual(patch_job.call_args.args[1]["state"],"publishing")

    def test_activation_happens_after_verified_storage_readback(self):
        webp=b"deterministic webp bytes"
        active={"path":"old.webp"};patch_states=[]
        self.job.update({"archive_drive_file_id":"archive-id","inbox_drive_file_id":"inbox-id"})
        def fake_rest(path,method="GET",data=None):
            if method=="PATCH":
                self.assertEqual(active["path"],"old.webp")
                active["path"]=data["icon_path"]
                return [{"id":self.job["target_id"]}]
            raise AssertionError("Unexpected REST request")
        def fake_patch(job,values):
            patch_states.append(values["state"])
            job.update(values)
        with patch.object(self.w,"pointer",side_effect=lambda job:{"symbol_key":self.job["target_key"],"icon_path":active["path"]}), \
             patch.object(self.w,"optimized_webp",return_value=(webp,640,640)), \
             patch.object(self.w,"patch_job",side_effect=fake_patch), \
             patch.object(self.w,"request"), \
             patch.object(self.w,"storage_download",side_effect=lambda *args:(self.assertEqual(active["path"],"old.webp"),webp)[1]), \
             patch.object(self.w,"rest",side_effect=fake_rest):
            self.w.publish(self.job,self.token,self.source)
        self.assertTrue(active["path"].endswith(".webp"))
        self.assertEqual(patch_states,["publishing","published"])

if __name__=="__main__":unittest.main()
