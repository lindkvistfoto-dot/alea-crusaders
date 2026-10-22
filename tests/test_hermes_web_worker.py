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
 image=Image.new("RGBA",(64,64),(40,50,60,0))
 out=io.BytesIO();image.save(out,format="PNG")
 return out.getvalue()

class WorkerTests(unittest.TestCase):
 def setUp(self):
  self.worker=load_worker()
  self.worker.TOKEN="offline-test-token"
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


 def test_corrupt_archive_never_published(self):
  worker=self.worker
  pose={"staging_path":"battle-pose/character/00000000-0000-0000-0000-000000000001/standard/00000000-0000-0000-0000-000000000002.png","publication_status":"draft","combatant_type":"character","combatant_id":"00000000-0000-0000-0000-000000000001","pose_key":"standard"}
  job={"id":"job","pose_id":"pose","source_path":pose["staging_path"],"archive_drive_file_id":"existing"}
  worker.FOLDER="test-folder"
  def fake_fetch(url,method="GET",body=None,headers=None,limit=14000000):
   if "fields=id,parents" in url:return b'{"parents":["test-folder"]}'
   if "alt=media" in url:return b"corrupted"
   raise AssertionError(url)
  with patch.object(worker,"rest",return_value=[pose]),patch.object(worker,"storage_download",return_value=png()),patch.object(worker,"fetch",side_effect=fake_fetch),patch.object(worker,"archive") as archive:
   with self.assertRaisesRegex(ValueError,"ARCHIVE_HASH_MISMATCH"):worker.run(job)
   archive.assert_not_called()


 def test_recover_already_published_pose(self):
  worker=self.worker
  pose_id="00000000-0000-0000-0000-000000000004"
  content=b"verified-webp"
  image_path="hermes/battle-pose-cutout/"+pose_id+"/"+worker.digest(content)+".webp"
  pose={"staging_path":"staging.png","publication_status":"published","image_path":image_path}
  job={"id":"job","pose_id":pose_id,"source_path":"staging.png"}
  calls=[]
  def fake_rest(path,method="GET",data=None):
   if method=="GET":return [pose]
   calls.append(data)
   return [data]
  with patch.object(worker,"rest",side_effect=fake_rest),patch.object(worker,"storage_download",return_value=content),patch.object(worker,"archive") as archive:
   worker.run(job)
   archive.assert_not_called()
  self.assertEqual(calls[0]["state"],"published")

 def test_recover_orphaned_drive_file(self):
  worker=self.worker
  worker.FOLDER="test-folder"
  original=png()
  def fake_fetch(url,method="GET",body=None,headers=None,limit=14000000):
   if "alt=media" in url:return original
   return b'{"files":[{"id":"existing"}]}'
  with patch.object(worker,"fetch",side_effect=fake_fetch):
   self.assertEqual(worker.find_archived_original("job-sha.png",worker.digest(original)),"existing")

 def test_ambiguous_archive_fails_closed(self):
  worker=self.worker
  worker.FOLDER="test-folder"
  with patch.object(worker,"fetch",return_value=b'{"files":[{"id":"one"},{"id":"two"}]}'):
   with self.assertRaisesRegex(ValueError,"ARCHIVE_AMBIGUOUS"):
    worker.find_archived_original("duplicate.png","a"*64)

 def test_corrupt_orphan_archive_fails_closed(self):
  worker=self.worker
  worker.FOLDER="test-folder"
  def fake_fetch(url,method="GET",body=None,headers=None,limit=14000000):
   if "alt=media" in url:return b"bad bytes"
   return b'{"files":[{"id":"one"}]}'
  with patch.object(worker,"fetch",side_effect=fake_fetch):
   with self.assertRaisesRegex(ValueError,"ARCHIVE_HASH_MISMATCH"):
    worker.find_archived_original("original.png","a"*64)


 def test_replacement_keeps_old_pose_until_verified(self):
  worker=self.worker
  original=png()
  pose_id="00000000-0000-0000-0000-000000000004"
  staged="battle-pose/character/00000000-0000-0000-0000-000000000001/standard/00000000-0000-0000-0000-000000000002.png"
  old_path="hermes/battle-pose-cutout/"+pose_id+"/old.webp"
  pose={"staging_path":"old-staging.png","publication_status":"published","image_path":old_path,
        "combatant_type":"character","combatant_id":"00000000-0000-0000-0000-000000000001","pose_key":"standard",
        "pending_staging_path":staged,"pending_base_key":"new-high-angle",
        "pending_mounting_profile":{"schema":1,"cutout":{"scale":65,"x":0,"y":8}}}
  job={"id":"00000000-0000-0000-0000-000000000003","pose_id":pose_id,"source_path":staged,"archive_drive_file_id":"verified-drive"}
  calls=[]
  output=[None]
  def fake_rest(path,method="GET",data=None):
   if method=="GET":return [pose]
   calls.append((path,data))
   return [data]
  def fake_fetch(url,method="GET",body=None,headers=None,limit=14000000):
   if "fields=id,parents" in url:return b'{"parents":["test-folder"]}'
   if "alt=media" in url:return original
   if method=="POST" and "/storage/v1/object/alea-hermes-public/" in url:
    output[0]=body
    return b'{}'
   raise AssertionError(url)
  def fake_download(bucket,path):
   if bucket=="alea-battle-pose-staging":return original
   if bucket=="alea-hermes-public":return output[0]
   raise AssertionError(bucket)
  worker.FOLDER="test-folder"
  with patch.object(worker,"rest",side_effect=fake_rest),patch.object(worker,"fetch",side_effect=fake_fetch),patch.object(worker,"storage_download",side_effect=fake_download):
   worker.run(job)
  pose_updates=[(path,data) for path,data in calls if path.startswith("combatant_battle_poses")]
  self.assertEqual(len(pose_updates),1)
  self.assertEqual(pose_updates[0][1]["base_key"],"new-high-angle")
  self.assertEqual(pose_updates[0][1]["pending_staging_path"],None)
  self.assertNotEqual(pose_updates[0][1]["image_path"],old_path)
  self.assertTrue(any(data.get("state")=="published" for _,data in calls))


 def test_failed_replacement_does_not_modify_active_pose(self):
  worker=self.worker
  original=png()
  pose_id="00000000-0000-0000-0000-000000000004"
  staged="battle-pose/character/00000000-0000-0000-0000-000000000001/standard/00000000-0000-0000-0000-000000000002.png"
  pose={"staging_path":"old.png","publication_status":"published","image_path":"old.webp",
        "combatant_type":"character","combatant_id":"00000000-0000-0000-0000-000000000001","pose_key":"standard",
        "pending_staging_path":staged,"pending_base_key":"new-high-angle","pending_mounting_profile":{"schema":1}}
  job={"id":"job","pose_id":pose_id,"source_path":staged,"archive_drive_file_id":"drive-existing"}
  pose_updates=[]
  def fake_rest(path,method="GET",data=None):
   if method=="GET":return [pose]
   if path.startswith("combatant_battle_poses"):pose_updates.append(data)
   return [data]
  def fake_fetch(url,method="GET",body=None,headers=None,limit=14000000):
   if "fields=id,parents" in url:return b'{"parents":["test-folder"]}'
   if "alt=media" in url:return original
   if method=="POST":return b'{}'
   raise AssertionError(url)
  worker.FOLDER="test-folder"
  with patch.object(worker,"rest",side_effect=fake_rest),patch.object(worker,"fetch",side_effect=fake_fetch),patch.object(worker,"storage_download",side_effect=lambda bucket,path:original if bucket=="alea-battle-pose-staging" else b"invalid-public-readback"):
   with self.assertRaisesRegex(ValueError,"PUBLIC_HASH_MISMATCH"):worker.run(job)
  self.assertEqual(pose_updates,[])
  self.assertEqual(pose["image_path"],"old.webp")

 def test_corrupt_image_never_archived(self):
  worker=self.worker
  pose={"staging_path":"battle-pose/character/00000000-0000-0000-0000-000000000001/standard/00000000-0000-0000-0000-000000000002.png","publication_status":"draft","combatant_type":"character","combatant_id":"00000000-0000-0000-0000-000000000001","pose_key":"standard"}
  job={"id":"job","pose_id":"pose","source_path":pose["staging_path"]}
  with patch.object(worker,"rest",return_value=[pose]),patch.object(worker,"storage_download",return_value=b"invalid-image"*30),patch.object(worker,"archive") as archive:
   with self.assertRaises(Exception):worker.run(job)
   archive.assert_not_called()

if __name__=="__main__":unittest.main()
