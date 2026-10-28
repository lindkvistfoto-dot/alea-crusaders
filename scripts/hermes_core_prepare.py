#!/usr/bin/env python3
"""Prepare one HERMES CORE Drive image for the GitHub Actions publisher."""
from __future__ import annotations

import argparse
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

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hermes_system_assets import system_asset

ROOT = Path(__file__).resolve().parents[1]
ASSET_KEY = re.compile(r"^(?:arcane-[a-z0-9]+(?:-[a-z0-9]+)*|arcane-trophy-room-v2[.]2)$")
DRIVE_ID = re.compile(r"^[A-Za-z0-9_-]{10,160}$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
MAX_WEBP_BYTES = 500_000  # Existing arcane_system_assets publication limit.
MAX_EDGE = 4096  # Existing arcane_system_assets dimension limit.


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request_json(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError("DRIVE_REQUEST_FAILED status=" + str(error.code)) from None


def drive_file(file_id: str, folder_id: str, token: str) -> tuple[dict, bytes]:
    ident = urllib.parse.quote(file_id, safe="")
    metadata = request_json(
        "https://www.googleapis.com/drive/v3/files/" + ident + "?fields=id,mimeType,size,parents,trashed",
        token,
    )
    if metadata.get("id") != file_id or metadata.get("trashed") or folder_id not in metadata.get("parents", []):
        raise ValueError("DRIVE_FILE_NOT_IN_EXPECTED_FOLDER")
    req = urllib.request.Request(
        "https://www.googleapis.com/drive/v3/files/" + ident + "?alt=media",
        headers={"Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return metadata, response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError("DRIVE_DOWNLOAD_FAILED status=" + str(error.code)) from None


def prepare(source: bytes, output_dir: Path) -> dict:
    with Image.open(io.BytesIO(source)) as original:
        original.load()
        if original.format not in ("PNG", "JPEG", "WEBP"):
            raise ValueError("IMAGE_FORMAT_UNSUPPORTED")
        source_mime = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[original.format]
        alpha_preserved = "A" in original.getbands()
        image = original.convert("RGBA" if alpha_preserved else "RGB")
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)

    webp = None
    quality_used = None
    for edge in (MAX_EDGE, 3072, 2048, 1536, 1280, 1024):
        candidate_image = image.copy()
        if max(candidate_image.size) > edge:
            candidate_image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        for quality in range(92, 39, -4):
            buffer = io.BytesIO()
            candidate_image.save(buffer, "WEBP", quality=quality, method=6, exact=True)
            candidate = buffer.getvalue()
            if len(candidate) <= MAX_WEBP_BYTES:
                image, webp, quality_used = candidate_image, candidate, quality
                break
        if webp is not None:
            break
    if webp is None:
        raise ValueError("WEBP_OPTIMIZATION_FAILED")

    with Image.open(io.BytesIO(webp)) as check:
        check.load()
        if check.format != "WEBP":
            raise ValueError("WEBP_CONVERSION_FAILED")

    output_dir.mkdir(parents=True, exist_ok=True)
    source_path = output_dir / "original.bin"
    webp_path = output_dir / "image.webp"
    source_path.write_bytes(source)
    webp_path.write_bytes(webp)
    return {
        "source_file": source_path.name,
        "source_mime": source_mime,
        "webp_file": webp_path.name,
        "source_sha256": digest(source),
        "source_bytes": len(source),
        "webp_sha256": digest(webp),
        "webp_bytes": len(webp),
        "width": image.width,
        "height": image.height,
        "alpha_preserved": alpha_preserved,
        "quality": quality_used,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    request = json.loads(args.request.read_text(encoding="utf-8"))
    if not isinstance(request, dict) or request.get("schema") not in (1, 2):
        raise ValueError("INVALID_CORE_REQUEST")
    required = {"schema", "label", "drive_file_id", "archive_file_id", "source_sha256"}
    if not required <= set(request):
        raise ValueError("INVALID_CORE_REQUEST")
    if request["schema"] == 1:
        if not isinstance(request.get("asset_key"), str) or not ASSET_KEY.fullmatch(request["asset_key"]):
            raise ValueError("INVALID_ASSET_KEY")
        target = {"kind": "system", "id": request["asset_key"]}
    else:
        target = request.get("target")
        if not isinstance(target, dict) or target.get("kind") not in ("system", "honor-definition", "honor-relief"):
            raise ValueError("INVALID_CORE_TARGET")
        target = dict(target)
        if target["kind"] == "honor-relief":
            target["material"] = {"metal_relief": "metal", "carved_wood": "wood"}.get(target.get("material"), target.get("material"))
        ident = target.get("id")
        if not isinstance(ident, str) or not (ASSET_KEY if target["kind"] == "system" else UUID).fullmatch(ident):
            raise ValueError("INVALID_CORE_TARGET_ID")
        if target["kind"] == "honor-relief" and target.get("material") not in ("enamel", "metal", "wood", "stone", "other"):
            raise ValueError("INVALID_RELIEF_MATERIAL")
    if not isinstance(request["label"], str) or not request["label"].strip():
        raise ValueError("ASSET_LABEL_REQUIRED")
    if any(not isinstance(request[key], str) or not DRIVE_ID.fullmatch(request[key])
           for key in ("drive_file_id", "archive_file_id")):
        raise ValueError("INVALID_DRIVE_ID")
    if request["drive_file_id"] == request["archive_file_id"]:
        raise ValueError("ARCHIVE_COPY_REQUIRED")
    if not isinstance(request["source_sha256"], str) or not SHA256.fullmatch(request["source_sha256"]):
        raise ValueError("SOURCE_SHA256_REQUIRED")

    token = os.environ.get("GOOGLE_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("GOOGLE_ACCESS_TOKEN_MISSING")
    folders = json.loads((ROOT / "config/hermes-drive-folders.json").read_text(encoding="utf-8"))
    _, source = drive_file(request["drive_file_id"], folders["inbox_folder_id"], token)
    archive_folder_id = (system_asset(target["id"])["archive_folder_id"] if target["kind"] == "system" else folders["folders"]["original_archive"])
    _, archive = drive_file(request["archive_file_id"], archive_folder_id, token)
    expected = request["source_sha256"]
    if digest(source) != expected or digest(archive) != expected:
        raise ValueError("DRIVE_SOURCE_OR_ARCHIVE_SHA256_MISMATCH")

    result = {**request, "target": target, "archive_folder_id": archive_folder_id, **prepare(source, args.output)}
    (args.output / "prepared.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("HERMES_CORE_PREPARED", json.dumps({
        "target": target, "source_sha256": expected,
        "webp_sha256": result["webp_sha256"], "webp_bytes": result["webp_bytes"],
        "archive_file_id": request["archive_file_id"],
    }))


if __name__ == "__main__":
    main()
