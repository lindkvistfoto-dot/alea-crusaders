#!/usr/bin/env python3
"""Execute only an explicitly owner-approved five-object proposal, with journaling.

No Storage credential leaves Supabase. The Edge Function revalidates actual source
bytes and live dependencies immediately before each exact Storage API deletion.
Unknown outcomes stop the batch and must be reconciled without automatic retry.
"""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

import skylla_scoped_verify as access

ENDPOINT = 'https://wbmosmkirsitkonejzpg.supabase.co/functions/v1/skylla-delete-pilot'
PROPOSAL = access.s.ROOT / 'docs/skylla/SKYLLA_DELETE_PILOT_APPROVAL.json'


def validate_approved_plan(plan, proposal_bytes):
    access.validate_plan(plan, 'skylla-approved-delete-pilot/v1')
    proposal = json.loads(proposal_bytes)
    if (plan.get('owner_approved') is not True or plan.get('bucket') != 'alea-hermes-source'
            or plan.get('separate_approval_required_for_further_objects') is not True
            or plan.get('approved_proposal_sha256') != hashlib.sha256(proposal_bytes).hexdigest()
            or proposal.get('object_count') != 5 or len(proposal.get('objects', [])) != 5
            or not 1 <= len(plan['entries']) <= 5):
        raise access.s.k.Blocked('EXACT_OWNER_APPROVED_PROPOSAL_REQUIRED')
    expected = {e['object_path']: e for e in proposal['objects']}
    if len({e['object_path'] for e in plan['entries']}) != len(plan['entries']):
        raise access.s.k.Blocked('DUPLICATE_OBJECT')
    for entry in plan['entries']:
        approved = expected.get(entry['object_path'], {})
        if (entry.get('bucket') != 'alea-hermes-source'
                or entry.get('sha256') != approved.get('source_actual_sha256')
                or entry.get('drive_sha256') != approved.get('drive_sha256')
                or entry.get('size_bytes') != approved.get('size_bytes')
                or entry.get('permanent_drive_file_id') != approved.get('permanent_drive_file_id')):
            raise access.s.k.Blocked('OBJECT_OUTSIDE_APPROVED_IDENTITIES')


def post(token, entry, plan, action):
    request = urllib.request.Request(ENDPOINT,
        data=json.dumps({'id': entry['id'], 'plan_sha256': plan['plan_sha256'], 'action': action}).encode(),
        headers={'Content-Type': 'application/json', 'X-SKYLLA-Capability': token}, method='POST')
    try:
        with urllib.request.build_opener(access.s.k.NoRedirect()).open(request, timeout=80) as response:
            raw = response.read(65537)
            if response.status != 200 or len(raw) > 65536:
                raise ValueError()
            return json.loads(raw)
    except Exception:
        raise access.s.k.Blocked('TRANSFER_OUTCOME_REQUIRES_RECONCILIATION') from None


def run(plan, token_path, output, action, proposal_bytes, transfer=post):
    validate_approved_plan(plan, proposal_bytes)
    token = access.read_token(token_path)
    output = access.safe_path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    receipts = []
    for entry in plan['entries']:
        # Exclusive intent persists BEFORE sending a potentially destructive request.
        intent = {'id': entry['id'], 'object_path': entry['object_path'], 'action': action,
                  'plan_sha256': plan['plan_sha256'], 'recorded_at': access.s.k.now()}
        (output / (entry['id'] + '.intent.json')).write_text(json.dumps(intent, indent=2))
        try:
            receipt = transfer(token, entry, plan, action)
            if (receipt.get('id') != entry['id'] or receipt.get('object_path') != entry['object_path']):
                raise access.s.k.Blocked('RESPONSE_IDENTITY_MISMATCH')
            if receipt.get('status') in ('preflight_verified', 'deleted_verified_absent', 'absence_check'):
                if any(receipt.get(k) != entry[k] for k in ('bucket','sha256','size_bytes','permanent_drive_file_id')):
                    raise access.s.k.Blocked('RESPONSE_IDENTITY_MISMATCH')
        except Exception:
            receipt = {**intent, 'status': 'outcome_unknown', 'reason': 'RECONCILE_NO_AUTOMATIC_RETRY'}
        (output / (entry['id'] + '.receipt.json')).write_text(json.dumps(receipt, indent=2))
        receipts.append(receipt)
        if receipt.get('status') == 'outcome_unknown':
            break
    report = {'schema': 'skylla-approved-pilot-execution/v1', 'action': action,
              'plan_sha256': plan['plan_sha256'], 'receipts': receipts,
              'not_attempted': len(plan['entries']) - len(receipts),
              'further_deletion_authorized': False, 'observed_at': access.s.k.now()}
    (output / 'REPORT.json').write_text(json.dumps(report, indent=2))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--token-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--action', choices=['check','absence','delete'], default='check')
    parser.add_argument('--execute-approved-pilot', action='store_true')
    args = parser.parse_args()
    if args.action == 'delete' and not args.execute_approved_pilot:
        parser.error('Explicit --execute-approved-pilot required')
    try:
        result = run(json.loads(args.plan.read_text()), args.token_file, args.output, args.action, PROPOSAL.read_bytes())
        print(json.dumps({'action': args.action, 'statuses': [r['status'] for r in result['receipts']],
                          'not_attempted': result['not_attempted'], 'further_deletion_authorized': False}))
    except Exception:
        parser.exit(2, 'SKYLLA_BLOCKED:APPROVAL_OR_EXECUTION_FAILED\n')
