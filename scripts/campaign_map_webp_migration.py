#!/usr/bin/env python3
"""Two-phase, explicitly scoped campaign-map PNG -> lossless WebP migration."""
import hashlib, json, os, re, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image

BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MODE = os.environ["MAP_MIGRATION_MODE"]
OUT = Path(os.environ.get("MAP_OUTPUT_DIR", "campaign-map-migration"))
ARCHIVE_ID = os.environ.get("ARCHIVE_DRIVE_FILE_ID", "")
GOOGLE_TOKEN = os.environ.get("GOOGLE_ACCESS_TOKEN", "")
ARCHIVE_FOLDER = "1eYe8Vvvcd31UCVbJvfX3kkOuBS3ahqeC"
MAPS = [
    {"name":"Grottsystem","id":"bf8f0021-cb90-40c7-a262-00fc539c5208","png":"846e8089-24da-4825-af34-32903117152a/bf8f0021-cb90-40c7-a262-00fc539c5208/map.png"},
    {"name":"Skelettbyn","id":"dca58a7b-217d-46bc-8526-1468fad1dd69","png":"846e8089-24da-4825-af34-32903117152a/dca58a7b-217d-46bc-8526-1468fad1dd69/map.png"},
    {"name":"Testkarta","id":"eb1e1361-f4f3-4e5a-9054-233eab40e0f0","png":"846e8089-24da-4825-af34-32903117152a/eb1e1361-f4f3-4e5a-9054-233eab40e0f0/map.png"},
]
ORPHANS = [
    "846e8089-24da-4825-af34-32903117152a/2d51d0d7-5973-482e-aede-2e6c145f43b0/map.png",
    "846e8089-24da-4825-af34-32903117152a/dec16fae-5c56-4e77-9b3f-be084e86878e/map.png",
]
TIMEOUT = 60

def sha(data): return hashlib.sha256(data).hexdigest()

def req(url, method="GET", body=None, content_type="application/json", extra=None, google=False):
    headers = {"Authorization": "Bearer " + (GOOGLE_TOKEN if google else KEY)}
    if not google: headers["apikey"] = KEY
    if body is not None: headers["Content-Type"] = content_type
    if extra: headers.update(extra)
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(("GOOGLE" if google else "SUPABASE") + "_HTTP_" + str(e.code)) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("NETWORK_ERROR") from None

def db_get(table, query):
    rows = json.loads(req(BASE + "/rest/v1/" + table + "?" + query))
    if not isinstance(rows, list): raise RuntimeError("UNEXPECTED_DB_RESPONSE_" + table)
    return rows

def db_patch(table, query, values):
    raw = req(BASE + "/rest/v1/" + table + "?" + query, "PATCH",
              json.dumps(values).encode(), extra={"Prefer":"return=representation"})
    rows = json.loads(raw or b"[]")
    if not isinstance(rows, list) or not rows: raise RuntimeError("DB_UPDATE_NO_ROWS_" + table)
    return rows

def object_path(path): return urllib.parse.quote(path, safe="/")
def storage_get(path):
    return req(BASE + "/storage/v1/object/campaign-maps/" + object_path(path))
def storage_upload(path, data):
    req(BASE + "/storage/v1/object/campaign-maps/" + object_path(path), "POST", data,
        content_type="image/webp", extra={"x-upsert":"true"})
    if sha(storage_get(path)) != sha(data): raise RuntimeError("WEBP_STORAGE_READBACK_HASH_MISMATCH")
def storage_delete(paths):
    req(BASE + "/storage/v1/object/campaign-maps", "DELETE",
        json.dumps({"prefixes":paths}).encode())

def convert(data):
    from io import BytesIO
    with Image.open(BytesIO(data)) as image:
        if image.format != "PNG": raise RuntimeError("SOURCE_NOT_PNG")
        width, height = image.size
        output = BytesIO()
        image.save(output, format="WEBP", lossless=True, exact=True, method=6)
        return output.getvalue(), width, height

def validate_db():
    for m in MAPS:
        rows = db_get("campaign_maps", "select=id,campaign_id,name,image_path,width,height&id=eq." + m["id"])
        if len(rows) != 1 or rows[0].get("image_path") != m["png"]:
            raise RuntimeError("MAP_ROW_MISMATCH_" + m["id"])
        query = ("select=id,storage_bucket,storage_path,mime_type,file_size_bytes,sha256"
                 "&storage_bucket=eq.campaign-maps&storage_path=eq."
                 + urllib.parse.quote(m["png"], safe=""))
        materials = db_get("campaign_materials", query)
        if not materials: raise RuntimeError("MAP_MATERIAL_MISSING_" + m["id"])
        m["materials"] = materials

