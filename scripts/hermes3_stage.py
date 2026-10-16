#!/usr/bin/env python3
"""HERMES 3: create content-addressed, *unpublished* WebP staging assets.
Consumes bytes produced by hermes3_drive_verify.py, never arbitrary downloaded files.
No GitHub writes, Supabase calls, deployments, or secret access.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageOps
from scripts.hermes3_drive_verify import check, check_png_jpeg, check_sprite_zip

SAFE_KEY = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
MAX_DELIVERY = 3_000_000
MAX_OUTPUT = 24_000_000
MAX_FRAME = 2048


def hexdigest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def render_webp(data: bytes, mime: str, *, limit: int = MAX_FRAME):
    with Image.open(io.BytesIO(data)) as original:
        original.load()
        check(original.format == {"image/png": "PNG", "image/jpeg": "JPEG"}[mime],
              "STAGE_DECODE_MISMATCH")
        # EXIF orientation must be applied to JPEG scenes, not to small component sprites.
        image = ImageOps.exif_transpose(original) if mime == "image/jpeg" else original.copy()
        check(image.width * image.height <= 32_000_000, "STAGE_PIXEL_LIMIT")
        if max(image.size) > limit:
            image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        alpha = image.getchannel("A").tobytes() if image.mode == "RGBA" else None
        stream = io.BytesIO()
        # Preserve actual alpha and image detail in standalone clockwork components.
        image.save(stream, format="WEBP", lossless=alpha is not None,
                   quality=100 if alpha is not None else 87, method=6, exact=True)
        result = stream.getvalue()
        check(100 <= len(result) <= MAX_DELIVERY, "STAGE_OUTPUT_TOO_LARGE")
        with Image.open(io.BytesIO(result)) as verified:
            verified.load()
            check(verified.format == "WEBP" and verified.size == image.size,
                  "STAGE_WEBP_INVALID")
            if alpha is not None:
                check(verified.convert("RGBA").getchannel("A").tobytes() == alpha,
                      "STAGE_ALPHA_NOT_PRESERVED")
        return result, [image.width, image.height], alpha is not None


def stage_assets(job: dict, verified: Path, out: Path, registry: dict):
    source = job["source"]
    profile = registry["profiles"][job["profile"]]
    check(job.get("schema") == 3 and job.get("intent") == "verify-only", "STAGE_JOB_INVALID")
    check(profile["stage"] == "verify" and source["visibility"] == "public"
          and source["public_release_approved"] is True, "STAGE_NOT_APPROVED")
    check(out.resolve() != verified.resolve(), "STAGE_OUTPUT_EQUALS_SOURCE")
    receipt = json.loads((verified / "verification.json").read_text("utf8"))
    check(receipt.get("schema") == 3 and receipt.get("status") == "verified-only"
          and receipt.get("job_id") == job["job_id"]
          and receipt.get("profile") == job["profile"]
          and receipt.get("source_sha256") == source["sha256"]
          and receipt.get("mime_type") == source["mime_type"]
          and receipt.get("production_published") is False
          and receipt.get("database_activated") is False, "STAGE_RECEIPT_MISMATCH")
    base = receipt.get("artifact_filename")
    check(base in ("verified-source.png", "verified-source.jpg", "verified-source.zip"),
          "STAGE_BAD_RECEIPT_FILENAME")
    original = (verified / base).read_bytes()
    check(len(original) == receipt["source_bytes"] and
          hexdigest(original) == source["sha256"], "STAGE_SOURCE_HASH_MISMATCH")
    binaries = {}
    if source["mime_type"] in ("image/png", "image/jpeg"):
        check_png_jpeg(original, source["mime_type"], profile["alpha"])
        binaries[job["target"]["key"]] = (original, source["mime_type"])
    else:
        check(profile["media"] == "ui-components", "STAGE_UNKNOWN_PACKAGE_PROFILE")
        report = check_sprite_zip(original)
        check(report["sprites"] == receipt["package"]["sprites"], "STAGE_PACKAGE_MISMATCH")
        with zipfile.ZipFile(io.BytesIO(original)) as z:
            for info in z.infolist():
                if info.is_dir() or not info.filename.endswith(".png"):
                    continue
                name = Path(info.filename).stem
                check(bool(SAFE_KEY.fullmatch(name)) and name not in binaries,
                      "STAGE_UNSAFE_OR_DUPLICATE_SPRITE")
                data = z.read(info)
                binaries[name] = (data, "image/png")
    check(1 <= len(binaries) <= 64, "STAGE_ASSET_COUNT")
    output_manifest = {
        "schema": 3, "state": "staged-not-published",
        "job_id": job["job_id"], "profile": job["profile"],
        "source_sha256": source["sha256"], "visibility": "public",
        "target": job["target"], "assets": {}, "supabase_activation": False,
        "production_deployment": False
    }
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for key, (data, mime) in sorted(binaries.items()):
        check(bool(SAFE_KEY.fullmatch(key)), "STAGE_INVALID_ASSET_KEY")
        webp, dimensions, has_alpha = render_webp(data, mime)
        total += len(webp)
        check(total <= MAX_OUTPUT, "STAGE_TOTAL_BYTES")
        asset_name = f"{key}-{hexdigest(webp)[:16]}.webp"
        (out / asset_name).write_bytes(webp)
        output_manifest["assets"][key] = {
            "file": asset_name, "sha256": hexdigest(webp),
            "source_sha256": hexdigest(data), "bytes": len(webp),
            "width": dimensions[0], "height": dimensions[1],
            "alpha_preserved": has_alpha
        }
    (out / "staging-manifest.json").write_text(
        json.dumps(output_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print("HERMES3_STAGED", job["job_id"], len(binaries), "assets", total, "bytes")
    print("HERMES3_STAGING_ONLY_NO_DEPLOYMENT")
    return output_manifest


if __name__ == "__main__":
    from scripts.hermes3_drive_verify import ROOT
    check(len(sys.argv) == 4, "STAGE_ARGUMENTS")
    request_path = sys.argv[1]
    check(bool(re.fullmatch(r"hermes3/requests/[a-z0-9-]+\.json", request_path)),
          "STAGE_REQUEST_PATH")
    job = json.loads((ROOT / request_path).read_text("utf8"))
    registry = json.loads((ROOT / "config/hermes3-profiles.json").read_text("utf8"))
    stage_assets(job, Path(sys.argv[2]), Path(sys.argv[3]), registry)
