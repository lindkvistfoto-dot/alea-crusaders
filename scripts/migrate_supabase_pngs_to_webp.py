#!/usr/bin/env python3
"""Convert an allowlisted set of Supabase PNG assets to WebP and update their active references."""
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from io import BytesIO
from pathlib import Path
from PIL import Image

BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OUT = Path(os.environ.get("MIGRATION_DIR", "png-webp-migration"))

FILES = [
    {"bucket":"alea-battle-pose-staging","path":"battle-pose/character-npc/46a932b6-3ccc-45e6-9f84-7bde457affd3/standard/8da28560-726e-47b4-9c8b-14086189d0d5.png"},
    {"bucket":"alea-battle-pose-staging","path":"battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/5b8f2d16-f0dc-4595-bb63-3314dcf26714.png"},
    {"bucket":"alea-battle-pose-staging","path":"battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/79c738f2-a090-4d88-b14e-3cf0e8e2bf48.png"},
    {"bucket":"alea-battle-pose-staging","path":"battle-pose/character-npc/e8b28cfa-98ac-4e70-b610-1062685e7b94/standard/a021a350-e48b-4604-a385-5baf2634cefc.png"},
    {"bucket":"alea-battle-pose-staging","path":"battle-pose/character-npc/e8b28cfa-98ac-4e70-b610-1062685e7b94/sword_shield/7074a9c7-a401-4c10-bf3f-f0f01e139a3a.png"},
    {"bucket":"alea-battle-pose-staging","path":"battle-pose/enemy/be8bb82b-3024-469d-aaa7-c838c2cd0124/enhandssvard/7d39bbcb-8484-46f2-ae60-8f9d46b05d43.png"},
    {"bucket":"alea-battle-pose-staging","path":"battle-pose/enemy/be8bb82b-3024-469d-aaa7-c838c2cd0124/standard/09510cc4-644f-412a-89d7-73024d1c74d9.png"},
    {"bucket":"alea-skill-art","path":"skill/fiska/illustration_wide/7844ba04-6e32-4ed6-977f-18a0fb1e3ea0.png"},
    {"bucket":"alea-skill-art","path":"skill/klattra/icon/fd76290f-66e5-4dfd-8b3e-e3220a66c41d.png"},
    {"bucket":"alea-skill-art","path":"skill/klattra/illustration/456693fc-8673-42f7-9307-4c9f5bd76d2f.png"},
    {"bucket":"campaign-location-assets","path":"846e8089-24da-4825-af34-32903117152a/library/1475648d-1f32-4b75-86bf-ed9ad7aefc3b-Plats_1_-_Pr_standens_strid.png"},
    {"bucket":"campaign-location-assets","path":"846e8089-24da-4825-af34-32903117152a/library/49b23dee-3b80-4f35-8d4f-b110ced24610-Plats_1_-_d_rr_utan_sigill_-_kopia.png"},
    {"bucket":"campaign-location-assets","path":"846e8089-24da-4825-af34-32903117152a/library/592f2213-b381-4b33-b2de-e0a428a18ba8-Plats_1_-_med_sigillen_p__plats.png"},
    {"bucket":"campaign-location-assets","path":"846e8089-24da-4825-af34-32903117152a/library/844e1102-9c7a-439d-8970-c5d0da4b8529-Plats_1.png"},
    {"bucket":"campaign-location-assets","path":"846e8089-24da-4825-af34-32903117152a/library/8d0d9a3b-995f-41d4-9d87-55623034e48d-Plats_1.png"},
    {"bucket":"campaign-location-assets","path":"846e8089-24da-4825-af34-32903117152a/library/c4a8819d-3b13-4aeb-8389-7fe52acc480a-Plats_1_dekoration_-_kopia.png"},
    {"bucket":"combat-scene-maps","path":"846e8089-24da-4825-af34-32903117152a/8a65c17d-bace-47bd-94aa-0ea3b1ea5a4a/background-a77b0623-4459-4a1d-9d38-30c240a696d0.png"},
    {"bucket":"combat-scene-maps","path":"846e8089-24da-4825-af34-32903117152a/939b6c94-c52a-4b4e-b5d0-72db108f3d46/background-4380befc-c657-48ca-beaa-9899ddcbbd8e.png"},
]