def archive_original():
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", ARCHIVE_ID):
        raise RuntimeError("ARCHIVE_DRIVE_FILE_ID_REQUIRED")
    meta = json.loads(req("https://www.googleapis.com/drive/v3/files/" + ARCHIVE_ID +
        "?fields=id,name,mimeType,parents,trashed", google=True))
    if meta.get("trashed") or ARCHIVE_FOLDER not in meta.get("parents", []):
        raise RuntimeError("ARCHIVE_FILE_NOT_IN_CONFIGURED_MAPS_FOLDER")
    if meta.get("name") != "Skelettbyn-original.png":
        raise RuntimeError("ARCHIVE_FILE_NAME_MISMATCH")
    archived = req("https://www.googleapis.com/drive/v3/files/" + ARCHIVE_ID + "?alt=media", google=True)
    source = storage_get(next(m["png"] for m in MAPS if m["name"] == "Skelettbyn"))
    if sha(archived) != sha(source): raise RuntimeError("ARCHIVE_SHA256_MISMATCH")
    return source

def prepare():
    validate_db()
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"mode":"prepare_only","project":BASE,"maps":[],"orphan_duplicates":ORPHANS,
              "warning":"No Supabase objects or database rows were changed."}
    for m in MAPS:
        original = storage_get(m["png"])
        webp, width, height = convert(original)
        (OUT / (m["name"] + "-original.png")).write_bytes(original)
        (OUT / (m["name"] + ".webp")).write_bytes(webp)
        report["maps"].append({"name":m["name"],"png_path":m["png"],
            "webp_path":m["png"][:-4]+".webp","png_sha256":sha(original),
            "webp_sha256":sha(webp),"png_bytes":len(original),"webp_bytes":len(webp),
            "width":width,"height":height})
    (OUT/"manifest.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(report,ensure_ascii=False))

def apply():
    if not GOOGLE_TOKEN: raise RuntimeError("GOOGLE_READONLY_TOKEN_REQUIRED")
    validate_db()
    originals = {m["png"]:storage_get(m["png"]) for m in MAPS}
    skeleton_path = next(m["png"] for m in MAPS if m["name"] == "Skelettbyn")
    if sha(archive_original()) != sha(originals[skeleton_path]):
        raise RuntimeError("ARCHIVE_CHANGED_DURING_MIGRATION")
    for m in MAPS:
        m["webp"], m["width"], m["height"] = convert(originals[m["png"]])
        m["webp_path"] = m["png"][:-4] + ".webp"
    # Upload and verify all replacement files before changing any database paths.
    for m in MAPS: storage_upload(m["webp_path"], m["webp"])
    # Update associated material rows and map rows. Keep PNGs until all readbacks pass.
    for m in MAPS:
        for material in m["materials"]:
            q = "id=eq." + urllib.parse.quote(str(material["id"]), safe="")
            db_patch("campaign_materials", q + "&select=id,storage_path", {"storage_path":m["webp_path"],
                "mime_type":"image/webp","file_size_bytes":len(m["webp"]),
                "sha256":sha(m["webp"])})
        db_patch("campaign_maps", "id=eq."+m["id"]+"&select=id,image_path,width,height", {"image_path":m["webp_path"],
            "width":m["width"],"height":m["height"]})
    for m in MAPS:
        if storage_get(m["webp_path"]) != m["webp"]: raise RuntimeError("WEBP_READBACK_MISMATCH")
        rows = db_get("campaign_maps","select=id,image_path&id=eq."+m["id"])
        if len(rows)!=1 or rows[0].get("image_path")!=m["webp_path"]:
            raise RuntimeError("MAP_PATH_READBACK_MISMATCH")
        q = ("select=id,storage_path&storage_bucket=eq.campaign-maps&storage_path=eq."
             + urllib.parse.quote(m["webp_path"],safe=""))
        if len(db_get("campaign_materials",q)) < len(m["materials"]):
            raise RuntimeError("MATERIAL_PATH_READBACK_MISMATCH")
    # The two unattached objects were identified as Grottsystem duplicates in the audit.
    for orphan in ORPHANS:
        if sha(storage_get(orphan)) != sha(originals[MAPS[0]["png"]]):
            raise RuntimeError("ORPHAN_DUPLICATE_HASH_MISMATCH")
        q = "select=id&image_path=eq." + urllib.parse.quote(orphan,safe="")
        if db_get("campaign_maps",q): raise RuntimeError("ORPHAN_HAS_MAP_REFERENCE")
    storage_delete([m["png"] for m in MAPS] + ORPHANS)
    report = {"mode":"applied","maps":[{"name":m["name"],"webp_path":m["webp_path"],
        "webp_sha256":sha(m["webp"]),"webp_bytes":len(m["webp"])} for m in MAPS],
        "deleted_png_count":len(MAPS)+len(ORPHANS),"archive_drive_file_id":ARCHIVE_ID}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/"applied-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(report,ensure_ascii=False))

if __name__ == "__main__":
    if not BASE.startswith("https://") or not KEY: raise RuntimeError("SUPABASE_CONFIGURATION_MISSING")
    if MODE == "prepare": prepare()
    elif MODE == "apply": apply()
    else: raise RuntimeError("INVALID_MIGRATION_MODE")
