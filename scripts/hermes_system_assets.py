"""The two approved system masters; no generic UI-upload or rule-table target."""
import json
from pathlib import Path

PROFILE = json.loads((Path(__file__).resolve().parents[1] / 'config/hermes-system-assets.json').read_text())


def system_asset(key):
    if key not in PROFILE['assets']:
        raise ValueError('UNKNOWN_SYSTEM_ASSET_KEY')
    return PROFILE['assets'][key]


def validate_system_image(image, key):
    profile = system_asset(key)
    if list(image.size) != profile['source_size']:
        raise ValueError('SYSTEM_ASSET_SOURCE_DIMENSIONS')
    if image.mode != 'RGBA':
        raise ValueError('SYSTEM_ASSET_REQUIRES_RGBA')
    low, high = image.getchannel('A').getextrema()
    if low != 0 or high < 240:
        raise ValueError('SYSTEM_ASSET_REQUIRES_TRUE_ALPHA')
    return profile
