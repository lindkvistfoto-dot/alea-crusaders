#!/usr/bin/env python3
"""Build a fixed server allowlist from actual Drive readbacks, never job hashes alone."""
import argparse
import hashlib
import json
from pathlib import Path

import skylla_archive as s


def build(manifest, evidence, folders):
    objects = {r['object_path']: r for r in manifest['objects']}
    if len(objects) != len(manifest['objects']):
        raise s.k.Blocked('DUPLICATE_OBJECT_PATH')
    entries = []
    seen = set()
    for proof in evidence['proofs']:
        desc = proof.get('descriptor')
        if desc is None:
            path = proof['object_path']
            row = objects[path]
            parts = path.split('/')
            desc = {'bucket': s.BUCKET, 'object_path': path, 'kind': parts[0], 'target_key': parts[1],
                    'expected_sha256': row['recorded_job_sha256_not_current_bytes'],
                    'expected_size_bytes': row['size_bytes'], 'inbox_file_id': proof['inbox_file_id'],
                    'target_folder_id': proof['target_folder_id']}
        s.validate_descriptor(desc, folders)
        path = desc['object_path']
        row = objects.get(path)
        if path in seen or row is None:
            raise s.k.Blocked('DUPLICATE_OR_UNKNOWN_READBACK')
        seen.add(path)
        sha = desc['expected_sha256']
        if (proof.get('archive_status') != 'verified_readback' or proof.get('bytes_equal') is not True
                or proof.get('drive_sha256') != sha or proof.get('size_bytes') != row['size_bytes']
                or proof.get('permanent_drive_file_id') != row.get('permanent_drive_file_id')
                or row.get('drive_sha256') != sha
                or row.get('target_folder_id') != desc['target_folder_id']
                or proof.get('target_folder_id') != desc['target_folder_id']
                or proof.get('permanent_drive_file_id') == desc['inbox_file_id']
                or desc['inbox_file_id'] not in row['inbox_file_ids']):
            raise s.k.Blocked('PERMANENT_READBACK_IDENTITY_REQUIRED')
        for side in ('source_drive_verification', 'archive_verification'):
            p = proof.get(side, {})
            if (p.get('complete_decode') is not True or p.get('status') != 'verified_complete'
                    or p.get('sha256') != sha or p.get('size_bytes') != row['size_bytes']
                    or p.get('format') != 'PNG' or p.get('color_mode') not in ('RGB', 'RGBA')
                    or not p.get('verified_at')):
                raise s.k.Blocked('FULL_BYTE_AND_DECODE_PROOF_REQUIRED')
            if (not isinstance(p.get('width'), int) or not isinstance(p.get('height'), int)
                    or not 0 < p['width'] <= 4096 or not 0 < p['height'] <= 4096
                    or p['width']*p['height'] > 2048*2048 or row['size_bytes'] > 8*1024*1024):
                raise s.k.Blocked('EDGE_RESOURCE_LIMIT_EXCEEDED')
        entries.append({'id': hashlib.sha256(path.encode()).hexdigest(), 'bucket': s.BUCKET,
                        'object_path': path, 'sha256': sha, 'size_bytes': row['size_bytes'],
                        'permanent_drive_file_id': proof['permanent_drive_file_id'],
                        'target_folder_id': desc['target_folder_id'], 'drive_sha256': sha,
                        'drive_complete_decode': True, 'drive_verified_at': proof['verified_at']})
    entries.sort(key=lambda e: e['object_path'])
    raw = json.dumps(entries, separators=(',', ':'), ensure_ascii=False).encode()
    return {'schema': 'skylla-server-allowlist/v1', 'project_id': 'wbmosmkirsitkonejzpg',
            'plan_sha256': hashlib.sha256(raw).hexdigest(), 'entries': entries,
            'safe_to_delete': False, 'deletion_supported': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    plan = build(s.k.load_json(args.manifest), s.k.load_json(args.evidence),
                 s.k.load_json(s.ROOT / 'config/hermes-drive-folders.json'))
    # Exclusive output. Operator reviews the diff before replacing a deployed plan.
    with args.output.open('x') as stream:
        json.dump(plan, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
    print(json.dumps({'entries': len(plan['entries']), 'plan_sha256': plan['plan_sha256']}))
