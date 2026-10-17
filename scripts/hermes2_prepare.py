#!/usr/bin/env python3
"""HERMES 2.1: deterministic, immutable GitHub-original -> verified WebP + manifest.

This stage intentionally does NOT change Supabase, existing icons or spell rules.
Publishing is a separate, authenticated HERMES step after these integrity gates pass.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "assets" / "hermes" / "originals"
PATH_PATTERN = re.compile(r"^(spell|symbol|skill)/([a-z0-9]+(?:-[a-z0-9]+)*)/([a-f0-9]{64})[.]png$")
QUALITIES = (90, 87, 84, 80, 76)
EDGE = 640
MAX_SOURCE = 8_388_608
MAX_WEBP = 500_000


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prepare(source: Path, output_root: Path) -> dict:
    relative = source.relative_to(ROOT).as_posix()
    match = PATH_PATTERN.fullmatch(relative)
    if not match:
        raise ValueError(f"invalid HERMES original path: {relative}")
    kind, key, digest = match.groups()
    raw = source.read_bytes()
    if not 100 <= len(raw) <= MAX_SOURCE:
        raise ValueError(f"{relative}: invalid source byte size")
    if sha256(raw) != digest:
        raise ValueError(f"{relative}: SHA-256 differs from immutable filename")
    with Image.open(io.BytesIO(raw)) as original:
        if original.format != "PNG" or original.mode != "RGBA":
            raise ValueError(f"{relative}: expected RGBA PNG")
        if original.width != original.height or not EDGE <= original.width <= 4096:
            raise ValueError(f"{relative}: expected square 640–4096 px")
        image = original.resize((EDGE, EDGE), Image.Resampling.LANCZOS)
    low, high = image.getchannel("A").getextrema()
    if low == 255 or high == 0:
        raise ValueError(f"{relative}: missing actual alpha transparency or visible pixels")
    required_alpha = image.getchannel("A").tobytes()
    webp = None
    quality_used = None
    for quality in QUALITIES:
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=quality, method=6, exact=True)
        candidate = buffer.getvalue()
        if len(candidate) <= MAX_WEBP:
            webp = candidate
            quality_used = quality
            break
    if webp is None:
        raise ValueError(f"{relative}: cannot optimize under 500 kB")
    if webp[:4] != b"RIFF" or webp[8:12] != b"WEBP" or webp[12:16] != b"VP8X" or not webp[20] & 16:
        raise ValueError(f"{relative}: optimized WebP alpha header invalid")
    with Image.open(io.BytesIO(webp)) as check:
        if check.format != "WEBP" or check.size != (EDGE, EDGE):
            raise ValueError(f"{relative}: corrupt output WebP")
        if check.convert("RGBA").getchannel("A").tobytes() != required_alpha:
            raise ValueError(f"{relative}: alpha channel changed")
    app_sha = sha256(webp)
    target = output_root / kind / key / (app_sha + ".webp")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(webp)
    manifest = {
        "schema": 1, "kind": kind, "target_key": key,
        "source_path": "assets/hermes/originals/" + relative,
        "source_sha256": digest, "source_bytes": len(raw),
        "app_file": target.relative_to(output_root).as_posix(),
        "app_sha256": app_sha, "app_bytes": len(webp),
        "width": EDGE, "height": EDGE, "alpha_preserved": True,
        "webp_quality": quality_used,
    }
    metadata_path = target.with_suffix(".json")
    metadata_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"VERIFIED {kind}/{key}: PNG {len(raw):,} bytes -> WebP {len(webp):,} bytes, quality {quality_used}; SHA-256 {app_sha}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/hermes21-output"))
    parser.add_argument("--source", type=Path, action="append", help="specific immutable original to process (repeatable)")
    args = parser.parse_args()
    if args.source:
        originals = sorted({p.resolve() for p in args.source})
        for path in originals:
            try:
                path.relative_to(ROOT.resolve())
            except ValueError as error:
                raise SystemExit(f"Path outside HERMES originals: {path}") from error
    else:
        originals = sorted(ROOT.glob("*/*/*.png"))
    if not originals:
        raise SystemExit("No immutable HERMES original PNGs found")
    result = [prepare(path, args.output) for path in originals]
    (args.output / "manifest.json").write_text(
        json.dumps({"schema": 1, "assets": result}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"HERMES 2.1 prepared {len(result)} assets; no Supabase rows changed.")


if __name__ == "__main__":
    main()
