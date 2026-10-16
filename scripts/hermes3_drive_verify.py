#!/usr/bin/env python3
"""HERMES 3: main-only, read-only Google Drive source verification.
Outputs a short-lived verified CI artifact, NEVER GitHub commits or database writes.
Only explicitly approved *public* materials are permitted in this public repository.
"""
from __future__ import annotations
import hashlib
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image, ImageFile

Image.MAX_IMAGE_PIXELS = 32_000_000
ImageFile.LOAD_TRUNCATED_IMAGES = False
ROOT = Path(__file__).resolve().parents[1]
INBOX = "1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp"
DRIVE_ID = re.compile(r"^[A-Za-z0-9_-]{10,160}$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")
REQUEST = re.compile(r"^hermes3/requests/[a-z0-9-]+\.json$")
MIMES = {"image/png": ".png", "image/jpeg": ".jpg",
         "application/zip": ".zip", "application/x-zip-compressed": ".zip"}

def check(condition: bool, code: str):
    if not condition:
        raise ValueError("HERMES3_" + code)

def safe_get(url: str, token: str, max_bytes: int) -> bytes:
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token, "User-Agent": "Alea-HERMES3-Verified-Intake"
    })
    with urllib.request.urlopen(req, timeout=60) as res:
        data = res.read(max_bytes + 1)
        check(len(data) <= max_bytes, "RESPONSE_TOO_LARGE")
        return data

def check_png_jpeg(data: bytes, mime: str, alpha_policy: str):
    with Image.open(io.BytesIO(data)) as img:
        img.load()
        fmt = {"image/png": "PNG", "image/jpeg": "JPEG"}[mime]
        check(img.format == fmt, "IMAGE_FORMAT_MISMATCH")
        check(16 <= img.width <= 8192 and 16 <= img.height <= 8192,
              "BAD_IMAGE_DIMENSIONS")
        extrema = img.convert("RGBA").getchannel("A").getextrema()
        if alpha_policy == "required":
            check(img.mode == "RGBA" and extrema[0] == 0 and extrema[1] == 255,
                  "TRANSPARENCY_REQUIRED")
        if alpha_policy == "forbidden":
            check(extrema == (255, 255), "TRANSPARENCY_FORBIDDEN")
        return [img.width, img.height]

def check_sprite_zip(data: bytes):
    count, total, report = 0, 0, []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = z.infolist()
        check(1 <= len(infos) <= 96, "ZIP_MEMBER_COUNT")
        for info in infos:
            name = info.filename
            parts = name.split("/")
            check(name and not name.startswith("/") and "\\" not in name and
                  all(p not in (".", "..", "") for p in parts if p != parts[-1] or p) and
                  not (info.external_attr >> 16 & 0o170000) == 0o120000,
                  "UNSAFE_ZIP_ENTRY")
            if info.is_dir():
                continue
            check(info.file_size <= 3_000_000 and info.compress_size <= 3_000_000,
                  "ZIP_ENTRY_TOO_LARGE")
            total += info.file_size
            check(total <= 20_000_000, "ZIP_EXPANDED_TOO_LARGE")
            suffix = Path(name).suffix.lower()
            check(suffix in (".png", ".json"), "ZIP_DISALLOWED_TYPE")
            raw = z.read(info)
            check(len(raw) == info.file_size, "ZIP_TRUNCATED_ENTRY")
            if suffix == ".png":
                check_png_jpeg(raw, "image/png", "required")
                report.append({"name": name, "sha256": hashlib.sha256(raw).hexdigest()})
                count += 1
            else:
                check(len(raw) <= 120_000, "ZIP_JSON_TOO_LARGE")
                json.loads(raw.decode("utf8"))
    check(1 <= count <= 64, "ZIP_SPRITE_COUNT")
    return {"sprites": count, "parts": report}

def process(relative_path: str, output: Path):
    check(bool(REQUEST.fullmatch(relative_path)), "JOB_PATH_INVALID")
    job = json.loads((ROOT / relative_path).read_text("utf8"))
    registry = json.loads((ROOT / "config/hermes3-profiles.json").read_text("utf8"))
    profiles = registry["profiles"]
    profile = profiles.get(job.get("profile"))
    check(profile is not None and profile["stage"] == "verify", "PROFILE_BLOCKED")
    check(job.get("schema") == 3 and job.get("intent") == "verify-only",
          "INTENT_INVALID")
    src = job.get("source")
    check(isinstance(src, dict) and set(src) == {
        "provider", "file_id", "sha256", "mime_type", "visibility",
        "public_release_approved"
    }, "SOURCE_FIELDS")
    check(src["provider"] == "google-drive" and
          src["visibility"] == "public" and src["public_release_approved"] is True,
          "PUBLIC_MEDIA_APPROVAL_REQUIRED")
    check(bool(DRIVE_ID.fullmatch(src["file_id"])) and
          bool(DIGEST.fullmatch(src["sha256"])) and
          src["mime_type"] in profile["mimes"], "SOURCE_INVALID")
    max_bytes = min(profile["max_bytes"], registry["policy"]["max_request_bytes"])
    url = "https://www.googleapis.com/drive/v3/files/" + urllib.parse.quote(src["file_id"])
    token = os.environ["GOOGLE_ACCESS_TOKEN"]
    meta = json.loads(safe_get(
        url + "?fields=id,name,mimeType,size,trashed,parents", token, 50000))
    check(not meta.get("trashed") and INBOX in meta.get("parents", []) and
          meta.get("mimeType") == src["mime_type"] and
          100 <= int(meta.get("size", 0)) <= max_bytes,
          "DRIVE_METADATA_REJECTED")
    data = safe_get(url + "?alt=media", token, max_bytes)
    check(len(data) == int(meta["size"]), "DOWNLOAD_TRUNCATED")
    checksum = hashlib.sha256(data).hexdigest()
    check(checksum == src["sha256"], "SOURCE_SHA256_MISMATCH")
    dims = None
    sprites = None
    if src["mime_type"] in ("image/png", "image/jpeg"):
        dims = check_png_jpeg(data, src["mime_type"], profile["alpha"])
    else:
        sprites = check_sprite_zip(data)
    output.mkdir(parents=True, exist_ok=True)
    source_name = "verified-source" + MIMES[src["mime_type"]]
    (output / source_name).write_bytes(data)
    receipt = {
        "schema": 3, "status": "verified-only", "job_id": job["job_id"],
        "profile": job["profile"], "mime_type": src["mime_type"],
        "source_sha256": checksum, "source_bytes": len(data),
        "artifact_filename": source_name, "dimensions": dims, "package": sprites,
        "production_published": False, "database_activated": False
    }
    (output / "verification.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf8")
    print("HERMES3_SOURCE_VERIFIED", job["job_id"], checksum, len(data))
    print("HERMES3_VERIFY_ONLY_NO_PUBLICATION")

if __name__ == "__main__":
    check(os.environ.get("GITHUB_REPOSITORY") == "lindkvistfoto-dot/alea-crusaders"
          and os.environ.get("GITHUB_REF") == "refs/heads/main", "UNTRUSTED_RUN_CONTEXT")
    check(len(sys.argv) == 3, "ARGUMENTS")
    process(sys.argv[1], Path(sys.argv[2]).resolve())
