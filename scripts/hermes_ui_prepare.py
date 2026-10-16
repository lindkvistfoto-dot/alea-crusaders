#!/usr/bin/env python3
"""HERMES UI: immutable 3:1 PNG -> small public WebP without touching game data."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets/hermes/originals/ui"
KEYS = {"arcane-mechanism-link", "arcane-mechanism-chamber"}
PATTERN = re.compile(r"^assets/hermes/originals/ui/(arcane-mechanism-link|arcane-mechanism-chamber)/([a-f0-9]{64})\.png$")
SIZE = (768, 256)
LIMIT = 300000

def prepare(source_name: str) -> tuple[str, str]:
    match = PATTERN.fullmatch(source_name)
    if not match:
        raise ValueError("HERMES_UI_INVALID_SOURCE_PATH")
    key, claimed_sha = match.groups()
    source = (ROOT / source_name).resolve()
    if not source.is_relative_to(SOURCES.resolve()) or not source.is_file():
        raise ValueError("HERMES_UI_SOURCE_NOT_FOUND")
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != claimed_sha or not 100 <= len(raw) <= 8388608:
        raise ValueError("HERMES_UI_SOURCE_INTEGRITY_FAILURE")
    with Image.open(source) as original:
        original.load()
        if original.format != "PNG" or not (640 <= original.width <= 4096 and original.width == original.height * 3):
            raise ValueError("HERMES_UI_BAD_PNG")
        if key == "arcane-mechanism-link":
            if original.mode != "RGBA" or original.getchannel("A").getextrema() != (0, 255):
                raise ValueError("HERMES_UI_LINK_ALPHA_INVALID")
            image = original.resize(SIZE, Image.Resampling.LANCZOS)
            required_alpha = image.getchannel("A").tobytes()
        else:
            if original.mode not in ("RGB", "RGBA") or (original.mode == "RGBA" and original.getchannel("A").getextrema() != (255, 255)):
                raise ValueError("HERMES_UI_CHAMBER_OPAQUE_REQUIRED")
            image = original.convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)
            image = ImageEnhance.Brightness(image).enhance(0.80)
            required_alpha = None
    app_path = ROOT / "features/combat" / (key + ".webp")
    image.save(app_path, "WEBP", quality=86 if required_alpha else 82, method=6, exact=True)
    app = app_path.read_bytes()
    if not 100 <= len(app) <= LIMIT:
        raise ValueError("HERMES_UI_WEBP_SIZE_INVALID")
    with Image.open(app_path) as verify:
        verify.load()
        if verify.format != "WEBP" or verify.size != SIZE:
            raise ValueError("HERMES_UI_WEBP_DECODE_FAILURE")
        if required_alpha is not None and verify.convert("RGBA").getchannel("A").tobytes() != required_alpha:
            raise ValueError("HERMES_UI_WEBP_ALPHA_CHANGED")
    manifest_path = app_path.with_suffix(".json")
    manifest = {"schema":1,"kind":"ui","target_key":key,"source_path":source_name,
                "source_sha256":digest,"source_bytes":len(raw),"app_path":app_path.relative_to(ROOT).as_posix(),
                "app_sha256":hashlib.sha256(app).hexdigest(),"app_bytes":len(app),
                "width":SIZE[0],"height":SIZE[1],"alpha_preserved":required_alpha is not None,
                "supabase_activation":False}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("HERMES_UI_PREPARED", key, "source_sha256", digest, "webp_sha256", manifest["app_sha256"],"bytes",len(app))
    return app_path.relative_to(ROOT).as_posix(), manifest_path.relative_to(ROOT).as_posix()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    prepare(args.source)