REFS = [
    ("campaign_images","0a2bc80e-2a76-4086-a31b-51895a1089e5","storage_path","campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/8d0d9a3b-995f-41d4-9d87-55623034e48d-Plats_1.png",{"mime_type":"image/webp"}),
    ("campaign_images","11509fcc-4c19-4174-937f-8a45b2d2c9ca","storage_path","campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/844e1102-9c7a-439d-8970-c5d0da4b8529-Plats_1.png",{"mime_type":"image/webp"}),
    ("campaign_images","2c88c32b-2428-4f1b-bd83-126cacfd364b","storage_path","campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/49b23dee-3b80-4f35-8d4f-b110ced24610-Plats_1_-_d_rr_utan_sigill_-_kopia.png",{"mime_type":"image/webp"}),
    ("campaign_images","4ed6a083-65ef-49bd-9ef9-63f21e5dfa5f","storage_path","campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/592f2213-b381-4b33-b2de-e0a428a18ba8-Plats_1_-_med_sigillen_p__plats.png",{"mime_type":"image/webp"}),
    ("campaign_images","55c0a5d9-6240-4d5c-a5c2-ec9cf03ddb04","storage_path","campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/1475648d-1f32-4b75-86bf-ed9ad7aefc3b-Plats_1_-_Pr_standens_strid.png",{"mime_type":"image/webp"}),
    ("campaign_images","71af7de1-c552-441b-96d3-d304b91ef535","storage_path","campaign-location-assets","846e8089-24da-4825-af34-32903117152a/library/c4a8819d-3b13-4aeb-8389-7fe52acc480a-Plats_1_dekoration_-_kopia.png",{"mime_type":"image/webp"}),
    ("campaign_materials","bc653064-a2a0-4f85-a20f-f08ca5a84e99","storage_path","combat-scene-maps","846e8089-24da-4825-af34-32903117152a/8a65c17d-bace-47bd-94aa-0ea3b1ea5a4a/background-a77b0623-4459-4a1d-9d38-30c240a696d0.png",{"mime_type":"image/webp"}),
    ("campaign_materials","3bd90c02-07c8-4d71-ae23-ff0f9409b917","storage_path","combat-scene-maps","846e8089-24da-4825-af34-32903117152a/939b6c94-c52a-4b4e-b5d0-72db108f3d46/background-4380befc-c657-48ca-beaa-9899ddcbbd8e.png",{"mime_type":"image/webp"}),
    ("campaign_combat_scenes","8a65c17d-bace-47bd-94aa-0ea3b1ea5a4a","background_image_path","combat-scene-maps","846e8089-24da-4825-af34-32903117152a/8a65c17d-bace-47bd-94aa-0ea3b1ea5a4a/background-a77b0623-4459-4a1d-9d38-30c240a696d0.png",{}),
    ("campaign_combat_scenes","939b6c94-c52a-4b4e-b5d0-72db108f3d46","background_image_path","combat-scene-maps","846e8089-24da-4825-af34-32903117152a/939b6c94-c52a-4b4e-b5d0-72db108f3d46/background-4380befc-c657-48ca-beaa-9899ddcbbd8e.png",{}),
    ("rule_skills","fiska","illustration_wide_path","alea-skill-art","skill/fiska/illustration_wide/7844ba04-6e32-4ed6-977f-18a0fb1e3ea0.png",{}),
    ("rule_skills","klattra","icon_path","alea-skill-art","skill/klattra/icon/fd76290f-66e5-4dfd-8b3e-e3220a66c41d.png",{}),
    ("rule_skills","klattra","illustration_path","alea-skill-art","skill/klattra/illustration/456693fc-8673-42f7-9307-4c9f5bd76d2f.png",{}),
    ("combatant_battle_poses","c8a6f1bf-ed1f-4a9b-b7de-b6c4ba1ddfa2","staging_path","alea-battle-pose-staging","battle-pose/character-npc/46a932b6-3ccc-45e6-9f84-7bde457affd3/standard/8da28560-726e-47b4-9c8b-14086189d0d5.png",{}),
    ("combatant_battle_poses","18cc3c28-d75a-4c98-a0f1-773a75e9cb43","staging_path","alea-battle-pose-staging","battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/5b8f2d16-f0dc-4595-bb63-3314dcf26714.png",{}),
    ("combatant_battle_poses","18cc3c28-d75a-4c98-a0f1-773a75e9cb43","pending_staging_path","alea-battle-pose-staging","battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/79c738f2-a090-4d88-b14e-3cf0e8e2bf48.png",{}),
    ("combatant_battle_poses","2267ba55-5f25-4ee0-ad3e-10bcd168435d","staging_path","alea-battle-pose-staging","battle-pose/character-npc/e8b28cfa-98ac-4e70-b610-1062685e7b94/standard/a021a350-e48b-4604-a385-5baf2634cefc.png",{}),
    ("combatant_battle_poses","d0307875-5488-48c6-91f6-7608c19de768","staging_path","alea-battle-pose-staging","battle-pose/character-npc/e8b28cfa-98ac-4e70-b610-1062685e7b94/sword_shield/7074a9c7-a401-4c10-bf3f-f0f01e139a3a.png",{}),
    ("combatant_battle_poses","b95926e1-a4a8-4fe5-96b4-55fecc5be911","staging_path","alea-battle-pose-staging","battle-pose/enemy/be8bb82b-3024-469d-aaa7-c838c2cd0124/enhandssvard/7d39bbcb-8484-46f2-ae60-8f9d46b05d43.png",{}),
    ("combatant_battle_poses","1829a2fe-eac1-479e-9ba6-1769158aee17","staging_path","alea-battle-pose-staging","battle-pose/enemy/be8bb82b-3024-469d-aaa7-c838c2cd0124/standard/09510cc4-644f-412a-89d7-73024d1c74d9.png",{}),
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def request(url, method="GET", data=None, mime="application/json", extra=None):
    headers = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Cache-Control": "no-cache"}
    if data is not None:
        headers["Content-Type"] = mime
    if extra:
        headers.update(extra)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError("HTTP_" + str(error.code) + ":" + urllib.parse.urlsplit(url).path) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("NETWORK_ERROR:" + urllib.parse.urlsplit(url).path) from None

def storage_url(bucket, path):
    return BASE + "/storage/v1/object/" + bucket + "/" + urllib.parse.quote(path, safe="/")

def rest_url(table, key):
    return BASE + "/rest/v1/" + table + "?" + urllib.parse.urlencode({"id":"eq." + key, "select":"*"})

def db_get(table, key):
    rows = json.loads(request(rest_url(table, key), extra={"Accept":"application/json"}))
    if len(rows) != 1:
        raise RuntimeError("DB_ROW_NOT_UNIQUE:" + table + ":" + key + ":" + str(len(rows)))
    return rows[0]

def db_patch(table, key, body):
    data = json.dumps(body).encode("utf-8")
    rows = json.loads(request(rest_url(table, key), "PATCH", data, extra={"Prefer":"return=representation","Accept":"application/json"}))
    if len(rows) != 1:
        raise RuntimeError("DB_PATCH_NOT_UNIQUE:" + table + ":" + key + ":" + str(len(rows)))
    return rows[0]

def convert(data):
    with Image.open(BytesIO(data)) as image:
        if image.format != "PNG":
            raise RuntimeError("SOURCE_NOT_PNG")
        width, height = image.size
        alpha = "A" in image.getbands() or "transparency" in image.info
        mode = "RGBA" if alpha else "RGB"
        if image.mode != mode:
            image = image.convert(mode)
        result = BytesIO()
        image.save(result, format="WEBP", lossless=True, exact=True, method=6)
        return result.getvalue(), width, height, alpha

def main():
    if not BASE.startswith("https://") or not KEY:
        raise RuntimeError("SUPABASE_CONFIGURATION_MISSING")
    OUT.mkdir(parents=True, exist_ok=True)
    mapping = {(item["bucket"],item["path"]):item for item in FILES}
    for item in FILES:
        item["webp_path"] = item["path"][:-4] + ".webp"

    # Preflight: confirm every source is present, every target is unused, and every DB pointer is unchanged.
    source_bytes = {}
    for item in FILES:
        source_bytes[(item["bucket"],item["path"])] = request(storage_url(item["bucket"],item["path"]))
    for ref in REFS:
        table,key,field,bucket,path,extra = ref
        row = db_get(table,key)
        if row.get(field) != path:
            raise RuntimeError("DB_REFERENCE_MISMATCH:" + table + ":" + key + ":" + field)
        item = mapping[(bucket,path)]
        row["_webp_target_path"] = item["webp_path"]

    converted = {}
    report_files = []
    for item in FILES:
        source = source_bytes[(item["bucket"],item["path"])]
        webp,width,height,alpha = convert(source)
        item.update({
            "png_bytes":len(source),"png_sha256":sha(source),
            "webp_bytes":len(webp),"webp_sha256":sha(webp),
            "width":width,"height":height,"has_alpha":alpha,
        })
        converted[(item["bucket"],item["path"])] = webp
        report_files.append({k:item[k] for k in ("bucket","path","webp_path","png_bytes","webp_bytes","png_sha256","webp_sha256","width","height","has_alpha")})

    # Upload WebPs beside the originals and verify exact bytes before touching database pointers.
    for item in FILES:
        key=(item["bucket"],item["path"])
        webp=converted[key]
        target=storage_url(item["bucket"],item["webp_path"])
        request(target,"POST",webp,"image/webp",{"x-upsert":"false"})
        if sha(request(target)) != item["webp_sha256"]:
            raise RuntimeError("WEBP_READBACK_HASH_MISMATCH:" + item["bucket"] + ":" + item["webp_path"])

    # Update only the explicitly audited active references. The original filename fields remain provenance.
    updated_refs=[]
    for table,key,field,bucket,path,extra in REFS:
        item=mapping[(bucket,path)]
        row=db_get(table,key)
        current=row.get(field)
        if current == path:
            body={field:item["webp_path"],**extra}
            if table=="campaign_materials":
                body.update({"file_size_bytes":item["webp_bytes"],"sha256":item["webp_sha256"]})
            db_patch(table,key,body)
        elif current != item["webp_path"]:
            raise RuntimeError("DB_REFERENCE_CHANGED_DURING_RUN:" + table + ":" + key + ":" + field)
        updated_refs.append({"table":table,"id":key,"field":field,"from":path,"to":item["webp_path"]})

    # Confirm no audited application pointer still targets one of these PNGs before deleting originals.
    for table,key,field,bucket,path,extra in REFS:
        row=db_get(table,key)
        item=mapping[(bucket,path)]
        if row.get(field) != item["webp_path"]:
            raise RuntimeError("DB_REFERENCE_NOT_UPDATED:" + table + ":" + key + ":" + field)

    grouped=defaultdict(list)
    for item in FILES:
        grouped[item["bucket"]].append(item["path"])
    for bucket,paths in grouped.items():
        request(BASE+"/storage/v1/object/"+bucket,"DELETE",json.dumps({"prefixes":paths}).encode("utf-8"))

    # Verify deletion through the Storage listing endpoint, avoiding cached file-download URLs.
    for item in FILES:
        parent,name=item["path"].rsplit("/",1)
        body=json.dumps({"prefix":parent,"limit":100,"offset":0,"search":name}).encode("utf-8")
        matches=json.loads(request(BASE+"/storage/v1/object/list/"+item["bucket"],"POST",body))
        if any(obj.get("name")==name or obj.get("name")==item["path"] for obj in matches):
            raise RuntimeError("PNG_STILL_LISTED_AFTER_DELETE:"+item["bucket"]+":"+item["path"])

    report={
        "result":"converted_referenced_and_pngs_removed",
        "file_count":len(FILES),
        "reference_updates":len(updated_refs),
        "source_bytes":sum(x["png_bytes"] for x in FILES),
        "webp_bytes":sum(x["webp_bytes"] for x in FILES),
        "saved_bytes":sum(x["png_bytes"]-x["webp_bytes"] for x in FILES),
        "archive_drive_file":"1O8QQtwtvTFtuI3K9XqNC9-XxJTs3iC58",
        "files":report_files,
        "updated_references":updated_refs,
    }
    (OUT/"migration-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:report[k] for k in ("result","file_count","reference_updates","source_bytes","webp_bytes","saved_bytes")}))

if __name__=="__main__":
    main()
