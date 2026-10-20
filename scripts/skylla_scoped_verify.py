#!/usr/bin/env python3
"""Issue a local short-lived capability and collect fixed-plan server receipts.

No Storage key, signed URLs, raw image bytes or write/delete endpoint are used.
The public descriptor requires a separate authorized Edge Function deployment.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import urllib.error
import urllib.request

import skylla_archive as s

ENDPOINT = 'https://wbmosmkirsitkonejzpg.supabase.co/functions/v1/skylla-verify-scoped'


def safe_path(path, private=False):
    path = Path(path)
    if path.is_symlink() or any(p.is_symlink() for p in path.parents):
        raise s.k.Blocked('SYMLINK_FORBIDDEN')
    if path.resolve().is_relative_to(s.ROOT) and (private or not path.resolve().is_relative_to(s.ROOT / 'docs/skylla')):
        raise s.k.Blocked('UNSAFE_CAPABILITY_OR_REPORT_PATH')
    return path


def validate_plan(plan, schema='skylla-server-allowlist/v1'):
    if (plan.get('schema') != schema
            or plan.get('project_id') != 'wbmosmkirsitkonejzpg'
            or hashlib.sha256(json.dumps(plan['entries'], separators=(',', ':'), ensure_ascii=False).encode()).hexdigest() != plan.get('plan_sha256')
            or len({e['id'] for e in plan['entries']}) != len(plan['entries'])):
        raise s.k.Blocked('FIXED_PLAN_REQUIRED')


def issue(plan, token_path, config_path, minutes=15, schema='skylla-server-allowlist/v1'):
    validate_plan(plan, schema)
    if not 1 <= minutes <= 30:
        raise s.k.Blocked('MAXIMUM_CAPABILITY_WINDOW_30_MINUTES')
    token_path = safe_path(token_path, private=True)
    config_path = safe_path(config_path)
    if token_path.exists() or config_path.exists():
        raise s.k.Blocked('EXCLUSIVE_NEW_CAPABILITY_FILES_REQUIRED')
    token = secrets.token_urlsafe(32)  # 256 random bits; only its hash is deployed.
    start = datetime.now(timezone.utc) - timedelta(seconds=5)
    descriptor = {'enabled': True, 'token_sha256': hashlib.sha256(token.encode()).hexdigest(),
                  'not_before': start.isoformat(), 'expires_at': (start+timedelta(minutes=minutes)).isoformat(),
                  'plan_sha256': plan['plan_sha256']}
    with os.fdopen(os.open(token_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'w') as out:
        out.write(token)
    with config_path.open('x') as out:
        json.dump(descriptor, out, indent=2)
    return descriptor


def read_token(path):
    path = safe_path(path, private=True)
    if not path.is_file() or stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise s.k.Blocked('PRIVATE_MODE_0600_REQUIRED')
    token = path.read_text()
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        raise s.k.Blocked('INVALID_CAPABILITY')
    return token


def post_receipt(token, entry, plan):
    request = urllib.request.Request(ENDPOINT,
        data=json.dumps({'id': entry['id'], 'plan_sha256': plan['plan_sha256']}).encode(),
        headers={'Content-Type': 'application/json', 'X-SKYLLA-Capability': token}, method='POST')
    try:
        with urllib.request.build_opener(s.k.NoRedirect()).open(request, timeout=35) as response:
            raw = response.read(65537)
            if response.status != 200 or len(raw) > 65536:
                raise s.k.Blocked('INVALID_VERIFIER_RESPONSE')
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        # Never print response body, request headers, token or provider exception.
        raise s.k.Blocked('VERIFIER_HTTP_' + str(error.code)) from None
    except s.k.Blocked:
        raise
    except Exception:
        raise s.k.Blocked('VERIFIER_TRANSFER_FAILED') from None


def validate_receipt(receipt, entry, plan, require_fresh=True):
    expected = {'schema': 'skylla-server-verification/v1', 'project_id': plan['project_id'],
                'plan_sha256': plan['plan_sha256'], 'system': 'supabase', 'id': entry['id'],
                'bucket': entry['bucket'], 'object_path': entry['object_path'], 'sha256': entry['sha256'],
                'drive_sha256': entry['sha256'], 'size_bytes': entry['size_bytes'],
                'permanent_drive_file_id': entry['permanent_drive_file_id'], 'format': 'PNG',
                'complete_decode': True, 'status': 'verified_complete',
                'safe_to_delete': False, 'deletion_authorized': False,
                'authorization_method': 'deployment_scoped_read_capability'}
    if any(receipt.get(k) != v for k, v in expected.items()):
        raise s.k.Blocked('RECEIPT_IDENTITY_MISMATCH')
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(receipt['verified_at'].replace('Z', '+00:00'))).total_seconds()
        until = datetime.fromisoformat(receipt['capability_expires_at'].replace('Z', '+00:00'))
        verified_at = datetime.fromisoformat(receipt['verified_at'].replace('Z', '+00:00'))
        if age < -10 or until <= verified_at or (require_fresh and (age > 120 or until <= datetime.now(timezone.utc))):
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise s.k.Blocked('STALE_OR_INVALID_SERVER_RECEIPT') from None


def verify(plan, token_path, output, post=post_receipt):
    validate_plan(plan)
    token = read_token(token_path)
    output = safe_path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    receipts = []
    stopped = None
    for entry in plan['entries']:
        try:
            receipt = post(token, entry, plan)
            validate_receipt(receipt, entry, plan)
        except s.k.Blocked as error:
            stopped = str(error)
            receipt = {'id': entry['id'], 'object_path': entry['object_path'],
                       'status': 'blocked', 'reason': stopped, 'safe_to_delete': False}
        except Exception:
            stopped = 'VERIFIER_FAILED'
            receipt = {'id': entry['id'], 'status': 'blocked', 'reason': stopped, 'safe_to_delete': False}
        with (output / (entry['id'] + '.json')).open('x') as out:
            json.dump(receipt, out, indent=2)
        receipts.append(receipt)
        if stopped:
            break
    report = {'schema': 'skylla-scoped-server-receipts/v1', 'plan_sha256': plan['plan_sha256'],
              'receipts': receipts, 'verified': sum(r['status'] == 'verified_complete' for r in receipts),
              'not_attempted': len(plan['entries'])-len(receipts), 'stopped_reason': stopped,
              'safe_to_delete': False, 'deletion_authorized': False}
    with (output / 'SKYLLA_SERVER_VERIFICATION_RECEIPTS.json').open('x') as out:
        json.dump(report, out, indent=2)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('issue', 'verify'):
        command = sub.add_parser(name)
        command.add_argument('--plan', type=Path, required=True)
        command.add_argument('--token-file', type=Path, required=True)
        if name == 'issue':
            command.add_argument('--public-config', type=Path, required=True)
            command.add_argument('--minutes', type=int, default=15)
        else:
            command.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        plan = s.k.load_json(args.plan)
        if args.command == 'issue':
            config = issue(plan, args.token_file, args.public_config, args.minutes)
            print(json.dumps({'allowed_objects': len(plan['entries']), 'expires_at': config['expires_at'],
                              'private_token_created': True, 'secret_printed': False}))
        else:
            report = verify(plan, args.token_file, args.output)
            print(json.dumps({k: report[k] for k in ('verified', 'not_attempted', 'stopped_reason', 'safe_to_delete')}))
    except s.k.Blocked as error:
        parser.exit(2, 'SKYLLA_BLOCKED:' + str(error) + '\n')
    except Exception:
        parser.exit(2, 'SKYLLA_BLOCKED:CONFIGURATION_OR_TRANSFER_FAILED\n')
