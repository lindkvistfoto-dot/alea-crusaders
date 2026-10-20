#!/usr/bin/env python3
"""Read exactly five scoped display images; fully decode locally, never write Storage."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request

from PIL import Image
import skylla_scoped_verify as access

ENDPOINT = 'https://wbmosmkirsitkonejzpg.supabase.co/functions/v1/skylla-display-read'


def verify_image(raw, entry):
    if (len(raw) != entry['size_bytes'] or hashlib.sha256(raw).hexdigest() != entry['sha256']
            or raw[:4] != b'RIFF' or raw[8:12] != b'WEBP'
            or int.from_bytes(raw[4:8], 'little') + 8 != len(raw)):
        raise access.s.k.Blocked('DISPLAY_HASH_SIZE_OR_CONTAINER_MISMATCH')
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != 'WEBP' or getattr(image, 'n_frames', 1) != 1:
                raise ValueError()
            image.verify()
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            width, height, mode = image.width, image.height, image.mode
            if mode not in ('RGB', 'RGBA') or width <= 0 or height <= 0:
                raise ValueError()
    except Exception:
        raise access.s.k.Blocked('DISPLAY_FULL_DECODE_FAILED') from None
    return {'object_path': entry['source_object_path'], 'app_bucket': entry['bucket'],
            'app_path': entry['path'], 'status': 'fresh_bytes_verified',
            'sha256': entry['sha256'], 'size_bytes': len(raw), 'format': 'WEBP',
            'width': width, 'height': height, 'color_mode': mode, 'complete_decode': True,
            'verified_at': access.s.k.now(), 'reference_changed': False, 'safe_to_delete': False}


def fetch_image(token, entry, plan):
    request = urllib.request.Request(ENDPOINT,
        data=json.dumps({'id': entry['id'], 'plan_sha256': plan['plan_sha256']}).encode(),
        headers={'Content-Type': 'application/json', 'X-SKYLLA-Capability': token}, method='POST')
    try:
        with urllib.request.build_opener(access.s.k.NoRedirect()).open(request, timeout=35) as response:
            raw = response.read(1024*1024+1)
            if response.status != 200 or len(raw) > 1024*1024:
                raise ValueError()
            return raw
    except Exception:
        raise access.s.k.Blocked('SCOPED_DISPLAY_READ_FAILED') from None


def verify(plan, token_path, output, fetch=fetch_image):
    access.validate_plan(plan, 'skylla-display-read-plan/v1')
    if len(plan['entries']) != 5:
        raise access.s.k.Blocked('EXACT_FIVE_DISPLAY_SCOPE_REQUIRED')
    token = access.read_token(token_path)
    output = access.safe_path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    results = []
    for entry in plan['entries']:
        raw = fetch(token, entry, plan)
        proof = verify_image(raw, entry)
        # Preserve an isolated binary restore/read sample, never an active file.
        with (output / (entry['id'] + '.webp')).open('xb') as out:
            out.write(raw)
        results.append(proof)
    report = {'schema': 'skylla-display-checks/v1', 'observed_at': access.s.k.now(),
              'plan_sha256': plan['plan_sha256'], 'results': results, 'production_writes': 0}
    with (output / 'APP_IMAGE_CHECKS_FRESH.json').open('x') as out:
        json.dump(report, out, indent=2)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--token-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        report = verify(access.s.k.load_json(args.plan), args.token_file, args.output)
        print(json.dumps({'verified_displays': len(report['results']), 'production_writes': 0}))
    except Exception:
        parser.exit(2, 'SKYLLA_BLOCKED:DISPLAY_VERIFICATION_FAILED\n')
