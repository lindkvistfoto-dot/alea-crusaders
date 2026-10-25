#!/usr/bin/env python3
"""HERMES symbol-image worker: private staging -> Drive Inbox -> verified archive -> immutable WebP."""
import hashlib
import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from PIL import Image, UnidentifiedImageError

SUPA=os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
INBOX=os.environ.get("HERMES_WEB_INBOX_FOLDER_ID","1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp")
ARCHIVE={
 "icon":os.environ.get("HERMES_SYMBOL_ICON_ARCHIVE_FOLDER_ID","10O5G2reR1Ll0s7wGQPSY8_6Nq4IMOBjS"),
 "effect":os.environ.get("HERMES_SYMBOL_SQUARE_ARCHIVE_FOLDER_ID","1OZg41rqMKVATKnPFCg6enbVrrwc_2CIZ"),
 "cutout":os.environ.get("HERMES_SYMBOL_CUTOUT_ARCHIVE_FOLDER_ID","1FrKbSXLq1hp7eE6J6O-lrKeK3Vj5n-of"),
 "illustration":os.environ.get("HERMES_SYMBOL_SQUARE_ARCHIVE_FOLDER_ID","1OZg41rqMKVATKnPFCg6enbVrrwc_2CIZ"),
 "illustration-wide":os.environ.get("HERMES_SYMBOL_WIDE_ARCHIVE_FOLDER_ID","1TkOcnqUimRZRbqmCvjXh4vt07XfecpkA"),
}
BUCKET="alea-hermes-public"
BASE={"apikey":SERVICE_KEY,"Authorization":"Bearer "+SERVICE_KEY}
FIELD={"icon":"icon_path","effect":"effect_image_path","cutout":"cutout_path","illustration":"illustration_path","illustration-wide":"illustration_wide_path"}
KIND={"icon":"symbol","effect":"symbol-effect","cutout":"symbol-cutout","illustration":"symbol-illustration","illustration-wide":"symbol-illustration-wide"}
MAX=8*1024*1024

def digest(data):return hashlib.sha256(data).hexdigest()
def request(url,method="GET",body=None,headers=None,limit=14_000_000):
    req=urllib.request.Request(url,body,headers or {},method=method)
    with urllib.request.urlopen(req,timeout=90) as response:
        data=response.read(limit+1)
    if len(data)>limit:raise ValueError("RESPONSE_TOO_LARGE")
    return data

def rest(path,method="GET",data=None):
    headers={**BASE,"Content-Type":"application/json","Prefer":"return=representation"}
    try:
        raw=request(SUPA+"/rest/v1/"+path,method,json.dumps(data).encode() if data is not None else None,headers)
    except urllib.error.HTTPError as e:
        raise RuntimeError("SUPABASE_HTTP_"+str(e.code)) from None
    return json.loads(raw) if raw else []

def storage_download(bucket,path):
    return request(SUPA+"/storage/v1/object/"+bucket+"/"+urllib.parse.quote(path,safe="/"),headers=BASE,limit=MAX+1)

def drive_token():
    form=urllib.parse.urlencode({"client_id":os.environ["HERMES_OAUTH_CLIENT_ID"],"client_secret":os.environ["HERMES_OAUTH_CLIENT_SECRET"],"refresh_token":os.environ["HERMES_OAUTH_REFRESH_TOKEN"],"grant_type":"refresh_token"}).encode()
    raw=request("https://oauth2.googleapis.com/token","POST",form,{"Content-Type":"application/x-www-form-urlencoded"},100000)
    token=json.loads(raw).get("access_token")
    if not token:raise RuntimeError("DRIVE_TOKEN_MISSING")
    return token

def drive_request(token,url,method="GET",body=None,headers=None,limit=MAX+1):
    return request(url,method,body,{"Authorization":"Bearer "+token,**(headers or {})},limit)

def drive_list(token,parent,name):
    q="'"+parent+"' in parents and name = '"+name.replace("'","\\'")+"' and trashed = false"
    params=urllib.parse.urlencode({"q":q,"fields":"nextPageToken,files(id,name,parents)","pageSize":100})
    result=json.loads(drive_request(token,"https://www.googleapis.com/drive/v3/files?"+params))
    files=result.get("files",[])
    if result.get("nextPageToken") or len(files)>1:raise ValueError("DRIVE_NAME_AMBIGUOUS")
    return files[0] if files else None

def drive_download(token,file_id):
    return drive_request(token,"https://www.googleapis.com/drive/v3/files/"+urllib.parse.quote(file_id,safe="")+"?alt=media",limit=MAX+1)

