#!/usr/bin/env python3
"""HERMES 4.1: private staging -> verified Drive archive -> immutable WebP.
Requires server-side service role and owner-authorized OAuth. Never run in browser.
"""
import hashlib
import io
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from PIL import Image

SUPA=os.environ["SUPABASE_URL"].rstrip("/")
KEY=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
def user_drive_token():
 client=os.environ["HERMES_OAUTH_CLIENT_ID"]
 secret=os.environ["HERMES_OAUTH_CLIENT_SECRET"]
 refresh=os.environ["HERMES_OAUTH_REFRESH_TOKEN"]
 import urllib.parse
 body=urllib.parse.urlencode({"client_id":client,"client_secret":secret,"refresh_token":refresh,"grant_type":"refresh_token"}).encode()
 req=urllib.request.Request("https://oauth2.googleapis.com/token",data=body,headers={"Content-Type":"application/x-www-form-urlencoded"},method="POST")
 with urllib.request.urlopen(req,timeout=25) as response:
  return json.load(response)["access_token"]
TOKEN=None
FOLDER=os.environ.get("HERMES_WEB_ARCHIVE_FOLDER_ID","")
BASE={"apikey":KEY,"Authorization":"Bearer "+KEY}

def fetch(url,method="GET",body=None,headers=None,limit=14000000):
 req=urllib.request.Request(url,body,headers=headers or {},method=method)
 with urllib.request.urlopen(req,timeout=90) as response:
  result=response.read(limit+1)
  if len(result)>limit: raise ValueError("RESPONSE_TOO_LARGE")
  return result

def rest(path,method="GET",data=None):
 headers={**BASE,"Content-Type":"application/json","Prefer":"return=representation"}
 try:
  raw=fetch(SUPA+"/rest/v1/"+path,method,json.dumps(data).encode() if data is not None else None,headers)
 except urllib.error.HTTPError as error:
  try:
   info=json.loads(error.read(2048))
   code=str(info.get("code","unknown"))[:40]
   message=str(info.get("message","unknown"))[:160]
  except (ValueError,UnicodeError):
   code="unparseable";message="response unavailable"
  raise RuntimeError("SUPABASE_REST_ERROR status="+str(error.code)+" code="+code+" message="+message) from None
 return json.loads(raw) if raw else []

def digest(data):return hashlib.sha256(data).hexdigest()
def patch(table,ident,values):return rest(table+"?id=eq."+ident,"PATCH",values)
def storage_download(bucket,path):
 return fetch(SUPA+"/storage/v1/object/"+bucket+"/"+path,headers=BASE)

def archive(data,name,mime):
 boundary="hermes41archive"
 b=boundary.encode()
 metadata=json.dumps({"name":name,"parents":[FOLDER]}).encode()
 payload=b"--"+b+b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+b"\r\n--"+b+b"\r\nContent-Type: "+mime.encode()+b"\r\n\r\n"+data+b"\r\n--"+b+b"--\r\n"
 result=fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents","POST",payload,{"Authorization":"Bearer "+TOKEN,"Content-Type":"multipart/related; boundary="+boundary})
 ident=json.loads(result)["id"]
 meta=json.loads(fetch("https://www.googleapis.com/drive/v3/files/"+ident+"?fields=id,parents",headers={"Authorization":"Bearer "+TOKEN}))
 if FOLDER not in meta.get("parents",[]):raise ValueError("ARCHIVE_WRONG_FOLDER")
 readback=fetch("https://www.googleapis.com/drive/v3/files/"+ident+"?alt=media",headers={"Authorization":"Bearer "+TOKEN})
 if digest(readback)!=digest(data):raise ValueError("ARCHIVE_HASH_MISMATCH")
 return ident

def find_archived_original(name, expected_sha):
 import urllib.parse
 query=urllib.parse.urlencode({"q":"'"+FOLDER+"' in parents and name = '"+name+"' and trashed = false","fields":"nextPageToken,files(id,name,parents)","page_size":100})
 result=json.loads(fetch("https://www.googleapis.com/drive/v3/files?"+query,headers={"Authorization":"Bearer "+TOKEN}))
 matches=result.get("files",[])
 if result.get("nextPageToken") or len(matches)>1:raise ValueError("ARCHIVE_AMBIGUOUS")
 if not matches:return None
 ident=matches[0]["id"]
 readback=fetch("https://www.googleapis.com/drive/v3/files/"+ident+"?alt=media",headers={"Authorization":"Bearer "+TOKEN})
 if digest(readback)!=expected_sha:raise ValueError("ARCHIVE_HASH_MISMATCH")
 return ident

