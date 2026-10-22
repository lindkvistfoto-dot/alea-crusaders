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
TOKEN=user_drive_token()
FOLDER=os.environ["HERMES_WEB_ARCHIVE_FOLDER_ID"]
if not all((KEY,TOKEN,FOLDER)): raise RuntimeError("HERMES_WORKER_CONFIG_MISSING")
BASE={"apikey":KEY,"Authorization":"Bearer "+KEY}

def fetch(url,method="GET",body=None,headers=None,limit=14000000):
 req=urllib.request.Request(url,body,headers=headers or {},method=method)
 with urllib.request.urlopen(req,timeout=90) as response:
  result=response.read(limit+1)
  if len(result)>limit: raise ValueError("RESPONSE_TOO_LARGE")
  return result

def rest(path,method="GET",data=None):
 headers={**BASE,"Content-Type":"application/json","Prefer":"return=representation"}
 raw=fetch(SUPA+"/rest/v1/"+path,method,json.dumps(data).encode() if data is not None else None,headers)
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

def run(job):
 ident=job["id"];pose_id=job["pose_id"];source_path=job["source_path"]
 rows=rest("combatant_battle_poses?select=*&id=eq."+pose_id)
 if len(rows)!=1 or rows[0]["staging_path"]!=source_path or rows[0]["publication_status"] not in ("draft","queued"):
  raise ValueError("POSE_STAGING_MISMATCH")
 import re
 expected=r"^battle-pose/"+re.escape(rows[0]["combatant_type"])+"/"+re.escape(rows[0]["combatant_id"])+"/"+re.escape(rows[0]["pose_key"])+r"/[0-9a-f-]{36}\.(png|webp)$"
 if not re.fullmatch(expected,source_path):raise ValueError("BAD_STAGING_PATH")
 original=storage_download("alea-battle-pose-staging",source_path)
 if not 100<=len(original)<=12000000:raise ValueError("INVALID_ORIGINAL_SIZE")
 img=Image.open(io.BytesIO(original));img.load()
 if img.format not in ("PNG","WEBP") or not (1<=img.width<=4096 and 1<=img.height<=4096) or "A" not in img.getbands():
  raise ValueError("INVALID_TRANSPARENT_IMAGE")
 sha=digest(original)
 mime="image/png" if img.format=="PNG" else "image/webp"
 drive_id=archive(original,ident+"-"+sha+"."+img.format.lower(),mime)
 patch("hermes_web_jobs",ident,{"archive_drive_file_id":drive_id,"source_sha256":sha,"state":"archived"})
 img=img.convert("RGBA")
 img.thumbnail((1280,1280),Image.Resampling.LANCZOS)
 out=io.BytesIO();img.save(out,format="WEBP",quality=85,method=6)
 data=out.getvalue();webp_sha=digest(data)
 path="hermes/battle-pose-cutout/"+pose_id+"/"+webp_sha+".webp"
 patch("hermes_web_jobs",ident,{"state":"publishing"})
 try:
  fetch(SUPA+"/storage/v1/object/alea-hermes-public/"+path,"POST",data,{**BASE,"Content-Type":"image/webp","x-upsert":"false"})
 except urllib.error.HTTPError as e:
  if e.code!=409:raise
 if digest(storage_download("alea-hermes-public",path))!=webp_sha:raise ValueError("PUBLIC_HASH_MISMATCH")
 updated=rest("combatant_battle_poses?id=eq."+pose_id+"&staging_path=eq."+source_path+"&publication_status=in.(draft,queued)","PATCH",{"image_path":path,"source_drive_file_id":drive_id,"source_sha256":sha,"publication_status":"published","is_active":True})
 if len(updated)!=1:raise ValueError("POSE_CHANGED_DURING_PUBLICATION")
 patch("hermes_web_jobs",ident,{"state":"published","output_path":path,"completed_at":datetime.now(timezone.utc).isoformat()})
 print("HERMES_DELIVERED",ident)

def main():
 jobs=rest("rpc/hermes_claim_web_jobs","POST",{"batch_size":3})
 for job in jobs:
  try:run(job)
  except Exception as e:
   patch("hermes_web_jobs",job["id"],{"state":"failed","error_code":type(e).__name__})
   print("HERMES_FAILED",job["id"],type(e).__name__)
   raise

if __name__=="__main__":main()
