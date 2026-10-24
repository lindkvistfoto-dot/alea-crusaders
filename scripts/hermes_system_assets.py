"""Metadata-backed known profiles plus generic HERMES system asset validation."""
import json
import re
from pathlib import Path

from PIL import Image

PROFILE = json.loads((Path(__file__).resolve().parents[1] / 'config/hermes-system-assets.json').read_text())
KEY = re.compile(r'^arcane-[a-z0-9]+(?:-[a-z0-9]+)*$')


def system_asset(key):
    if not isinstance(key, str) or not KEY.fullmatch(key):
        raise ValueError('INVALID_SYSTEM_ASSET_KEY')
    known = PROFILE['assets'].get(key)
    if known is not None:
        return known
    # New system assets use the shared Archive/Bases folder. Dimensions and
    # alpha are measured from the actual PNG; a per-image allowlist is not needed.
    return {
        'id': None,
        'label': ' '.join(part.capitalize() for part in key.split('-')[1:]),
        'source_size': None,
        'display_size': None,
        'archive_folder_id': PROFILE['default_archive_folder_id'],
    }


def validate_system_image(image, key):
    profile = system_asset(key)
    if image.mode != 'RGBA':
        raise ValueError('SYSTEM_ASSET_REQUIRES_RGBA')
    if not (1 <= image.width <= 4096 and 1 <= image.height <= 4096):
        raise ValueError('SYSTEM_ASSET_DIMENSIONS')
    if profile['source_size'] is not None and list(image.size) != profile['source_size']:
        raise ValueError('SYSTEM_ASSET_SOURCE_DIMENSIONS')
    low, high = image.getchannel('A').getextrema()
    if low != 0 or high < 240:
        raise ValueError('SYSTEM_ASSET_REQUIRES_TRUE_ALPHA')
    if profile['display_size'] is None:
        display = image.copy()
        display.thumbnail((PROFILE['max_edge'], PROFILE['max_edge']), Image.Resampling.LANCZOS)
        profile = {**profile, 'source_size': list(image.size), 'display_size': list(display.size)}
    return profile
