#!/usr/bin/env python3
"""Deterministic ARCANE IVORY master PNG -> compact RGBA WebP app assets.

PNG masters remain byte-for-byte untouched. Run --write locally or in CI.
--check rejects missing/stale generated files. Locked design is never edited.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "assets" / "spells" / "arcane-ivory"
MANIFEST = ICON_DIR / "manifest.json"
EDGE = 640
MAX_BYTES = 500_000
QUALITIES = (90, 87, 84, 80, 76)


def make_icon(png: Path) -> tuple[bytes, dict]:
    with Image.open(png) as image:
        if image.format != "PNG":
            raise ValueError(f"{png.name}: source is not a PNG")
        if image.width != image.height or image.width < EDGE:
            raise ValueError(f"{png.name}: expected a square PNG >= {EDGE}px")
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        low, high = alpha.getextrema()
        if low == 255 or high == 0:
            raise ValueError(f"{png.name}: needs a real transparent background and visible content")
        if rgba.size != (EDGE, EDGE):
            rgba = rgba.resize((EDGE, EDGE), Image.Resampling.LANCZOS)
        wanted_alpha = rgba.getchannel("A").tobytes()
        output = None
        chosen = None
        for quality in QUALITIES:
            buf = io.BytesIO()
            rgba.save(buf, "WEBP", quality=quality, method=6, exact=True)
            candidate = buf.getvalue()
            if len(candidate) <= MAX_BYTES:
                output, chosen = candidate, quality
                break
        if output is None:
            raise ValueError(f"{png.name}: unable to meet {MAX_BYTES} bytes above quality {QUALITIES[-1]}")
        with Image.open(io.BytesIO(output)) as check:
            if check.format != "WEBP" or check.size != (EDGE, EDGE):
                raise ValueError(f"{png.name}: corrupt optimized WebP")
            if check.convert("RGBA").getchannel("A").tobytes() != wanted_alpha:
                raise ValueError(f"{png.name}: transparency changed during optimization")
    entry = {
        "spell_key": png.stem,
        "source": png.name,
        "app": png.with_suffix(".webp").name,
        "size": EDGE,
        "source_bytes": png.stat().st_size,
        "app_bytes": len(output),
        "quality": chosen,
        "source_sha256": hashlib.sha256(png.read_bytes()).hexdigest(),
        "alpha_preserved": True,
    }
    return output, entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="generate optimized files and manifest")
    mode.add_argument("--check", action="store_true", help="verify committed optimized assets")
    args = parser.parse_args()
    originals = sorted(ICON_DIR.glob("*.png"))
    if not originals:
        raise SystemExit("No ARCANE IVORY master PNGs found")
    entries = []
    for png in originals:
        if not png.stem.replace("-", "").isalnum() or png.stem.lower() != png.stem:
            raise SystemExit(f"Invalid spell key filename: {png.name}")
        data, entry = make_icon(png)
        target = png.with_suffix(".webp")
        if args.check:
            if not target.exists() or target.read_bytes() != data:
                raise SystemExit(f"Outdated optimized icon: {target.relative_to(ROOT)}")
        else:
            target.write_bytes(data)
        entries.append(entry)
        saving = (1 - entry["app_bytes"] / entry["source_bytes"]) * 100
        print(f'{png.stem}: PNG {entry["source_bytes"]:,} B -> WebP {entry["app_bytes"]:,} B ({saving:.1f}% smaller), quality {entry["quality"]}')
    manifest_data = (json.dumps({"schema": 1, "edge": EDGE, "max_bytes": MAX_BYTES, "icons": entries},
                                indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if args.check:
        if not MANIFEST.exists() or MANIFEST.read_bytes() != manifest_data:
            raise SystemExit("Stale ARCANE IVORY manifest")
    else:
        MANIFEST.write_bytes(manifest_data)
    print(f"Verified {len(entries)} original(s), optimized WebP icons and manifest")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
