#!/usr/bin/env python3
"""Convert a fixed, archived allowlist of Supabase PNGs and upload sibling WebP files."""
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path
from PIL import Image

BASE=os.environ["SUPABASE_URL"].rstrip("/")
KEY=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OUT=Path(os.environ.get("MIGRATION_DIR","png-webp-migration"))
FILES=[
 ("alea-battle-pose-staging","battle-pose/character-npc/46a932b6-3ccc-45e6-9f84-7bde457affd3/standard/8da28560-726e-47b4-9c8b-14086189d0d5.png"),
 ("alea-battle-pose-staging","battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/5b8f2d16-f0dc-4595-bb63-3314dcf26714.png"),
 ("alea-battle-pose-staging","battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/79c738f2-a090-4d88-b14e-3cf0e8e2bf48.png"),
 ("alea-battle-pose-staging","battle-pose/character-npc/e8b28cfa-98ac-4e70-b610-1062685e7b94/standard/a021a350-e48b-4604-a385-5baf2634cefc.png"),
 ("alea-battle-pose-staging","battle-pose/character-npc/e8b28cfa-98ac-4e70-b610-1062685e7b94/sword_shield/7074a9c7-a401-4c10-bf3f-f0f01e139a3a.png"),
 ("alea-battle-pose-staging","battle-pose/enemy/be8bb82b-3024-469d-aaa7-c838c2cd0124/enhandssvard/7d39bbcb-8484-46f2-ae60-8f9d46b05d43.png"),
 ("alea-battle-pose-staging","battle-pose/enemy/be8bb82b-3024-469d-aaa7-c838c2cd0124/standard/09510cc4-644f-412a-89d7-73024d1c74d9.png"),
 ("alea-skill-art","skill/fiska/illustration_wide/7844ba04-6e32-4ed6-977f-18a0fb1e3ea0.png"),
 ("alea-skill-art","skill/klattra/icon/fd76290f-66e5-4dfd-8b3e-e3220a66c41d.png"),
 ("alea-skill-art","skill/klattra/illustration/456693fc-8673-42f7-9307-4c9f5bd76d2f.png"),
 ("campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/1475648d-1f32-4b75-86bf-ed9ad7aefc3b-Plats_1_-_Pr_standens_strid.png"),
 ("campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/49b23dee-3b80-4f35-8d4f-b110ced24610-Plats_1_-_d_rr_utan_sigill_-_kopia.png"),
 ("campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/592f2213-b381-4b33-b2de-e0a428a18ba8-Plats_1_-_med_sigillen_p__plats.png"),
 ("campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/844e1102-9c7a-439d-8970-c5d0da4b8529-Plats_1.png"),
 ("campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/8d0d9a3b-995f-41d4-9d87-55623034e48d-Plats_1.png"),
 ("campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/c4a8819d-3b13-4aeb-8389-7fe52acc480a-Plats_1_dekoration_-_kopia.png"),
 ("combat-scene-maps","846e8089-24da-4825-af34-32903117152a/8a65c17d-bace-47bd-94aa-0ea3b1ea5a4a/background-a77b0623-4459-4a1d-9d38-30c240a696d0.png"),
 ("combat-scene-maps","846e8089-24da-4825-af34-32903117152a/939b6c94-c52a-4b4e-b5d0-72db108f3d46/background-4380befc-c657-48ca-beaa-9899ddcbbd8e.png"),
]
def sha(data): return hashlib.sha256(data).hexdigest()
def request(url,method="GET",data=None,mime="application/json",extra=None):
 headers={"apikey":KEY,"Authorization":"Bearer "+KEY,"Cache-Control":"no-cache"}
 if data is not None: headers["Content-Type"]=mime
 if extra: headers.update(extra)
 req=urllib.request.Request(url,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=90) as response: return response.read()
 except urllib.error.HTTPError as error: raise RuntimeError("HTTP_"+str(error.code)+":"+urllib.parse.urlsplit(url).path) from None
 except (urllib.error.URLError,TimeoutError): raise RuntimeError("NETWORK_ERROR:"+urllib.parse.urlsplit(url).path) from None
def url(bucket,path): return BASE+"/storage/v1/object/"+bucket+"/"+urllib.parse.quote(path,safe="/")
def convert(data):
 with Image.open(BytesIO(data)) as image:
  if image.format!="PNG": raise RuntimeError("SOURCE_NOT_PNG")
  width,height=image.size
  alpha="A" in image.getbands() or "transparency" in image.info
  mode="RGBA" if alpha else "RGB"
  if image.mode!=mode: image=image.convert(mode)
  out=BytesIO()
  image.save(out,format="WEBP",lossless=True,exact=True,method=6)
  return out.getvalue(),width,height,alpha
def main():
 if not BASE.startswith("https://") or not KEY: raise RuntimeError("SUPABASE_CONFIGURATION_MISSING")
 OUT.mkdir(parents=True,exist_ok=True)
 report=[]
 for bucket,path in FILES:
  source=request(url(bucket,path))
  if not source.startswith(b"\x89PNG\r\n\x1a\n"): raise RuntimeError("SOURCE_NOT_PNG_MAGIC:"+path)
  webp,width,height,alpha=convert(source)
  target=path[:-4]+".webp"
  # Refuse to overwrite a pre-existing WebP, since that needs a separate content comparison.
  try:
   request(url(bucket,target))
  except RuntimeError as error:
   if "HTTP_404" not in str(error): raise
  else:
   raise RuntimeError("WEBP_TARGET_ALREADY_EXISTS:"+bucket+":"+target)
  request(url(bucket,target),"POST",webp,"image/webp",{"x-upsert":"false"})
  if sha(request(url(bucket,target)))!=sha(webp): raise RuntimeError("WEBP_READBACK_HASH_MISMATCH:"+bucket+":"+target)
  report.append({"bucket":bucket,"png_path":path,"webp_path":target,"png_bytes":len(source),"webp_bytes":len(webp),"saved_bytes":len(source)-len(webp),"png_sha256":sha(source),"webp_sha256":sha(webp),"width":width,"height":height,"has_alpha":alpha})
 result={"result":"webp_uploaded_and_hash_verified","file_count":len(report),"source_bytes":sum(x["png_bytes"] for x in report),"webp_bytes":sum(x["webp_bytes"] for x in report),"saved_bytes":sum(x["saved_bytes"] for x in report),"files":report}
 (OUT/"migration-report.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({k:result[k] for k in ("result","file_count","source_bytes","webp_bytes","saved_bytes")}))
if __name__=="__main__": main()
