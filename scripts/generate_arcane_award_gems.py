#!/usr/bin/env python3
"""Deterministically recolor the approved ARCANE ruby masters into RGBA PNG variants."""
from __future__ import annotations

import colorsys
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEM_DIR = ROOT / "assets/arcane-awards/gems"
PALETTE = {
    "red": {"hue": 0}, "blue": {"hue": 220}, "green": {"hue": 132},
    "yellow": {"hue": 54}, "orange": {"hue": 30}, "purple": {"hue": 276},
    "pink": {"hue": 333}, "turquoise": {"hue": 172}, "cyan": {"hue": 190},
    "black": {"mode": "black"}, "white": {"mode": "white"},
    "brown": {"hue": 25, "value_scale": 0.74, "value_offset": 0.035, "saturation_scale": 0.92},
    "light-gray": {"mode": "light-gray"}, "dark-gray": {"mode": "dark-gray"},
    "amber": {"hue": 40},
}
FORMS = ("diamond", "round")


def recolor(source: Image.Image, color: str) -> Image.Image:
    settings = PALETTE[color]
    mode = settings.get("mode", "hue")
    out = source.copy().convert("RGBA")
    converted = []
    for red, green, blue, alpha in out.get_flattened_data():
        if alpha == 0:
            converted.append((red, green, blue, alpha))
            continue
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if mode == "black":
            value = 0.008 + 0.60 * (value ** 1.45)
            saturation = min(0.12, 0.025 + saturation * 0.12)
            hue = 0.60
        elif mode == "white":
            value = 0.68 + 0.32 * (value ** 1.10)
            saturation = min(0.10, saturation * 0.08)
            hue = 0.59
        elif mode == "light-gray":
            value = 0.40 + 0.44 * value
            saturation = min(0.14, saturation * 0.12)
            hue = 0.60
        elif mode == "dark-gray":
            value = 0.13 + 0.50 * value
            saturation = min(0.16, saturation * 0.14)
            hue = 0.60
        else:
            hue = settings["hue"] / 360
            value = min(1.0, value * settings.get("value_scale", 1.0) + settings.get("value_offset", 0.0))
            saturation = min(1.0, saturation * settings.get("saturation_scale", 1.0))
        r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
        converted.append((round(r * 255), round(g * 255), round(b * 255), alpha))
    out.putdata(converted)
    return out


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    masters = {form: Image.open(GEM_DIR / f"{form}-red.png").convert("RGBA") for form in FORMS}
    manifest = {"schema": 1, "source": "ARCANE_AWARD_SIMULATOR_V2_MOBIL.html embedded original PNGs", "source_transform": "RGB recolor only; preserve source alpha bytes and dimensions", "colors": list(PALETTE), "forms": list(FORMS), "assets": []}
    for color in PALETTE:
        for form in FORMS:
            target = GEM_DIR / f"{form}-{color}.png"
            image = masters[form] if color == "red" else recolor(masters[form], color)
            if color != "red":
                image.save(target, format="PNG", optimize=True)
            manifest["assets"].append({
                "asset_key": f"arcane-award-gem-{form}-{color}",
                "file": target.relative_to(ROOT).as_posix(),
                "width": image.width, "height": image.height, "mode": "RGBA",
                "alpha_sha256": hashlib.sha256(image.getchannel("A").tobytes()).hexdigest(),
                "png_sha256": sha(target), "source_sha256": sha(GEM_DIR / f"{form}-red.png"),
                "derived": color != "red",
            })
    (ROOT / "assets/arcane-awards/gem-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(manifest['assets'])} RGBA gemstones")


if __name__ == "__main__":
    main()
