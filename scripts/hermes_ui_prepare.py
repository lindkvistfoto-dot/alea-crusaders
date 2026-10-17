#!/usr/bin/env python3
"""HERMES UI: validated aspect ratios, alpha and public WebP, no game data."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from PIL import Image, ImageEnhance, ImageDraw, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets/hermes/originals/ui"
KEYS = {"arcane-mechanism-link", "arcane-mechanism-chamber", "arcane-gallery-overlay",
        "arcane-gallery-goose-left", "arcane-gallery-goose-right", "arcane-gallery-goose-seal"}
PATTERN = re.compile(r"^assets/hermes/originals/ui/(arcane-mechanism-link|arcane-mechanism-chamber|arcane-gallery-overlay|arcane-gallery-goose-left|arcane-gallery-goose-right|arcane-gallery-goose-seal)/([a-f0-9]{64})\.png$")
LINK_SIZES = {(3, 2): (768, 512), (4, 3): (768, 576), (3, 4): (576, 768)}
CHAMBER_SIZE = (768, 256)
LIMIT = 300000
GOOSE_SIZES = {"arcane-gallery-goose-left": (724, 1086),
               "arcane-gallery-goose-right": (724, 1086),
               "arcane-gallery-goose-seal": (515, 527)}

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
        link_size = next((pixels for (w, h), pixels in LINK_SIZES.items()
                         if original.width * h == original.height * w), None)
        if original.format != "PNG" or not ((key in GOOSE_SIZES and original.size == GOOSE_SIZES[key]) or (640 <= original.width <= 4096 and (
            (key == "arcane-mechanism-link" and link_size is not None)
            or (key == "arcane-mechanism-chamber" and original.width == original.height * 3)
            or (key == "arcane-gallery-overlay" and original.size == (1536, 1024))
            or (key in GOOSE_SIZES and original.size == GOOSE_SIZES[key])
        ))):
            raise ValueError("HERMES_UI_BAD_PNG")
        size = link_size if key == "arcane-mechanism-link" else CHAMBER_SIZE
        if key in GOOSE_SIZES:
            if original.mode != "RGBA" or original.getchannel("A").getextrema() != (0, 255):
                raise ValueError("HERMES_GOOSE_ALPHA_REQUIRED")
            image = original.convert("RGBA")
            size = image.size
            required_alpha = image.getchannel("A").tobytes()
        elif key == "arcane-mechanism-link":
            if original.mode != "RGBA" or original.getchannel("A").getextrema() != (0, 255):
                raise ValueError("HERMES_UI_LINK_ALPHA_INVALID")
            image = original.resize(size, Image.Resampling.LANCZOS)
            required_alpha = image.getchannel("A").tobytes()
        else:
            if original.mode not in ("RGB", "RGBA"):
                raise ValueError("HERMES_UI_BAD_COLOR_MODE")
            if key == "arcane-gallery-overlay" and original.mode == "RGBA" and original.getchannel("A").getextrema()[1] == 0:
                raise ValueError("HERMES_UI_EMPTY_SOURCE")
            if key == "arcane-mechanism-chamber" and original.mode == "RGBA" and original.getchannel("A").getextrema() != (255, 255):
                raise ValueError("HERMES_UI_OPAQUE_REQUIRED")
            if key == "arcane-gallery-overlay":
                # Preserve the locked source pixel-for-pixel; only the DELIVERY
                # layer gets an actual transparent outside, picture and slots.
                canvas = original.convert("RGBA")
                alpha = Image.new("L", original.size, 0)
                painter = ImageDraw.Draw(alpha)
                painter.polygon([
                    (766, 2), (795, 40), (1389, 45), (1402, 52),
                    (1405, 652), (1396, 701), (1423, 712), (1451, 765),
                    (1470, 821), (1482, 843), (1470, 864), (1456, 929),
                    (1447, 969), (1400, 992), (1333, 989), (1307, 982),
                    (792, 990), (768, 1015), (740, 990), (233, 991),
                    (191, 981), (134, 991), (80, 968), (63, 947),
                    (51, 865), (41, 850), (53, 829), (60, 769),
                    (87, 714), (143, 694), (139, 650), (136, 57),
                    (144, 47), (736, 46)
                ], fill=255)
                painter.polygon([
                    (193, 103), (1342, 103), (1342, 636),
                    (1326, 653), (210, 653), (192, 637)
                ], fill=0)
                for rectangle in [
                    (276, 779, 438, 912), (460, 779, 644, 913),
                    (662, 779, 858, 913), (876, 779, 1072, 913),
                    (1091, 779, 1263, 912)
                ]:
                    painter.rounded_rectangle(rectangle, radius=10, fill=0)
                # Intersect the cut-out geometry with any pre-existing PNG alpha.
                # Never paint over transparency supplied by the artist.
                alpha = ImageChops.multiply(canvas.getchannel("A"), alpha.filter(ImageFilter.GaussianBlur(1.1)))
                canvas.putalpha(alpha)
                size = (1152, 768)
                image = canvas.resize(size, Image.Resampling.LANCZOS)
                required_alpha = image.getchannel("A").tobytes()
                if image.getchannel("A").getextrema() != (0, 255):
                    raise ValueError("HERMES_GALLERY_ALPHA_REQUIRED")
            else:
                image = original.convert("RGB").resize(size, Image.Resampling.LANCZOS)
                image = ImageEnhance.Brightness(image).enhance(0.80)
                required_alpha = None
    app_path = (ROOT / "features/material/goose04" / (key.removeprefix("arcane-gallery-goose-") + ".webp")
                if key in GOOSE_SIZES else
                ROOT / ("features/material" if key == "arcane-gallery-overlay" else "features/combat") / (key + ".webp"))
    app_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(app_path, "WEBP", quality=88 if key in GOOSE_SIZES else (80 if key == "arcane-gallery-overlay" else (86 if required_alpha else 82)), method=6, exact=True)
    app = app_path.read_bytes()
    if not 100 <= len(app) <= LIMIT:
        raise ValueError("HERMES_UI_WEBP_SIZE_INVALID")
    with Image.open(app_path) as verify:
        verify.load()
        if verify.format != "WEBP" or verify.size != size:
            raise ValueError("HERMES_UI_WEBP_DECODE_FAILURE")
        if required_alpha is not None and verify.convert("RGBA").getchannel("A").tobytes() != required_alpha:
            raise ValueError("HERMES_UI_WEBP_ALPHA_CHANGED")
    manifest_path = app_path.with_suffix(".json")
    manifest = {"schema":1,"kind":"ui","target_key":key,"source_path":source_name,
                "source_sha256":digest,"source_bytes":len(raw),"app_path":app_path.relative_to(ROOT).as_posix(),
                "app_sha256":hashlib.sha256(app).hexdigest(),"app_bytes":len(app),
                "width":size[0],"height":size[1],"alpha_preserved":required_alpha is not None,
                "supabase_activation":False}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("HERMES_UI_PREPARED", key, "source_sha256", digest, "webp_sha256", manifest["app_sha256"],"bytes",len(app))
    return app_path.relative_to(ROOT).as_posix(), manifest_path.relative_to(ROOT).as_posix()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    prepare(args.source)
