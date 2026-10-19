#!/usr/bin/env python3
"""HERMES: verified private portrait transfer Drive -> Supabase -> global_npcs.

Only a trusted GitHub Actions workflow may run publish mode. Original JPEG stays
in private HERMES Drive Inbox; never archive NPC portraits in public GitHub.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

INBOX = "1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp"
SUPABASE_URL = "https://wbmosmkirsitkonejzpg.supabase.co"
STORAGE_BUCKET = "campaign-actor-images"
PATTERN = re.compile(r"^hermes/npc-portraits/[a-z0-9-]{1,90}\.json$")
KEY_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DRIVE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{10,160}$")
HEX_SHA = re.compile(r"^[0-9a-f]{64}$")
MAX_SOURCE = 8_388_608
MAX_APP = 6_291_456


def request(url: str, token: str, *, method: str = "GET", body: bytes | None = None,
            mime: str | None = None, service: bool = False, allow: tuple[int, ...] = ()) -> tuple[int, bytes]:
    headers = {"Authorization": "Bearer " + token, "User-Agent": "ALEA-HERMES-NPC-1"}
    if service:
        headers["apikey"] = token
    if mime:
        headers["Content-Type"] = mime
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as result:
            return result.status, result.read(MAX_SOURCE + 524288)
    except urllib.error.HTTPError as exc:
        if exc.code in allow:
            return exc.code, b""
        # Never leak Authorization headers or credentials in errors.
        raise RuntimeError(f"HTTP {exc.code} for {method} {urllib.parse.urlsplit(url).path}") from None


def drive_portrait(file_id: str, expected_sha: str) -> tuple[bytes, dict]:
    token = os.environ["GOOGLE_ACCESS_TOKEN"]
    base = "https://www.googleapis.com/drive/v3/files/" + urllib.parse.quote(file_id, safe="")
    fields = "?fields=id,name,mimeType,size,parents,trashed"
    _, meta_body = request(base + fields, token)
    meta = json.loads(meta_body)
    if meta.get("trashed") or INBOX not in meta.get("parents", []):
        raise ValueError("DRIVE_FILE_NOT_IN_AUTHORIZED_INBOX")
    if meta.get("mimeType") != "image/jpeg" or not str(meta.get("name", "")).lower().endswith(".jpg"):
        raise ValueError("DRIVE_PORTRAIT_MUST_BE_JPEG")
    declared_size = int(meta.get("size", 0))
    if not 1024 <= declared_size <= MAX_SOURCE:
        raise ValueError("DRIVE_SOURCE_SIZE_OUT_OF_RANGE")
    _, data = request(base + "?alt=media", token)
    if len(data) != declared_size or hashlib.sha256(data).hexdigest() != expected_sha:
        raise ValueError("DRIVE_SOURCE_CHECKSUM_MISMATCH")
    if not data.startswith(b"\xff\xd8\xff"):
        raise ValueError("SOURCE_NOT_JPEG")
    return data, meta


def optimize_portrait(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as img:
        if img.format != "JPEG":
            raise ValueError("PORTRAIT_DECODE_NOT_JPEG")
        img.load()
        if not (640 <= img.width <= 4096 and 800 <= img.height <= 4096
                and img.height > img.width):
            raise ValueError("PORTRAIT_DIMENSIONS_NOT_APPROVED")
        img = ImageOps.exif_transpose(img).convert("RGB")
        # Preserve natural portrait framing; no generation/cropping/upscaling.
        if img.width > 1024 or img.height > 1536:
            img.thumbnail((1024, 1536), Image.Resampling.LANCZOS)
        result = io.BytesIO()
        img.save(result, format="WEBP", quality=87, method=6)
        out = result.getvalue()
        if not (1000 <= len(out) <= MAX_APP) or not out.startswith(b"RIFF"):
            raise ValueError("APP_PORTRAIT_INVALID_SIZE_OR_FORMAT")
        with Image.open(io.BytesIO(out)) as proof:
            if proof.format != "WEBP" or proof.size != img.size:
                raise ValueError("APP_PORTRAIT_DIMENSION_MISMATCH")
        return out


def storage_path(npc_key: str, digest: str) -> str:
    return f"global-npc/{npc_key}/{digest}.webp"


def storage_read(path: str, token: str) -> tuple[int, bytes]:
    url = SUPABASE_URL + "/storage/v1/object/" + STORAGE_BUCKET + "/" + path
    return request(url, token, service=True, allow=(400, 404))


def storage_publish(path: str, data: bytes, token: str) -> None:
    app_sha = hashlib.sha256(data).hexdigest()
    status, existing = storage_read(path, token)
    if status == 200:
        if hashlib.sha256(existing).hexdigest() != app_sha:
            raise ValueError("IMMUTABLE_STORAGE_OBJECT_CONFLICT")
        return
    if status not in (400, 404):
        raise ValueError("UNEXPECTED_STORAGE_READ_STATUS")
    url = SUPABASE_URL + "/storage/v1/object/" + STORAGE_BUCKET + "/" + path
    request(url, token, method="POST", body=data, mime="image/webp", service=True, allow=(409,))
    check_status, check = storage_read(path, token)
    if check_status != 200 or hashlib.sha256(check).hexdigest() != app_sha:
        raise ValueError("STORAGE_READBACK_CHECKSUM_FAILED")


def get_npc(key: str, token: str) -> dict:
    query = urllib.parse.urlencode({"npc_key": "eq." + key,
                                    "select": "id,npc_key,image_path,image_reference"})
    _, body = request(SUPABASE_URL + "/rest/v1/global_npcs?" + query, token, service=True)
    rows = json.loads(body)
    if len(rows) != 1:
        raise ValueError("NPC_KEY_NOT_UNIQUE_OR_MISSING")
    return rows[0]


def publish_npc(npc: dict, path: str, metadata: dict, token: str) -> None:
    current = get_npc(npc["npc_key"], token)
    previous = current.get("image_path")
    if previous and previous != path:
        raise ValueError("NPC_PORTRAIT_CAS_CONFLICT_EXISTING_PATH")
    updated_ref = {
        **(current.get("image_reference") or {}),
        **metadata,
        "verified": True,
        "published_by": "HERMES-npc-private",
    }
    if previous == path and all(current.get("image_reference", {}).get(k) == value
                                for k, value in metadata.items()):
        print(f"NPC_PORTRAIT_ALREADY_ACTIVE {npc['npc_key']} {path}")
        return
    if previous:
        raise ValueError("NPC_PORTRAIT_ALREADY_POINTED_TO_DIFFERENT_METADATA")
    query = urllib.parse.urlencode({"id": "eq." + current["id"], "image_path": "is.null",
                                    "select": "id,image_path,image_reference"})
    url = SUPABASE_URL + "/rest/v1/global_npcs?" + query
    payload = json.dumps({"image_path": path, "image_reference": updated_ref},
                         ensure_ascii=False).encode("utf-8")
    # Return representation is essential to detect CAS misses (0 affected rows).
    headers = {"Authorization": "Bearer " + token, "apikey": token,
               "Content-Type": "application/json", "Prefer": "return=representation",
               "User-Agent": "ALEA-HERMES-NPC-1"}
    req = urllib.request.Request(url, headers=headers, data=payload, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            changed = json.loads(response.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"SUPABASE_PATCH_FAILED_HTTP_{e.code}") from None
    if len(changed) != 1 or changed[0].get("image_path") != path:
        raise ValueError("NPC_PORTRAIT_CAS_UPDATE_FAILED")
    verified = get_npc(npc["npc_key"], token)
    if verified.get("image_path") != path:
        raise ValueError("DB_READBACK_MISMATCH")
    print(f"NPC_PORTRAIT_ACTIVE {npc['npc_key']} {path}")


def main() -> None:
    if len(sys.argv) not in (2, 3):
        raise SystemExit("usage: hermes_npc_portraits.py hermes/npc-portraits/<file>.json [verify|publish]")
    request_path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) == 3 else "verify"
    if not PATTERN.fullmatch(request_path) or mode not in ("verify", "publish"):
        raise ValueError("INVALID_REQUEST_OR_MODE")
    conf = json.loads(Path(request_path).read_text("utf-8"))
    rows = conf.get("portraits")
    if conf.get("schema") != 1 or not isinstance(rows, list) or len(rows) != 4:
        raise ValueError("INVALID_PORTRAIT_MANIFEST")
    keys = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("INVALID_PORTRAIT_ROW")
        key = row.get("npc_key")
        file_id = row.get("drive_file_id")
        source_sha = row.get("source_sha256")
        if not isinstance(key, str) or not KEY_PATTERN.fullmatch(key) or key in keys:
            raise ValueError("INVALID_OR_DUPLICATE_NPC_KEY")
        if not isinstance(file_id, str) or not DRIVE_ID_PATTERN.fullmatch(file_id):
            raise ValueError("INVALID_DRIVE_ID")
        if not isinstance(source_sha, str) or not HEX_SHA.fullmatch(source_sha):
            raise ValueError("INVALID_SOURCE_SHA")
        keys.add(key)
        data, drive_meta = drive_portrait(file_id, source_sha)
        webp = optimize_portrait(data)
        app_sha = hashlib.sha256(webp).hexdigest()
        path = storage_path(key, app_sha)
        print(f"NPC_PORTRAIT_VERIFIED {key} JPEG={len(data)} WebP={len(webp)} source_sha256={source_sha} app_sha256={app_sha}")
        if mode == "publish":
            key_secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            if not key_secret:
                raise ValueError("SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED")
            original = get_npc(key, key_secret)
            if original.get("image_path") not in (None, path):
                raise ValueError("NPC_PORTRAIT_EXISTING_DIFFERENT_MASTER_ABORTED")
            storage_publish(path, webp, key_secret)
            metadata = {
                "master": drive_meta["name"],
                "drive_file_id": file_id,
                "source_sha256": source_sha,
                "app_sha256": app_sha,
                "mime_type": "image/jpeg",
            }
            publish_npc(row, path, metadata, key_secret)
    print("NPC_PORTRAIT_" + ("PUBLISHED" if mode == "publish" else "VERIFY_OK") +
          " count=" + str(len(rows)))


if __name__ == "__main__":
    main()