def drive_create(token,parent,name,content,mime):
    boundary="hermes270boundary"
    b=boundary.encode()
    meta=json.dumps({"name":name,"parents":[parent]}).encode()
    body=b"--"+b+b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+meta+b"\r\n--"+b+b"\r\nContent-Type: "+mime.encode()+b"\r\n\r\n"+content+b"\r\n--"+b+b"--\r\n"
    result=json.loads(drive_request(token,"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents","POST",body,{"Content-Type":"multipart/related; boundary="+boundary}))
    return result["id"]

def drive_copy(token,source_id,parent,name):
    meta=json.dumps({"name":name,"parents":[parent]}).encode()
    result=json.loads(drive_request(token,"https://www.googleapis.com/drive/v3/files/"+urllib.parse.quote(source_id,safe="")+"/copy?fields=id,name,parents","POST",meta,{"Content-Type":"application/json"}))
    return result["id"]

def verify_drive_file(token,file_id,parent,expected_sha):
    meta=json.loads(drive_request(token,"https://www.googleapis.com/drive/v3/files/"+urllib.parse.quote(file_id,safe="")+"?fields=id,parents"))
    if parent not in meta.get("parents",[]):raise ValueError("DRIVE_WRONG_FOLDER")
    content=drive_download(token,file_id)
    if digest(content)!=expected_sha:raise ValueError("DRIVE_SHA256_MISMATCH")
    return content

