"""Offline tests for HERMES 4.1: no network, Drive, or Supabase credentials."""
import importlib.util
import io
import os
import pathlib
import unittest
from unittest.mock import patch
from PIL import Image

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts"/"hermes_web_worker.py"

def load_worker():
 spec=importlib.util.spec_from_file_location("hermes_web_worker_under_test",PATH)
 module=importlib.util.module_from_spec(spec)
 with patch.dict(os.environ,{"SUPABASE_URL":"https://example.supabase.co","SUPABASE_SERVICE_ROLE_KEY":"test-only","HERMES_WEB_ARCHIVE_FOLDER_ID":"test-folder"}):
  spec.loader.exec_module(module)
 return module

def png():
 image=Image.new("RGBA",(16,16),(40,50,60,0))
 out=io.BytesIO();image.save(out,format="PNG")
 return out.getvalue()

class WorkerTests(unittest.TestCase):
 def setUp(self):self.worker=load_worker()
 def test_digest_stable(self):
  self.assertEqual(self.worker.digest(b"hello"),"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
 def test_no_job_claim_if_oauth_fails(self):
  with patch.object(self.worker,"user_drive_token",side_effect=ValueError("no token")),patch.object(self.worker,"rest") as rest:
   with self.assertRaises(ValueError):self.worker.main()
   rest.assert_not_called()
 def test_archive_reused_and_verified(self):
  worker=self.worker;original=png()
  pose={"staging_path":"battle-pose/character/00000000-0000-0000-0000-000000000001/standard/00000000-0000-0000-0000-000000000002.png","publication_status":"draft","combatant_type":"character","combatant_id":"00000000-0000-0000-0000-000000000001","pose_key":"standard"}
  job={"id":"00000000-0000-0000-0000-000000000003","pose_id":"00000000-0000-0000-0000-000000000004","source_path":pose["staging_path"],"archive_drive_file_id":"drive-existing"}
  worker.TOKEN="fake-token"
  worker.FOLDER="test-folder"
  calls=[]
  def fake_rest(path,method="GET",data=None):
   if path.startswith("combatant_battle_poses?select"):return [pose]
   if method=="PATCH":calls.append((path,data));return [data]
   raise AssertionError(path)
  def fake_fetch(url,method="GET",body=None,headers=None,limit=14000000):
   if "fields=id,parents" in url:return b'{"id":"drive-existing","parents":["test-folder"]}'
   if "alt=media" in url:return original
   if "/storage/v1/object/alea-hermes-public/" in url:
    if method=="POST":return b'{}'
    return calls[-1][1].get("published_bytes",b"") if False else fake_fetch.web_output
   raise AssertionError(url)
  def fake_download(bucket,path):
   if bucket=="alea-battle-pose-staging":return original
   if bucket=="alea-hermes-public":return fake_fetch.web_output
   raise AssertionError(bucket)
  def capture_fetch(url,method="GET",body=None,headers=None,limit=14000000):
   if method=="POST" and "/storage/v1/object/alea-hermes-public/" in url:
    fake_fetch.web_output=body
    return b'{}'
   return fake_fetch(url,method,body,headers,limit)
  with patch.object(worker,"rest",side_effect=fake_rest),patch.object(worker,"fetch",side_effect=capture_fetch),patch.object(worker,"storage_download",side_effect=fake_download),patch.object(worker,"archive") as archive:
   worker.run(job)
   archive.assert_not_called()
  self.assertTrue(any(row.get("publication_status")=="published" for _,row in calls))
  self.assertTrue(any(row.get("state")=="published" for _,row in calls))

if __name__=="__main__":unittest.main()
