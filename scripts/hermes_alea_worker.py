#!/usr/bin/env python3
"""Isolated HERMES ALEA archive worker. No active-pointer writes. Cleanup defaults report-only."""
import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import hermes_web_worker as io

UUID = re.compile(r'^[a-f0-9-]{36}$')
MIME_EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}


def validate_job(job):
    if not UUID.fullmatch(job['id']) or job['operation'] not in ('CREATE', 'REPLACE') or job['state'] != 'activated':
        raise ValueError('INVALID_JOB')
    if job['source_path'] != job['requested_by'] + '/' + job['id'] + '/original' or job['output_path'] != 'trophy/' + job['id'] + '.webp':
        raise ValueError('INVALID_JOB_PATH')
    if not re.fullmatch(r'[a-f0-9]{64}', job['source_sha256']) or job['source_mime'] not in MIME_EXT:
        raise ValueError('INVALID_SOURCE_METADATA')


def verify_archive(drive_id, expected_hash):
    ident = urllib.parse.quote(drive_id, safe='')
    headers = {'Authorization': 'Bearer ' + io.TOKEN}
    meta = json.loads(io.fetch('https://www.googleapis.com/drive/v3/files/' + ident + '?fields=id,parents,trashed', headers=headers))
    if io.FOLDER not in meta.get('parents', []) or meta.get('trashed'):
        raise ValueError('ARCHIVE_WRONG_FOLDER')
    content = io.fetch('https://www.googleapis.com/drive/v3/files/' + ident + '?alt=media', headers=headers)
    if io.digest(content) != expected_hash:
        raise ValueError('ARCHIVE_HASH_MISMATCH')


def upload_fixed_id(data, job, drive_id):
    # Official Drive pre-generated IDs make a replay return 409, not a duplicate file.
    boundary = 'hermesalea-' + job['id']
    b = boundary.encode()
    name = job['id'] + '-' + job['source_sha256'] + '.' + MIME_EXT[job['source_mime']]
    metadata = json.dumps({'id': drive_id, 'name': name, 'parents': [io.FOLDER]}).encode()
    payload = b'--' + b + b'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + metadata + b'\r\n--' + b + b'\r\nContent-Type: ' + job['source_mime'].encode() + b'\r\n\r\n' + data + b'\r\n--' + b + b'--\r\n'
    try:
        io.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', 'POST', payload, {'Authorization': 'Bearer ' + io.TOKEN, 'Content-Type': 'multipart/related; boundary=' + boundary})
    except urllib.error.HTTPError as error:
        if error.code != 409:
            raise


def archive_job(job):
    validate_job(job)
    original = io.storage_download('hermes-alea-originals', job['source_path'])
    if len(original) != job['source_bytes'] or not 0 < len(original) <= 12000000 or io.digest(original) != job['source_sha256']:
        raise ValueError('SOURCE_HASH_OR_SIZE_MISMATCH')
    drive_id = job.get('archive_drive_id')
    if not drive_id:
        generated = json.loads(io.fetch('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files', headers={'Authorization': 'Bearer ' + io.TOKEN}))['ids'][0]
        drive_id = io.rest('rpc/hermes_alea_archive_intent', 'POST', {'job_id': job['id'], 'token': job['lease_token'], 'drive_id': generated})
    try:
        verify_archive(drive_id, job['source_sha256'])
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        upload_fixed_id(original, job, drive_id)
        verify_archive(drive_id, job['source_sha256'])
    io.rest('rpc/hermes_alea_archive_result', 'POST', {'job_id': job['id'], 'token': job['lease_token'], 'drive_id': drive_id})


def archive_batch(jobs):
    errors = []
    for job in jobs:
        try:
            archive_job(job)
            print('HERMES_ALEA_ARCHIVED', job['id'])
        except Exception as error:
            # Do not log upstream responses, bearer tokens or private media paths.
            code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'[A-Z_]+', str(error)) else type(error).__name__
            try:
                io.rest('rpc/hermes_alea_archive_result', 'POST', {'job_id': job['id'], 'token': job['lease_token'], 'failure': code})
            except Exception:
                code += '_ACK_FAILED'
            errors.append({'job_id': job['id'], 'error': code})
    return errors


