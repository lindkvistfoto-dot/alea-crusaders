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

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hermes_system_assets import system_asset

ROOT = Path(__file__).resolve().parents[1]
ASSET_KEY = re.compile(r"^(?:arcane-[a-z0-9]+(?:-[a-z0-9]+)*|arcane-trophy-room-v2[.]2)$")
DRIVE_ID = re.compile(r"^[A-Za-z0-9_-]{10,160}$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
MAX_WEBP_BYTES = 500_000
MAX_EDGE = 4096
CORE_CONTRACT = json.loads((ROOT / "features/hermes-core/contract.json").read_text(encoding="utf-8"))
PROFILES = CORE_CONTRACT["profiles"]
LEGACY_KIND_PROFILES = CORE_CONTRACT["legacy_kind_profiles"]
APP_IMAGE_KINDS = set(LEGACY_KIND_PROFILES)
APP_IMAGE_KEY = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request_json(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError("DRIVE_REQUEST_FAILED status=" + str(error.code)) from None


def drive_file(file_id: str, folder_id: str, token: str, max_bytes: int) -> tuple[dict, bytes]:
    ident = urllib.parse.quote(file_id, safe="")
    metadata = request_json(
        "https://www.googleapis.com/drive/v3/files/" + ident + "?fields=id,mimeType,size,parents,trashed",
        token,
    )
    if metadata.get("id") != file_id or metadata.get("trashed") or folder_id not in metadata.get("parents", []):
        raise ValueError("DRIVE_FILE_NOT_IN_EXPECTED_FOLDER")
    declared_size = int(metadata.get("size", 0))
    if not 1 <= declared_size <= max_bytes:
        raise ValueError("DRIVE_IMAGE_SIZE_OUT_OF_RANGE")
    req = urllib.request.Request(
        "https://www.googleapis.com/drive/v3/files/" + ident + "?alt=media",
        headers={"Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            data = response.read(max_bytes + 1)
        if len(data) != declared_size:
            raise ValueError("DRIVE_IMAGE_SIZE_MISMATCH")
        return metadata, data
    except urllib.error.HTTPError as error:
        raise RuntimeError("DRIVE_DOWNLOAD_FAILED status=" + str(error.code)) from None



def profile_id_for(target: dict, request_schema: int) -> str:
    if request_schema == 3:
        profile_id = target.get("profile_id")
    elif target["kind"] in APP_IMAGE_KINDS:
        expected_profile = LEGACY_KIND_PROFILES[target["kind"]]
        profile_id = target.get("profile_id") or expected_profile
        if profile_id != expected_profile:
            raise ValueError("CORE_PROFILE_TARGET_MISMATCH")
    elif target["kind"] in ("honor-definition", "honor-relief"):
        profile_id = target.get("profile_id") or target["kind"]
    else:
        profile_id = target.get("profile_id") or CORE_CONTRACT["defaults"]["profile_id"]
    if not isinstance(profile_id, str) or profile_id not in PROFILES:
        raise ValueError("CORE_PROFILE_UNSUPPORTED")
    return profile_id

def _validate_aspect(image: Image.Image, aspect: str) -> None:
    ratio = image.width / image.height if image.height else 0
    if aspect == "square" and image.width != image.height:
        raise ValueError("CORE_PROFILE_EXPECTED_SQUARE")
    if aspect == "portrait" and image.height <= image.width:
        raise ValueError("CORE_PROFILE_EXPECTED_PORTRAIT")
    if aspect.startswith("ratio:"):
        spec = aspect[6:]
        if "-" in spec:
            low, high = (float(value) for value in spec.split("-", 1))
            if not low <= ratio <= high:
                raise ValueError("CORE_PROFILE_ASPECT_RATIO_INVALID")
        elif ":" in spec:
            width, height = (float(value) for value in spec.split(":", 1))
            expected = width / height
            if abs(ratio - expected) / expected > 0.003:
                raise ValueError("CORE_PROFILE_ASPECT_RATIO_INVALID")

def prepare(source: bytes, output_dir: Path, profile_id: str) -> dict:
    profile = PROFILES[profile_id]
    max_source_bytes = int(profile.get("max_source_bytes", CORE_CONTRACT["defaults"]["max_source_bytes"]))
    if len(source) > max_source_bytes:
        raise ValueError("CORE_SOURCE_TOO_LARGE")
    with Image.open(io.BytesIO(source)) as original:
        source_format = original.format
        if profile.get("orientation") == "exif":
            original = ImageOps.exif_transpose(original)
        original.load()
        if source_format not in profile["source_formats"]:
            raise ValueError("IMAGE_FORMAT_UNSUPPORTED")
        if not (int(profile["source_min_edge"]) <= min(original.size) and
                original.width >= int(profile.get("source_min_width", profile["source_min_edge"])) and
                original.height >= int(profile.get("source_min_height", profile["source_min_edge"])) and
                max(original.size) <= int(profile["source_max_edge"])):
            raise ValueError("CORE_PROFILE_DIMENSIONS_INVALID")
        _validate_aspect(original, profile["aspect"])
        source_mime = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[source_format]
        bands = original.getbands()
        has_alpha = "A" in bands or "transparency" in original.info
        source_alpha = original.convert("RGBA").getchannel("A") if has_alpha else None
        alpha_policy = profile["alpha"]
        if alpha_policy == "visible":
            if source_alpha is None:
                raise ValueError("CORE_PROFILE_ALPHA_REQUIRED")
            extrema = source_alpha.getextrema()
            if extrema[0] == 255 or extrema[1] == 0:
                raise ValueError("CORE_PROFILE_TRUE_ALPHA_REQUIRED")
            alpha_preserved = True
        elif alpha_policy == "opaque":
            if source_alpha is not None and source_alpha.getextrema() != (255, 255):
                raise ValueError("CORE_PROFILE_OPAQUE_IMAGE_REQUIRED")
            alpha_preserved = False
        else:
            alpha_preserved = has_alpha
        image = original.convert("RGBA" if alpha_preserved else "RGB")
        width = profile.get("output_width")
        height = profile.get("output_height")
        if profile["fit"] == "resize" and width and height:
            image = image.resize((int(width), int(height)), Image.Resampling.LANCZOS)
        else:
            max_edge = int(profile["output_max_edge"])
            bounds = (int(width), int(height)) if width and height else (max_edge, max_edge)
            image.thumbnail(bounds, Image.Resampling.LANCZOS)
        required_alpha = image.getchannel("A").tobytes() if alpha_preserved else None
        webp = None
        quality_used = None
        for quality in range(int(profile["quality_start"]), int(profile["quality_min"]) - 1, -int(profile["quality_step"])):
            buffer = io.BytesIO()
            image.save(buffer, "WEBP", quality=quality, method=6, exact=True)
            candidate = buffer.getvalue()
            if int(profile.get("min_webp_bytes", 0)) <= len(candidate) <= int(profile["max_webp_bytes"]):
                webp, quality_used = candidate, quality
                break
        if webp is None:
            raise ValueError("WEBP_OPTIMIZATION_FAILED")
        with Image.open(io.BytesIO(webp)) as check:
            check.load()
            if check.format != "WEBP":
                raise ValueError("WEBP_CONVERSION_FAILED")
            if required_alpha is not None and check.convert("RGBA").getchannel("A").tobytes() != required_alpha:
                raise ValueError("WEBP_ALPHA_CHANGED")
        width, height = image.size

    output_dir.mkdir(parents=True, exist_ok=True)
    source_path = output_dir / "original.bin"
    webp_path = output_dir / "image.webp"
    source_path.write_bytes(source)
    webp_path.write_bytes(webp)
    return {
        "profile_id": profile_id,
        "source_file": source_path.name,
        "source_mime": source_mime,
        "webp_file": webp_path.name,
        "source_sha256": digest(source),
        "source_bytes": len(source),
        "webp_sha256": digest(webp),
        "webp_bytes": len(webp),
        "width": width,
        "height": height,
        "alpha_preserved": alpha_preserved,
        "quality": quality_used,
    }

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    request = json.loads(args.request.read_text(encoding="utf-8"))
    if not isinstance(request, dict) or request.get("schema") not in (1, 2, 3):
        raise ValueError("INVALID_CORE_REQUEST")
    required = {"schema", "label", "drive_file_id", "archive_file_id", "source_sha256"}
    if not required <= set(request):
        raise ValueError("INVALID_CORE_REQUEST")
    if request["schema"] == 1:
        if not isinstance(request.get("asset_key"), str) or not ASSET_KEY.fullmatch(request["asset_key"]):
            raise ValueError("INVALID_ASSET_KEY")
        target = {"kind": "system", "id": request["asset_key"]}
        profile_id = CORE_CONTRACT["defaults"]["profile_id"]
    else:
        incoming = request.get("target")
        if not isinstance(incoming, dict):
            raise ValueError("INVALID_CORE_TARGET")
        if request["schema"] == 3:
            if incoming.get("kind") != "profile":
                raise ValueError("CORE_PROFILE_TARGET_REQUIRED")
            profile_id = incoming.get("profile_id")
            profile = PROFILES.get(profile_id) if isinstance(profile_id, str) else None
            if not profile:
                raise ValueError("CORE_PROFILE_UNSUPPORTED")
            adapter = CORE_CONTRACT["adapters"].get(profile.get("adapter"))
            if not adapter:
                raise ValueError("CORE_PROFILE_ADAPTER_MISSING")
            target = {"kind": adapter["kind"], "profile_id": profile_id, "id": incoming.get("id")}
            if incoming.get("material") is not None:
                target["material"] = incoming["material"]
        else:
            target = dict(incoming)
            if target["kind"] == "honor-relief":
                target["material"] = {"metal_relief": "metal", "carved_wood": "wood"}.get(target.get("material"), target.get("material"))
            target["profile_id"] = profile_id_for(target, request["schema"])
        valid_kinds = {"system", "honor-definition", "honor-relief", "app-image", *APP_IMAGE_KINDS}
        if target.get("kind") not in valid_kinds:
            raise ValueError("INVALID_CORE_TARGET")
        ident = target.get("id")
        id_pattern = ASSET_KEY if target["kind"] == "system" else UUID if target["kind"] in ("honor-definition", "honor-relief") else APP_IMAGE_KEY
        if not isinstance(ident, str) or not id_pattern.fullmatch(ident):
            raise ValueError("INVALID_CORE_TARGET_ID")
        if target["kind"] == "honor-relief" and target.get("material") not in ("enamel", "metal", "wood", "stone", "other"):
            raise ValueError("INVALID_RELIEF_MATERIAL")
        profile_id = target["profile_id"]
        profile = PROFILES.get(profile_id)
        target_adapter_kind = "app-image" if target["kind"] in APP_IMAGE_KINDS else target["kind"]
        if not profile or CORE_CONTRACT["adapters"][profile["adapter"]]["kind"] != target_adapter_kind:
            raise ValueError("CORE_PROFILE_TARGET_MISMATCH")
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
    profile = PROFILES[profile_id]
    max_source_bytes = int(profile.get("max_source_bytes", CORE_CONTRACT["defaults"]["max_source_bytes"]))
    source_metadata, source = drive_file(request["drive_file_id"], folders["inbox_folder_id"], token, max_source_bytes)
    archive_folder_id = system_asset(target["id"])["archive_folder_id"] if target["kind"] == "system" else None
    if archive_folder_id is None:
        folder_key = profile.get("archive_folder_key", "folders.original_archive")
        archive_folder_id = folders
        for part in folder_key.split("."):
            archive_folder_id = archive_folder_id[part]
    _, archive = drive_file(request["archive_file_id"], archive_folder_id, token, max_source_bytes)
    expected = request["source_sha256"]
    if digest(source) != expected or digest(archive) != expected:
        raise ValueError("DRIVE_SOURCE_OR_ARCHIVE_SHA256_MISMATCH")

    result = {**request, "target": target, "profile_id": profile_id, "source_file_name": source_metadata.get("name"),
              "archive_folder_id": archive_folder_id, **prepare(source, args.output, profile_id)}
    (args.output / "prepared.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("HERMES_CORE_PREPARED", json.dumps({
        "target": target, "source_sha256": expected,
        "webp_sha256": result["webp_sha256"], "webp_bytes": result["webp_bytes"],
        "archive_file_id": request["archive_file_id"],
    }))


if __name__ == "__main__":
    main()
