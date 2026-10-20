#!/usr/bin/env python3
"""Keyless GitHub Actions client; secrets stay in memory or RUNNER_TEMP, never artifacts."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

import skylla_batch as batch

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = f'https://{batch.PROJECT}.supabase.co/functions/v1/skylla-mobile'


def request(url, body=None, headers=None):
    req = urllib.request.Request(url, data=batch.canonical(body) if body is not None else None,
        method='POST' if body is not None else 'GET',
        headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.build_opener(batch.archive.k.NoRedirect()).open(req, timeout=75) as r:
            raw = r.read(2097153)
            if len(raw) > 2097152:
                raise ValueError()
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        code = 'REMOTE_ACCESS_UNAVAILABLE'
        try:
            candidate = json.loads(e.read(4096)).get('error', '')
            if re.fullmatch('[A-Z][A-Z0-9_]{2,80}', candidate):
                code = candidate
        except Exception:
            pass
        raise batch.AuthorizationUnavailable(code) from None
    except batch.AuthorizationUnavailable:
        raise
    except Exception:
        raise batch.archive.k.Blocked('TRANSFER_OUTCOME_UNKNOWN') from None


def oidc(phase):
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    if not url.startswith('https://'):
        raise batch.AuthorizationUnavailable('GITHUB_OIDC_REQUIRED')
    result = request(url + ('&' if '?' in url else '?') + urllib.parse.urlencode({'audience': 'skylla-mobile:' + phase}),
        headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    return result['value']


def selected(batch_id, expected):
    catalog = batch.load(ROOT / 'config/skylla-mobile-batches.json')
    entry = catalog['batches'].get(batch_id)
    if not entry or entry['manifest_sha256'] != expected:
        raise batch.archive.k.Blocked('BATCH_NOT_IN_CATALOG')
    path = ROOT / entry['manifest_path']
    if not path.resolve().is_relative_to(ROOT / 'docs/skylla'):
        raise batch.archive.k.Blocked('MANIFEST_PATH_DENIED')
    manifest = batch.load(path)
    batch.validate_manifest(manifest)
    if manifest['batch_id'] != batch_id or manifest['manifest_sha256'] != expected:
        raise batch.archive.k.Blocked('EXACT_BATCH_REQUIRED')
    return manifest, entry


def environment_status():
    url = 'https://api.github.com/repos/lindkvistfoto-dot/alea-crusaders/environments/skylla-production'
    try:
        result = request(url, headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
            'Accept': 'application/vnd.github+json'})
        rule = next((r for r in result.get('protection_rules', []) if r['type'] == 'required_reviewers'), {})
        protected = (any(str(r['reviewer']['id']) == '337302317' for r in rule.get('reviewers', []))
            and rule.get('prevent_self_review') is False and result.get('can_admins_bypass') is False)
        return {'public_repository_supported': True, 'inspected': True, 'owner_gate_verified': protected,
            'prevent_self_review': rule.get('prevent_self_review'), 'admin_bypass': result.get('can_admins_bypass')}
    except Exception:
        return {'public_repository_supported': True, 'inspected': False, 'owner_gate_verified': False,
            'blocker': 'ENVIRONMENT_MISSING_OR_READ_ACCESS_UNAVAILABLE'}


def summary(text):
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if path:
        with open(path, 'a') as f:
            f.write(text + '\n')


def prepare(args):
    manifest, _ = selected(args.batch_id, args.manifest_sha256)
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    overview = {'batch_id': manifest['batch_id'], 'manifest_sha256': manifest['manifest_sha256'],
        'object_count': len(manifest['entries']), 'expected_bytes': sum(e['size_bytes'] for e in manifest['entries']),
        'mode': args.mode, 'environment': environment_status(), 'execution_enabled': False}
    policy = batch.load(ROOT / 'supabase/functions/skylla-mobile/policy.json')
    if args.mode == 'execute' and (not policy['execution_enabled'] or not overview['environment']['owner_gate_verified']):
        batch.atomic_json(output / 'PREFLIGHT.json', {**overview, 'blocker': 'PRODUCTION_EXECUTION_DISABLED_OR_UNPROTECTED'})
        raise batch.archive.k.Blocked('PRODUCTION_EXECUTION_DISABLED_OR_UNPROTECTED')
    prepared = request(ENDPOINT, {'operation': 'prepare', 'batch_id': args.batch_id,
        'manifest_sha256': args.manifest_sha256, 'mode': args.mode}, {'Authorization': 'Bearer ' + oidc('prepare')})
    if any(prepared.get(k) != overview[k] for k in ('batch_id', 'manifest_sha256', 'object_count', 'expected_bytes', 'mode')):
        raise batch.archive.k.Blocked('BROKER_MANIFEST_MISMATCH')
    batch.atomic_json(output / 'TICKET.json', prepared)  # Signed approval description; NOT an access credential.
    batch.atomic_json(output / 'PREFLIGHT.json', {**overview, 'execution_enabled': prepared['execution_enabled'],
        'commit': prepared['commit'], 'ticket_expires_at': prepared['expires_at']})
    with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
        f.write(f"count={overview['object_count']}\nbytes={overview['expected_bytes']}\n")
        f.write('execute_ready=' + str(prepared['execution_enabled'] and overview['environment']['owner_gate_verified']).lower() + '\n')
    summary(f"## SKYLLA {args.mode}: {args.batch_id}\n\n"
        f"**{overview['object_count']} objekt · {overview['expected_bytes']:,} byte**\n\n"
        f"Manifest SHA-256: `{args.manifest_sha256}`\n\n"
        f"Commit: `{prepared['commit']}`\n\n"
        f"Ägargrind verifierad: {overview['environment']['owner_gate_verified']}. "
        f"Produktionsradering aktiverad: {prepared['execution_enabled']}.\n\n"
        "Dry-run kan inte radera. Exakta sökvägar finns i det versionsbundna batchmanifestet.")


def run(args):
    manifest, catalog = selected(args.batch_id, args.manifest_sha256)
    prepared = batch.load(args.ticket)
    if any(prepared.get(k) != v for k, v in [('batch_id', args.batch_id), ('manifest_sha256', args.manifest_sha256), ('mode', args.mode)]):
        raise batch.archive.k.Blocked('PREFLIGHT_SCOPE_MISMATCH')
    authorization = request(ENDPOINT, {'operation': 'authorize', 'ticket': prepared['ticket']},
        {'Authorization': 'Bearer ' + oidc('authorize'), 'X-SKYLLA-GitHub-Token': os.environ.get('GITHUB_TOKEN', '')})
    private = Path(os.environ['RUNNER_TEMP']) / 'skylla-mobile-private'
    private.mkdir(mode=0o700, exist_ok=True)
    private.chmod(0o700)
    credential = private / 'credential.json'
    fd = os.open(credential, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(authorization, f)
    drive_token = os.environ.get('GOOGLE_ACCESS_TOKEN', '')

    def send(token, plan, entry, action, receipt):
        return request(ENDPOINT, {'operation': 'run', 'manifest_sha256': plan['manifest_sha256'],
            'id': entry['id'], 'action': action, 'receipt': receipt},
            {'Authorization': 'Bearer ' + token, 'X-SKYLLA-Drive-Token': drive_token})

    seed = batch.load(ROOT / catalog['receipts_path']).get('results', [])
    result = batch.run(manifest, credential, args.output / 'journal', verify_only=args.mode == 'dry-run',
        initial_receipts=seed, send=send, token_loader=lambda p: batch.load(p)['credential'])
    summary(f"## SKYLLA färdig: {args.batch_id}\n\n"
        f"Verifierade: **{result['verified']}** · Överhoppade: **{result['skipped']}** · "
        f"Okänt resultat: **{result['unknown']}** · Ej körda: **{result['not_attempted']}**\n\n"
        f"Bekräftat borttagna denna körning: **{result['confirmed_deleted_this_run']}**\n\n"
        f"Verifierat frigjorda objektbyte: **{result['reclaimed_object_bytes_verified']}**\n\n"
        f"Manifest SHA-256: `{args.manifest_sha256}`. Full rapport och journal finns i körningens artefakt.\n\n"
        "Objektbyte är inte samma sak som omedelbart uppdaterad Supabase-kvot/fakturering.")
    print(json.dumps({k: v for k, v in result.items() if k != 'results'}))
    # A completed report with skips is useful, but must not produce a green readiness signal.
    return 0 if result['verified' if args.mode == 'dry-run' else 'verified_absent_in_batch'] == result['object_count'] else 2


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['prepare', 'run'])
    p.add_argument('--batch-id', required=True)
    p.add_argument('--manifest-sha256', required=True)
    p.add_argument('--mode', choices=['dry-run', 'execute'], default='dry-run')
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--ticket', type=Path)
    args = p.parse_args()
    try:
        return prepare(args) if args.command == 'prepare' else run(args)
    except (batch.archive.k.Blocked, batch.AuthorizationUnavailable) as e:
        code = str(e) if re.fullmatch('[A-Z][A-Z0-9_]{2,80}', str(e)) else 'MOBILE_SAFETY_CHECK_FAILED'
        args.output.mkdir(parents=True, exist_ok=True)
        batch.atomic_json(args.output / 'BLOCKED.json', {'error': code, 'deletion_performed': False if args.command == 'prepare' or args.mode == 'dry-run' else 'unknown'})
        summary(f'## SKYLLA blockerad\n\n`{code}`. Se artefakt och åtgärda behörigheten före ny körning.')
        print(code)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