def all_rows(table):
    offset = 0
    while True:
        rows = io.rest(table + ('&' if '?' in table else '?') + f'limit=500&offset={offset}')
        yield from rows
        if len(rows) < 500:
            break
        offset += len(rows)


def inventory():
    offset = 0
    total = 0
    orphans = 0
    while True:
        rows = io.rest('rpc/hermes_alea_inventory', 'POST', {'page_offset': offset})
        total += len(rows)
        orphans += sum(1 for row in rows if not row.get('job_id'))
        if len(rows) < 500:
            return {'objects': total, 'orphans_for_review': orphans}
        offset += len(rows)


def missing_storage_object(error):
    if error.code == 404:
        return True
    if error.code != 400:
        return False
    try:
        body = json.loads(error.read(2048))
        return str(body.get('statusCode')) == '404' or body.get('error') in ('not_found', 'NoSuchKey')
    except (ValueError, AttributeError):
        return False


def cleanup_file(row, kind):
    # Re-read the actual Drive archive immediately before reservation/deletion.
    verify_archive(row['archive_drive_id'], row['source_sha256'])
    job = io.rest('rpc/hermes_alea_cleanup', 'POST', {'job_id': row['id'], 'kind': kind, 'action': 'reserve'})
    bucket = 'hermes-alea-originals' if kind == 'source' else 'hermes-alea-display'
    path = job['source_path' if kind == 'source' else 'output_path']
    expected = job['source_sha256' if kind == 'source' else 'output_sha256']
    try:
        content = io.storage_download(bucket, path)
    except urllib.error.HTTPError as error:
        if not missing_storage_object(error):
            raise
        # Missing after a prior reserved DELETE: reconcile the interrupted acknowledgement.
    else:
        if io.digest(content) != expected:
            raise ValueError('DELETE_HASH_MISMATCH')
        io.fetch(io.SUPA + '/storage/v1/object/' + bucket, 'DELETE', json.dumps({'prefixes': [path]}).encode(), {**io.BASE, 'Content-Type': 'application/json'})
        try:
            io.storage_download(bucket, path)
        except urllib.error.HTTPError as error:
            if not missing_storage_object(error):
                raise
        else:
            raise ValueError('DELETE_READBACK_FAILED')
    io.rest('rpc/hermes_alea_cleanup', 'POST', {'job_id': row['id'], 'kind': kind, 'action': 'ack'})


def cleanup_report(execute=False):
    report = {'mode': 'execute' if execute else 'report_only', 'source_candidates': 0, 'output_candidates': 0, 'abandoned_for_review': 0, 'failures': []}
    for row in all_rows('hermes_alea_cleanup_report?select=*'):
        report['abandoned_for_review'] += bool(row['abandoned_candidate'])
        for kind in ('source', 'output'):
            if row[kind + '_candidate']:
                report[kind + '_candidates'] += 1
                if execute:
                    try:
                        cleanup_file(row, kind)
                    except Exception as error:
                        report['failures'].append({'job_id': row['id'], 'kind': kind, 'error': type(error).__name__})
    report.update(inventory())
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-cleanup', action='store_true')
    args = parser.parse_args()
    if args.execute_cleanup and os.environ.get('HERMES_ALEA_CLEANUP_APPROVED') != 'true':
        raise RuntimeError('CLEANUP_NOT_APPROVED')
    io.FOLDER = os.environ.get('HERMES_ALEA_ARCHIVE_FOLDER_ID', '')
    if not io.FOLDER:
        raise RuntimeError('HERMES_ALEA_ARCHIVE_FOLDER_MISSING')
    io.TOKEN = io.user_drive_token()
    jobs = io.rest('rpc/hermes_alea_claim', 'POST', {'batch_size': 3})
    failures = archive_batch(jobs)
    report = cleanup_report(args.execute_cleanup)
    report['archive_failures'] = failures
    report['health'] = io.rest('rpc/hermes_alea_health', 'POST', {})
    print('HERMES_ALEA_REPORT', json.dumps(report))
    if failures or report['failures']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
