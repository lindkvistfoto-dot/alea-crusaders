#!/usr/bin/env python3
"""Convert the three registered campaign maps; keep PNGs until a separate cleanup run."""
import hashlib, json, os, urllib.error, urllib.parse, urllib.request
from io import BytesIO
from pathlib import Path
from PIL import Image

BASE=os.environ["SUPABASE_URL"].rstrip("/")
KEY=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PHASE=os.environ["MAP_PHASE"]
OUT=Path(os.environ.get("MAP_OUTPUT_DIR","map-webp-output"))
BUCKET="campaign-maps"
PREFIX="846e8089-24da-4825-af34-32903117152a/"
MAPS=[
 ("Grottsystem","bf8f0021-cb90-40c7-a262-00fc539c5208"),
 ("Skelettbyn","dca58a7b-217d-46bc-8526-1468fad1dd69"),
 ("Testkarta","eb1e1361-f4f3-4e5a-9054-233eab40e0f0"),
]
DUPLICATES=[
 "2d51d0d7-5973-482e-aede-2e6c145f43b0",
 "dec16fae-5c56-4e77-9b3f-be084e86878e",
]
def sha(b): return hashlib.sha256(b).hexdigest()
def request(url,method="GET",data=None,mime="application/json",extra=None):
 headers={"apikey":KEY,"Authorization":"Bearer "+KEY}
 if data is not None: headers["Content-Type"]=mime
 if extra: headers.update(extra)
 req=urllib.request.Request(url,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=60) as response: return response.read()
 except urllib.error.HTTPError as e: raise RuntimeError("SUPABASE_STORAGE_HTTP_"+str(e.code)) from None
 except (urllib.error.URLError,TimeoutError): raise RuntimeError("SUPABASE_STORAGE_NETWORK_ERROR") from None
def path_url(p): return urllib.parse.quote(p,safe="/")
def get(p): return request(BASE+"/storage/v1/object/"+BUCKET+"/"+path_url(p))
def put(p,b):
 request(BASE+"/storage/v1/object/"+BUCKET+"/"+path_url(p),"POST",b,"image/webp",{"x-upsert":"true"})
 if sha(get(p))!=sha(b): raise RuntimeError("WEBP_READBACK_HASH_MISMATCH")
def convert(b):
 with Image.open(BytesIO(b)) as im:
  if im.format!="PNG": raise RuntimeError("SOURCE_NOT_PNG")
  w,h=im.size; out=BytesIO()
  im.save(out,format="WEBP",lossless=True,exact=True,method=6)
  return out.getvalue(),w,h
def run_convert():
 OUT.mkdir(parents=True,exist_ok=True); report=[]
 for name,mid in MAPS:
  png_path=PREFIX+mid+"/map.png"; webp_path=PREFIX+mid+"/map.webp"
  original=get(png_path); webp,w,h=convert(original)
  put(webp_path,webp)
  (OUT/(name+"-original.png")).write_bytes(original)
  (OUT/(name+".webp")).write_bytes(webp)
  report.append({"name":name,"png_path":png_path,"webp_path":webp_path,
   "png_sha256":sha(original),"webp_sha256":sha(webp),"png_bytes":len(original),
   "webp_bytes":len(webp),"width":w,"height":h})
 result={"phase":"convert","maps":report,"pngs_kept":True}
 (OUT/"manifest.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps(result,ensure_ascii=False))
def run_cleanup():
 grott=get(PREFIX+MAPS[0][1]+"/map.png"); remove=[]
 for name,mid in MAPS:
  old=PREFIX+mid+"/map.png"; new=PREFIX+mid+"/map.webp"
  if not get(new): raise RuntimeError("MISSING_WEBP_"+mid)
  remove.append(old)
 for mid in DUPLICATES:
  duplicate=PREFIX+mid+"/map.png"
  if sha(get(duplicate))!=sha(grott): raise RuntimeError("DUPLICATE_HASH_MISMATCH_"+mid)
  remove.append(duplicate)
 request(BASE+"/storage/v1/object/"+BUCKET,"DELETE",
         json.dumps({"prefixes":remove}).encode())
 (OUT/"cleanup-report.json").write_text(json.dumps({"phase":"cleanup","deleted":remove},indent=2)+"\n")
 print(json.dumps({"phase":"cleanup","deleted_png_count":len(remove)}))
if __name__=="__main__":
 if not BASE.startswith("https://") or not KEY: raise RuntimeError("SUPABASE_CONFIGURATION_MISSING")
 if PHASE=="convert": run_convert()
 elif PHASE=="cleanup": run_cleanup()
 else: raise RuntimeError("INVALID_MAP_PHASE")
