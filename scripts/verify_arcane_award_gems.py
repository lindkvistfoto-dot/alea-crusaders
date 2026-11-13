#!/usr/bin/env python3
"""Verify geometry, exact alpha preservation, and distinct palette outputs."""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEM_DIR = ROOT / "assets/arcane-awards/gems"
manifest = json.loads((ROOT / "assets/arcane-awards/gem-manifest.json").read_text())
assert len(manifest["assets"]) == 30
assert len(manifest["colors"]) == 15

for form in manifest["forms"]:
    master = Image.open(GEM_DIR / f"{form}-red.png").convert("RGBA")
    alpha = master.getchannel("A").tobytes()
    for color in manifest["colors"]:
        image = Image.open(GEM_DIR / f"{form}-{color}.png").convert("RGBA")
        assert image.size == (350, 350), (form, color, image.size)
        assert image.getchannel("A").tobytes() == alpha, (form, color, "alpha changed")
        assert hashlib.sha256(image.getchannel("A").tobytes()).hexdigest() == hashlib.sha256(alpha).hexdigest()
        if color != "red":
            assert image.convert("RGB").tobytes() != master.convert("RGB").tobytes(), (form, color, "not recolored")

print("verified 30 PNGs: identical 350×350 geometry and exact source alpha")