def ensure_drive_original(token,job,parent,archive=False):
    field="archive_drive_file_id" if archive else "inbox_drive_file_id"
    existing=job.get(field)
    dest=ARCHIVE[job["image_type"]] if archive else INBOX
    name=job["id"]+"-"+job["source_sha256"]+(".webp" if False else "")
    source=storage_download(job["source_bucket"],job["source_path"])
    if digest(source)!=job["source_sha256"]:raise ValueError("STAGING_SHA256_MISMATCH")
    ext={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"}.get(image_mime(source))
    name=name+"."+ext
    if existing:
        verify_drive_file(token,existing,dest,job["source_sha256"])
        return existing
    found=drive_list(token,dest,name)
    if found:
        verify_drive_file(token,found["id"],dest,job["source_sha256"])
        return found["id"]
    if archive:
        inbox_id=job.get("inbox_drive_file_id")
        if not inbox_id:raise ValueError("INBOX_ARCHIVE_ORDER_VIOLATION")
        ident=drive_copy(token,inbox_id,dest,name)
    else:
        ident=drive_create(token,dest,name,source,image_mime(source))
    verify_drive_file(token,ident,dest,job["source_sha256"])
    return ident

def image_mime(data):
    if data.startswith(bytes.fromhex("89504e470d0a1a0a")):return "image/png"
    if data.startswith(bytes.fromhex("ffd8ff")):return "image/jpeg"
    if len(data)>12 and data[:4]==b"RIFF" and data[8:12]==b"WEBP":return "image/webp"
    raise ValueError("INVALID_IMAGE_SIGNATURE")

def optimized_webp(source,image_type):
    try:
        im=Image.open(io.BytesIO(source));im.load()
    except (UnidentifiedImageError,OSError,ValueError):
        raise ValueError("INVALID_IMAGE") from None
    fmt=(im.format or "").upper()
    if fmt not in ("PNG","JPEG","WEBP") or im.width<1 or im.height<1 or im.width>4096 or im.height>4096:
        raise ValueError("INVALID_IMAGE_DIMENSIONS")
    wide=image_type=="illustration-wide"
    if wide:
        if abs((im.width/im.height)-(16/9))/(16/9)>0.003:raise ValueError("WIDE_IMAGE_MUST_BE_16_9")
        im=im.convert("RGB").resize((1280,720),Image.Resampling.LANCZOS)
    else:
        if im.width!=im.height:raise ValueError("SQUARE_IMAGE_REQUIRED")
        if image_type in ("icon","cutout"):
            if "A" not in im.getbands():raise ValueError("TRANSPARENT_IMAGE_REQUIRED")
            if image_type=="cutout" and im.getchannel("A").getextrema()[0] != 0:
                raise ValueError("CUTOUT_NEEDS_TRANSPARENT_PIXELS")
            im=im.convert("RGBA").resize((640,640),Image.Resampling.LANCZOS)
        else:
            bg=Image.new("RGB",im.size,(255,255,255))
            if "A" in im.getbands():bg.paste(im.convert("RGBA"),mask=im.getchannel("A"))
            else:bg.paste(im.convert("RGB"))
            im=bg.resize((640,640),Image.Resampling.LANCZOS)
    out=io.BytesIO();im.save(out,format="WEBP",quality=85,method=6)
    return out.getvalue(),im.width,im.height

def pointer(job):
    rows=rest("rule_magic_symbols?select=id,symbol_key,"+",".join(FIELD.values())+"&id=eq."+job["target_id"])
    if len(rows)!=1 or rows[0]["symbol_key"]!=job["target_key"]:raise ValueError("TARGET_NOT_FOUND")
    return rows[0]

def patch_job(job,values):
    rows=rest("hermes_asset_jobs?id=eq."+job["id"]+"&lease_token=eq."+job["lease_token"],"PATCH",values)
    if len(rows)!=1:raise ValueError("JOB_LEASE_LOST")
    job.update(rows[0])
    return rows[0]

def publish(job,token,source):
    row=pointer(job);field=FIELD[job["image_type"]]
    previous=job.get("previous_path")
    current=row.get(field)
    if job.get("output_path") and current==job["output_path"]:
        if digest(storage_download(BUCKET,job["output_path"]))!=job["app_sha256"]:raise ValueError("PUBLIC_READBACK_MISMATCH")
        patch_job(job,{"state":"published","completed_at":datetime.now(timezone.utc).isoformat(),"error_code":None,"lease_token":None,"lease_until":None})
        return
    if current!=previous:raise ValueError("TARGET_CHANGED_DURING_PUBLICATION")
    webp,width,height=optimized_webp(source,job["image_type"])
    app_sha=digest(webp);kind=KIND[job["image_type"]]
    path="hermes/"+kind+"/"+job["target_key"]+"/"+app_sha+".webp"
    patch_job(job,{"state":"publishing","output_path":path,"app_sha256":app_sha,"error_code":None})
    try:
        request(SUPA+"/storage/v1/object/"+BUCKET+"/"+path,"POST",webp,{**BASE,"Content-Type":"image/webp","x-upsert":"false"},MAX)
    except urllib.error.HTTPError as e:
        if e.code!=409:raise
    if digest(storage_download(BUCKET,path))!=app_sha:raise ValueError("PUBLIC_READBACK_MISMATCH")
    filter_value="is.null" if previous is None else "eq."+urllib.parse.quote(previous,safe="")
    updated=rest("rule_magic_symbols?id=eq."+job["target_id"]+"&"+field+"="+filter_value,"PATCH",{field:path})
    if len(updated)!=1:
        if pointer(job).get(field)!=path:raise ValueError("TARGET_CHANGED_DURING_PUBLICATION")
    if pointer(job).get(field)!=path:raise ValueError("ACTIVATION_READBACK_MISMATCH")
    patch_job(job,{"state":"published","completed_at":datetime.now(timezone.utc).isoformat(),"error_code":None,"lease_token":None,"lease_until":None})

def process(job,token):
    source=storage_download(job["source_bucket"],job["source_path"])
    if len(source)!=job["source_bytes"] or digest(source)!=job["source_sha256"]:raise ValueError("STAGING_SHA256_MISMATCH")
    if job.get("archive_drive_file_id") is None:
        inbox=ensure_drive_original(token,job,INBOX,archive=False)
        patch_job(job,{"inbox_drive_file_id":inbox,"state":"inboxed"})
        job["inbox_drive_file_id"]=inbox
    else:verify_drive_file(token,job["inbox_drive_file_id"],INBOX,job["source_sha256"])
    if job.get("archive_drive_file_id") is None:
        archive=ensure_drive_original(token,job,ARCHIVE[job["image_type"]],archive=True)
        patch_job(job,{"archive_drive_file_id":archive,"state":"archived"})
        job["archive_drive_file_id"]=archive
    else:verify_drive_file(token,job["archive_drive_file_id"],ARCHIVE[job["image_type"]],job["source_sha256"])
    publish(job,token,source)

def fail_job(job,error):
    attempts=int(job.get("attempts",1))
    delay=min(3600,30*(2**min(max(attempts-1,0),7)))
    code=re.sub(r"[^A-Z0-9_]+","_",str(error).upper())[:64] or "WORKER_ERROR"
    try:
        patch_job(job,{"state":"failed","error_code":code,
            "next_attempt_at":(datetime.now(timezone.utc)+timedelta(seconds=delay)).isoformat(),
            "lease_token":None,"lease_until":None})
    except Exception:
        print("HERMES_ASSET_FAILURE_STATE_WRITE_FAILED",job.get("id"),code)

def run():
    token=drive_token()
    jobs=rest("rpc/hermes_claim_asset_jobs","POST",{"batch_size":3})
    failures=0
    for job in jobs:
        try:process(job,token);print("HERMES_ASSET_PUBLISHED",job["id"])
        except Exception as e:
            failures+=1;fail_job(job,e);print("HERMES_ASSET_FAILED",job["id"],type(e).__name__)
    if failures:raise RuntimeError("HERMES_ASSET_JOBS_FAILED_"+str(failures))

if __name__=="__main__":run()
