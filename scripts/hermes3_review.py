#!/usr/bin/env python3
"""HERMES 3 · deterministic release-review evidence, no publication.
Renders ONLY files in verified content-addressed staging manifest.
Cannot approve production; any candidate it creates is explicitly BLOCKED.
"""
from __future__ import annotations
import hashlib
import io
import json
import math
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from scripts.hermes3_drive_verify import check

ASSET_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}-[0-9a-f]{16}\.webp$")
KEY = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")
MAX_ASSETS = 64
CELL_W = 300
CELL_H = 265
COLS = 4

def sha(data):
    return hashlib.sha256(data).hexdigest()

def evidence(assets_dir: Path):
    manifest_path = assets_dir / "staging-manifest.json"
    raw = manifest_path.read_bytes()
    manifest = json.loads(raw.decode("utf-8"))
    check(manifest.get("schema") == 3 and manifest.get("state") == "staged-not-published"
          and manifest.get("production_deployment") is False
          and manifest.get("supabase_activation") is False, "REVIEW_NOT_STAGED")
    assets = manifest.get("assets")
    check(isinstance(assets, dict) and 1 <= len(assets) <= MAX_ASSETS, "REVIEW_ASSET_COUNT")
    all_checked = []
    for key, row in sorted(assets.items()):
        check(bool(KEY.fullmatch(key)) and isinstance(row, dict), "REVIEW_BAD_KEY")
        file = row.get("file")
        check(isinstance(file, str) and bool(ASSET_NAME.fullmatch(file))
              and file.startswith(key + "-"), "REVIEW_BAD_FILENAME")
        check(isinstance(row.get("sha256"), str)
              and bool(DIGEST.fullmatch(row["sha256"])), "REVIEW_BAD_DIGEST")
        content = (assets_dir / file).read_bytes()
        check(30 <= len(content) <= 3_000_000 and len(content) == row.get("bytes")
              and sha(content) == row["sha256"]
              and file.endswith(row["sha256"][:16] + ".webp"), "REVIEW_SHA_MISMATCH")
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            check(image.format == "WEBP" and
                  list(image.size) == [row.get("width"), row.get("height")], "REVIEW_DIMENSIONS")
            image = image.convert("RGBA")
            if row.get("alpha_preserved"):
                check(image.getchannel("A").getextrema()[0] < 255, "REVIEW_ALPHA_MISSING")
            all_checked.append((key, file, row, image.copy()))
    return manifest, sha(raw), all_checked

def make_contact_sheet(manifest, manifest_sha, checked, output_dir: Path):
    rows = math.ceil(len(checked) / COLS)
    result = Image.new("RGB", (COLS * CELL_W, rows * CELL_H + 74), "#24262a")
    draw = ImageDraw.Draw(result)
    font = ImageFont.load_default()
    draw.text((20, 20), f"HERMES 3 / STAGING ONLY / {len(checked)} sprites",
              fill="#f5f5f5", font=font)
    draw.text((20, 42), f"Manifest SHA256: {manifest_sha}", fill="#b5b5b5", font=font)
    for index, (key, filename, row, image) in enumerate(checked):
        x = (index % COLS) * CELL_W
        y = (index // COLS) * CELL_H + 74
        tile = Image.new("RGB", (CELL_W - 12, CELL_H - 12), "#d3d3d3")
        squares = ImageDraw.Draw(tile)
        for sy in range(0, CELL_H - 12, 16):
            for sx in range(0, CELL_W - 12, 16):
                if (sx//16 + sy//16) % 2:
                    squares.rectangle((sx, sy, sx+15, sy+15), fill="#ececec")
        image.thumbnail((CELL_W - 42, CELL_H - 63), Image.Resampling.LANCZOS)
        px = (tile.width - image.width) // 2
        py = (tile.height - 39 - image.height) // 2 + 10
        tile.paste(image, (px, py), image)
        squares.text((10, CELL_H - 44), key, fill="#161616", font=font)
        squares.text((10, CELL_H - 27),
                     f'{row["width"]}x{row["height"]} / {row["sha256"][:12]}',
                     fill="#343434", font=font)
        result.paste(tile, (x+6, y+6))
    output_dir.mkdir(parents=True, exist_ok=True)
    result.save(output_dir / "review-contact-sheet.png", "PNG", optimize=True)
    blocked = {
        "schema": 3, "kind": "public-media-release-candidate",
        "status": "blocked-awaiting-release-governance",
        "job_id": manifest["job_id"], "profile": manifest["profile"],
        "source_sha256": manifest["source_sha256"],
        "staging_manifest_sha256": manifest_sha,
        "artifact_count": len(checked),
        "required_controls": [
            "mandatory-reviewed-PR-for-main",
            "hermes-production-environment-required-reviewers",
            "environment-only-publisher-credentials",
            "passing-release-relevant-checks",
            "signed-approval-evidence-and-exact-target-readback"
        ],
        "approvals_recorded": False,
        "allowed_to_publish": False,
        "production_deployment": False
    }
    (output_dir / "release-candidate-BLOCKED.json").write_text(
        json.dumps(blocked, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    (output_dir / "REVIEW.md").write_text(
        "# HERMES 3 - staging preview\n\n"
        f"**{len(checked)} WebP assets** checked, with SHA-256 integrity verification.\n\n"
        f"- Job: {manifest['job_id']}\n"
        f"- Source SHA-256: {manifest['source_sha256']}\n"
        f"- Staging manifest SHA-256: {manifest_sha}\n"
        "- Visual check: review-contact-sheet.png\n"
        "- Release: BLOCKED until protected main and reviewed environment gates exist.\n"
        "- No Supabase writes, GitHub Pages deploys or Google IAM changes.\n",
        encoding="utf8")
    print("HERMES3_REVIEW_EVIDENCE_READY", len(checked), manifest_sha)
    print("HERMES3_RELEASE_BLOCKED_UNTIL_GOVERNANCE")

if __name__ == "__main__":
    check(len(sys.argv) == 3, "REVIEW_ARGUMENTS")
    assets = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    check(assets != output, "REVIEW_OUTPUT_MUST_DIFFER")
    m, digest, checked = evidence(assets)
    make_contact_sheet(m, digest, checked, output)
