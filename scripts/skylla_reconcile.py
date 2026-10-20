#!/usr/bin/env python3
"""Reconcile Drive-only readbacks into a blocked SKYLLA manifest. No network API."""
import argparse
import copy
import json
from pathlib import Path

import skylla_edge_plan as edge
import skylla_scoped_verify as scoped

s = edge.s


def attach_source_receipts(manifest, plan, report, evidence_reference):
    """Record historical verification events, never authorize deletion from them.

    Freshness is checked separately by eligibility at proposal/execution time.
    """
    scoped.validate_plan(plan)
    if report.get('plan_sha256') != plan['plan_sha256']:
        raise s.k.Blocked('RECEIPT_PLAN_MISMATCH')
    result = copy.deepcopy(manifest)
    rows = {r['object_path']: r for r in result['objects']}
    entries = {e['id']: e for e in plan['entries']}
    seen = set()
    for receipt in report['receipts']:
        identity = receipt.get('id')
        if identity in seen or identity not in entries:
            raise s.k.Blocked('DUPLICATE_OR_UNKNOWN_SERVER_RECEIPT')
        seen.add(identity)
        entry = entries[identity]
        if receipt.get('status') != 'verified_complete':
            continue
        scoped.validate_receipt(receipt, entry, plan, require_fresh=False)
        row = rows.get(entry['object_path'])
        if (not row or row.get('permanent_drive_file_id') != receipt['permanent_drive_file_id']
                or row.get('drive_sha256') != receipt['sha256']
                or row.get('size_bytes') != receipt['size_bytes']):
            raise s.k.Blocked('SOURCE_RECEIPT_DRIVE_IDENTITY_MISMATCH')
        previous = row.get('source_verification')
        if previous and previous['verified_at'] > receipt['verified_at']:
            continue
        row.update({'source_actual_sha256': receipt['sha256'],
                    'source_sha256_status': 'verified_complete_at_recorded_time',
                    'source_verified_at': receipt['verified_at'],
                    'source_verification': receipt,
                    'source_evidence_reference': evidence_reference,
                    'eligible_for_delete_proposal': False, 'safe_to_delete': False,
                    'deletion_status': 'blocked', 'estimated_reclaimable_bytes': 0})
        row['blocking_issues'] = sorted(set(r for r in row.get('blocking_issues', [])
                                          if r != 'current_supabase_bytes_not_verified') |
                                       {'supabase_revalidation_required_before_delete'})
    count = sum(r.get('source_verification', {}).get('status') == 'verified_complete' for r in result['objects'])
    result['summary'].update({'supabase_current_byte_verified': count,
                              'supabase_last_byte_verified': count,
                              'delete_eligible': 0, 'estimated_current_reclaimable_bytes': 0})
    return result


def reconcile(manifest, evidence, folders):
    result = copy.deepcopy(manifest)
    objects = {r['object_path']: r for r in result['objects']}
    if len(objects) != len(result['objects']):
        raise s.k.Blocked('DUPLICATE_OBJECT_PATH')
    proofs = {}
    for proof in evidence['proofs']:
        path = proof.get('object_path') or proof.get('descriptor', {}).get('object_path')
        if path not in objects or path in proofs:
            raise s.k.Blocked('DUPLICATE_OR_UNKNOWN_READBACK')
        row = objects[path]
        desc = proof.get('descriptor')
        if desc:
            s.validate_descriptor(desc, folders)
            if (desc['expected_sha256'] != row['recorded_job_sha256_not_current_bytes']
                    or desc['expected_size_bytes'] != row['size_bytes']):
                raise s.k.Blocked('SOURCE_IDENTITY_CONFLICT')
        archive_id = proof.get('permanent_drive_file_id', '')
        if not s.k.DRIVE_ID.fullmatch(archive_id):
            raise s.k.Blocked('INVALID_PERMANENT_ID')
        row.update({'permanent_drive_file_id': archive_id,
                    'drive_sha256': proof.get('drive_sha256'),
                    'target_folder_id': proof.get('target_folder_id'),
                    'version_id': proof.get('version_id'),
                    'archive_verified_at': proof.get('verified_at'),
                    'archive_status': 'verified_readback'})
        proofs[path] = proof
    # Validates both full byte proofs, exact Inbox identity, target folder and
    # source SHA before any reconciled output can be emitted.
    edge.build(result, evidence, folders)
    unique = {}
    for row in result['objects']:
        path = row['object_path']
        row.update({'eligible_for_delete_proposal': False, 'safe_to_delete': False,
                    'deletion_status': 'blocked', 'estimated_reclaimable_bytes': 0,
                    'delete_api_invoked': False})
        reasons = [r for r in row.get('blocking_issues', [])
                   if r not in ('remaining_batch_waits_for_verified_pilot',
                                'permanent_drive_readback_missing',
                                'drive_evidence_missing_or_stale')]
        if path in proofs:
            p = proofs[path]
            unique[p['permanent_drive_file_id']] = p['size_bytes']
            # Evidence freshness is a deletion gate, not a claim that a saved
            # readback remains current indefinitely.
            if 'drive_revalidation_required_before_delete' not in reasons:
                reasons.append('drive_revalidation_required_before_delete')
        else:
            reasons.append('permanent_drive_readback_missing')
            row['archive_status'] = 'readback_evidence_missing' if row.get('permanent_drive_file_id') else 'not_archived_in_SKYLLA'
        if row.get('source_actual_sha256') is None:
            row['source_sha256_status'] = 'not_read_operator_session_and_verification_window_required'
            if 'current_supabase_bytes_not_verified' not in reasons:
                reasons.append('current_supabase_bytes_not_verified')
        if 'separate_exact_delete_batch_approval_required' not in reasons:
            reasons.append('separate_exact_delete_batch_approval_required')
        row['blocking_issues'] = sorted(set(reasons))
    result['generated_at'] = s.k.now()
    result['summary'].update({'drive_archive_verified': len(proofs),
        'drive_archive_verified_bytes': sum(p['size_bytes'] for p in proofs.values()),
        'drive_archive_unique_files': len(unique), 'drive_archive_unique_bytes': sum(unique.values()),
        'drive_archive_pending': len(objects)-len(proofs), 'delete_eligible': 0,
        'blocked_objects': len(objects), 'estimated_current_reclaimable_bytes': 0})
    result['first_delete_pilot']['status'] = 'BLOCKED_NOT_A_DELETE_PROPOSAL'
    result['first_delete_pilot']['eligible_paths'] = []
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = reconcile(s.k.load_json(args.manifest), s.k.load_json(args.evidence),
                       s.k.load_json(s.ROOT / 'config/hermes-drive-folders.json'))
    s.write_manifest(args.output, report)
    print(json.dumps(report['summary']))