def run(job):
 ident=job["id"];pose_id=job["pose_id"];source_path=job["source_path"]
 rows=rest("combatant_battle_poses?select=*&id=eq."+pose_id)
 if len(rows)!=1:raise ValueError("POSE_NOT_FOUND")
 pose=rows[0]
 replacement=(pose["publication_status"]=="published" and pose.get("pending_staging_path")==source_path)
 if not replacement and pose["staging_path"]!=source_path:
  raise ValueError("POSE_STAGING_MISMATCH")
 if pose["publication_status"]=="published" and not replacement:
  published_path=pose.get("image_path") or ""
  if job.get("output_path") and job["output_path"]!=published_path:raise ValueError("PUBLISHED_JOB_MISMATCH")
  if not published_path.startswith("hermes/battle-pose-cutout/"+pose_id+"/"):
   raise ValueError("POSE_PUBLISHED_PATH_MISMATCH")
  expected_hash=published_path.rsplit("/",1)[-1].removesuffix(".webp")
  if len(expected_hash)!=64 or digest(storage_download("alea-hermes-public",published_path))!=expected_hash:
   raise ValueError("PUBLISHED_READBACK_MISMATCH")
  completed=patch("hermes_web_jobs",ident,{"state":"published","output_path":published_path,"completed_at":datetime.now(timezone.utc).isoformat()})
  if len(completed)!=1:raise ValueError("JOB_COMPLETION_FAILED")
  return
 if not replacement and pose["publication_status"] not in ("draft","queued"):
  raise ValueError("POSE_STAGING_MISMATCH")
 import re
 expected=r"^battle-pose/"+re.escape(pose["combatant_type"])+"/"+re.escape(pose["combatant_id"])+"/"+re.escape(pose["pose_key"])+r"/[0-9a-f-]{36}\.(png|webp)$"
 if not re.fullmatch(expected,source_path):raise ValueError("BAD_STAGING_PATH")
 original=storage_download("alea-battle-pose-staging",source_path)
 if not 100<=len(original)<=12000000:raise ValueError("INVALID_ORIGINAL_SIZE")
 img=Image.open(io.BytesIO(original));img.load()
 if img.format not in ("PNG","WEBP") or not (1<=img.width<=4096 and 1<=img.height<=4096) or "A" not in img.getbands():
  raise ValueError("INVALID_TRANSPARENT_IMAGE")
 sha=digest(original)
 mime="image/png" if img.format=="PNG" else "image/webp"
 drive_id=job.get("archive_drive_file_id")
 if drive_id:
  meta=json.loads(fetch("https://www.googleapis.com/drive/v3/files/"+drive_id+"?fields=id,parents",headers={"Authorization":"Bearer "+TOKEN}))
  if FOLDER not in meta.get("parents",[]):raise ValueError("ARCHIVE_WRONG_FOLDER")
  readback=fetch("https://www.googleapis.com/drive/v3/files/"+drive_id+"?alt=media",headers={"Authorization":"Bearer "+TOKEN})
  if digest(readback)!=sha:raise ValueError("ARCHIVE_HASH_MISMATCH")
 else:
  name=ident+"-"+sha+"."+img.format.lower()
  drive_id=find_archived_original(name,sha)
  if not drive_id:drive_id=archive(original,name,mime)
 archived=patch("hermes_web_jobs",ident,{"archive_drive_file_id":drive_id,"source_sha256":sha,"state":"archived"})
 if len(archived)!=1:raise ValueError("ARCHIVE_STATE_UPDATE_FAILED")
 img=img.convert("RGBA")
 img.thumbnail((1280,1280),Image.Resampling.LANCZOS)
 out=io.BytesIO();img.save(out,format="WEBP",quality=85,method=6)
 data=out.getvalue();webp_sha=digest(data)
 path="hermes/battle-pose-cutout/"+pose_id+"/"+webp_sha+".webp"
 publishing=patch("hermes_web_jobs",ident,{"state":"publishing"})
 if len(publishing)!=1:raise ValueError("PUBLISHING_STATE_UPDATE_FAILED")
 try:
  fetch(SUPA+"/storage/v1/object/alea-hermes-public/"+path,"POST",data,{**BASE,"Content-Type":"image/webp","x-upsert":"false"})
 except urllib.error.HTTPError as e:
  if e.code!=409:raise
 if digest(storage_download("alea-hermes-public",path))!=webp_sha:raise ValueError("PUBLIC_HASH_MISMATCH")
 if replacement:
  update_filter="combatant_battle_poses?id=eq."+pose_id+"&pending_staging_path=eq."+source_path+"&publication_status=eq.published"
  values={"image_path":path,"source_drive_file_id":drive_id,"source_sha256":sha,
          "staging_path":source_path,"base_key":pose["pending_base_key"],
          "mounting_profile":pose["pending_mounting_profile"],
          "pending_staging_path":None,"pending_base_key":None,"pending_mounting_profile":None}
 else:
  update_filter="combatant_battle_poses?id=eq."+pose_id+"&staging_path=eq."+source_path+"&publication_status=in.(draft,queued)"
  values={"image_path":path,"source_drive_file_id":drive_id,"source_sha256":sha,"publication_status":"published","is_active":True}
 updated=rest(update_filter,"PATCH",values)
 if len(updated)!=1:raise ValueError("POSE_CHANGED_DURING_PUBLICATION")
 completed=patch("hermes_web_jobs",ident,{"state":"published","output_path":path,"completed_at":datetime.now(timezone.utc).isoformat()})
 if len(completed)!=1:raise ValueError("JOB_COMPLETION_FAILED")
 print("HERMES_DELIVERED",ident)

def main():
 global TOKEN
 if not FOLDER:raise RuntimeError('HERMES_ARCHIVE_FOLDER_MISSING')
 TOKEN=user_drive_token()
 if not TOKEN:raise RuntimeError('HERMES_DRIVE_OAUTH_MISSING')
 jobs=rest("rpc/hermes_claim_web_jobs","POST",{"batch_size":3})
 for job in jobs:
  try:run(job)
  except Exception as e:
   patch("hermes_web_jobs",job["id"],{"state":"failed","error_code":type(e).__name__})
   print("HERMES_FAILED",job["id"],type(e).__name__)
   raise

if __name__=="__main__":main()
