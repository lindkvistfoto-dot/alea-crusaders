#!/usr/bin/env python3
"""Work-side HERMES delivery coordinator. No credentials or original bytes in its ledger.

The tool host must service the JSON-line requests on stdout with connected tool results
on stdin. This is a transport, not an unattended scheduler. See AUTOMATION.md.
"""
from __future__ import annotations

import base64
import contextlib
import fcntl
import hashlib
import io
import json
import re
import sqlite3
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath
from urllib.parse import urlencode

from PIL import Image
from hermes_drive_intake import (FOLDER, REPO, MAX_BYTES, FILE_ID_PATTERN,
                                 archive_folder, batch_request, validate_batch_item, validate_png)

CONFIG = Path(__file__).resolve().parents[1] / 'config/hermes-drive-folders.json'
READY = re.compile(r'^hermes4-([a-z0-9][a-z0-9-]{0,49})\.ready\.json$')
MAX_JSON = 1_048_576


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def delivery(raw, filename):
    require(len(raw) <= MAX_JSON, 'MANIFEST_TOO_LARGE')
    match = READY.fullmatch(filename)
    require(match, 'INVALID_READY_FILENAME')
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique_keys)
    require(isinstance(value, dict) and set(value) == {
        'batch_id', 'complete', 'expected_count', 'schema', 'mode', 'items'}, 'INVALID_DELIVERY_SCHEMA')
    require(value['batch_id'] == match[1] and value['complete'] is True, 'DELIVERY_NOT_COMPLETE')
    batch = batch_request({k: value[k] for k in ('schema', 'mode', 'items')})
    require(batch['mode'] == 'publish', 'WORK_DELIVERY_REQUIRES_PUBLISH')
    require(type(value['expected_count']) is int and value['expected_count'] == len(batch['items']),
            'DELIVERY_COUNT_MISMATCH')
    sources, targets = set(), set()
    for item in batch['items']:
        validate_batch_item(item)
        require('archive_file_id' not in item, 'WORK_MUST_NOT_SUPPLY_ARCHIVE_ID')
        require(FILE_ID_PATTERN.fullmatch(item['drive_file_id']), 'INVALID_DRIVE_FILE_ID')
        # Also reject target aliases with different keys but the same pinned register ID.
        target = (item['kind'], item['target_id'])
        require(item['drive_file_id'] not in sources and target not in targets, 'DUPLICATE_DELIVERY_IDENTITY')
        sources.add(item['drive_file_id'])
        targets.add(target)
    return value


class Ledger:
    """One durable worker per ledger; source claims prevent cross-batch double handling.

    Keep the directory on a persistent volume, mode 0700, outside the checkout.
    A missing/lost ledger is a deployment fault; do not start a second worker.
    """
    def __init__(self, path):
        path = Path(path).resolve()
        require(not path.is_relative_to(CONFIG.parents[1]), 'LEDGER_MUST_BE_OUTSIDE_CHECKOUT')
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = open(str(path) + '.lock', 'a')
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            self.lock.close()
            raise
        self.db = sqlite3.connect(path)
        path.chmod(0o600)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, state TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, batch TEXT NOT NULL)')

    def close(self):
        self.db.close()
        self.lock.close()

    def save(self, state):
        with self.db:
            self.db.execute('UPDATE batches SET state=? WHERE id=?', (canonical(state), state['id']))

    def claim(self, manifest_id, value):
        digest = hashlib.sha256(canonical(value).encode()).hexdigest()
        row = self.db.execute('SELECT state FROM batches WHERE id=?', (value['batch_id'],)).fetchone()
        if row:
            state = json.loads(row[0])
            require(state['digest'] == digest and state['manifest_id'] == manifest_id, 'BATCH_ID_REUSED')
            return state
        state = dict(id=value['batch_id'], digest=digest, manifest_id=manifest_id, delivery=value,
                     items=[dict(request=i, status='received') for i in value['items']], attempts=[], status='received')
        with self.db:
            for item in value['items']:
                require(not self.db.execute('SELECT batch FROM sources WHERE id=?',
                                            (item['drive_file_id'],)).fetchone(), 'SOURCE_ALREADY_CLAIMED')
                self.db.execute('INSERT INTO sources VALUES (?,?)', (item['drive_file_id'], value['batch_id']))
            self.db.execute('INSERT INTO batches VALUES (?,?)', (value['batch_id'], canonical(state)))
        return state

    def states(self):
        return [json.loads(row[0]) for row in self.db.execute('SELECT state FROM batches ORDER BY id')]


class Coordinator:
    def __init__(self, drive, github, ledger, folders=None, max_attempts=3):
        self.drive, self.github, self.ledger = drive, github, ledger
        self.folders = folders or json.loads(CONFIG.read_text())
        self.max_attempts = max_attempts
        require(self.folders['inbox_folder_id'] == FOLDER, 'INBOX_CONFIGURATION_MISMATCH')
        require(self.folders['folders']['verified_duplicates'] != self.folders['folders']['quarantine'],
                'USE_VERIFIED_DUPLICATES_NOT_GENERAL_QUARANTINE')
        require(self.folders['safety']['no_automatic_deletes'] is True
                and self.folders['safety']['verified_delivery_moves_only'] is True, 'VERIFIED_MOVE_POLICY_REQUIRED')

    def checked_bytes(self, file_id, folder, item):
        meta = self.drive.meta(file_id)
        require(not meta.get('trashed') and folder in meta.get('parents', []), 'WRONG_DRIVE_PARENT')
        require(meta.get('mimeType') == 'image/png', 'FILE_NOT_PNG_MIME')
        # The connector's normalized metadata may omit trashed; prove live membership
        # with a server-filtered, non-trash listing as well as the returned parents.
        require(any(m['id'] == file_id for m in self.drive.list(folder, meta['name'])), 'LIVE_FILE_MEMBERSHIP_UNVERIFIED')
        require(100 <= int(meta.get('size', 0)) <= MAX_BYTES, 'FILE_SIZE_OUT_OF_RANGE')
        raw = self.drive.read(file_id, MAX_BYTES)
        require(len(raw) == int(meta['size']), 'FILE_TRUNCATED')
        with contextlib.redirect_stdout(sys.stderr):
            digest = validate_png(raw, item['kind'], item['target_key'])
        require(digest == item['source_sha256'], 'SOURCE_SHA256_MISMATCH')
        if item['kind'] == 'spell-cutout':
            with Image.open(io.BytesIO(raw)) as image:
                require(image.getchannel('A').getextrema()[0] == 0, 'CUTOUT_REQUIRES_FULLY_TRANSPARENT_PIXELS')
        return raw

    def archive(self, state):
        # No copy or queue write until EVERY expected source is present and validated.
        for row in state['items']:
            row['received'] = False
            row['stage'] = 'intake'
            try:
                meta = self.drive.meta(row['request']['drive_file_id'])
                row['received'] = FOLDER in meta.get('parents', []) and not meta.get('trashed')
                self.checked_bytes(row['request']['drive_file_id'], FOLDER, row['request'])
                row.pop('error', None)
            except Exception as error:
                row['error'] = safe_error(error)
        if any('error' in row for row in state['items']):
            return False
        for row in state['items']:
            try:
                row['stage'] = 'archive'
                item = row['request']
                folder = archive_folder(item['kind'], self.folders)
                name = item['source_sha256'] + '.png'
                if not row.get('archive_file_id'):
                    matches = [m for m in self.drive.list(folder, name) if m['name'] == name]
                    require(len(matches) <= 1, 'AMBIGUOUS_ARCHIVE_COPIES')
                    # A timed-out copy is reconciled by exact hash name + folder + byte verification.
                    archive_id = matches[0]['id'] if matches else self.drive.copy(item['drive_file_id'], folder, name)
                    row['archive_file_id'] = archive_id
                    self.ledger.save(state)
                require(row['archive_file_id'] != item['drive_file_id'], 'ARCHIVE_MUST_BE_SEPARATE')
                self.checked_bytes(row['archive_file_id'], folder, item)
                row.update(archive_verified=True, status='archived')
                row.pop('error', None)
            except Exception as error:
                row['error'] = safe_error(error)
            self.ledger.save(state)
        return all(r.get('archive_verified') and 'error' not in r for r in state['items'])

    def queue(self, state):
        indexes = [i for i, row in enumerate(state['items']) if row['status'] not in ('active', 'moved')]
        if not indexes or len(state['attempts']) >= self.max_attempts:
            return
        # Retry only the remaining items; verify their archive and Inbox again before a new start.
        for i in indexes:
            row = state['items'][i]
            row['stage'] = 'handoff'
            try:
                self.checked_bytes(row['request']['drive_file_id'], FOLDER, row['request'])
                self.checked_bytes(row['archive_file_id'], archive_folder(row['request']['kind'], self.folders), row['request'])
                self.drive.ensure_reader(row['request']['drive_file_id'])
                self.drive.ensure_reader(row['archive_file_id'])
                row.pop('error', None)
            except Exception as error:
                row['error'] = safe_error(error)
                self.ledger.save(state)
                raise
        request = dict(schema=4, mode='publish', items=[{
            **state['items'][i]['request'], 'archive_file_id': state['items'][i]['archive_file_id']} for i in indexes])
        attempt = dict(path=f"hermes/queue/work-{state['id']}-{len(state['attempts']) + 1}.json",
                       request=request, indexes=indexes, status='enqueueing')
        state['attempts'].append(attempt)
        self.ledger.save(state)  # Persist the intent BEFORE the network write.
        attempt['commit'] = self.github.enqueue(attempt['path'], request)
        attempt['status'] = 'queued'
        self.ledger.save(state)

    def publication(self, state, attempt):
        if attempt['status'] == 'enqueueing':
            attempt['commit'] = self.github.enqueue(attempt['path'], attempt['request'])
            attempt['status'] = 'queued'
            self.ledger.save(state)
        receipt = self.github.receipt(attempt['commit'], attempt['path'])
        if receipt is None:
            return False
        # Bind the report to this repository, push, workflow, main, commit and exact queue content.
        run, report = receipt['run'], receipt['report']
        require(type(receipt['duration_ms']) is int and receipt['duration_ms'] >= 0, 'INVALID_RUN_TIMING')
        require(run['repository']['full_name'] == REPO and run['head_sha'] == attempt['commit']
                and run['head_branch'] == 'main' and run['event'] == 'push'
                and run['path'] == '.github/workflows/hermes-drive-intake.yml'
                and run['status'] == 'completed', 'UNTRUSTED_ACTIONS_RECEIPT')
        if report is None:
            # A completed/cancelled run with no artifact supplies no cleanup proof.
            # The existing publisher's stable job identity permits a bounded retry
            # of all unconfirmed items, including any activation before interruption.
            for i in attempt['indexes']:
                state['items'][i].update(status='failed', stage='publication',
                                         error='PUBLICATION_PROOF_MISSING_SAFE_RETRY')
            attempt.update(status='completed', run_id=str(run['id']), duration_ms=receipt['duration_ms'],
                           conclusion=run['conclusion'])
            self.ledger.save(state)
            return True
        require(str(report['run_id']) == str(run['id']) and report['commit'] == attempt['commit']
                and report.get('run_attempt') == run.get('run_attempt') and type(report.get('run_attempt')) is int
                and report['mode'] == 'publish' and report['schema'] == 4, 'REPORT_IDENTITY_MISMATCH')
        rows = report['items']
        require(len(rows) == len(attempt['indexes']) and {r['index'] for r in rows} == set(range(len(rows))),
                'REPORT_ITEMS_MISMATCH')
        for result in rows:
            local = result['index']
            require(result['request'] == attempt['request']['items'][local], 'REPORT_REQUEST_MISMATCH')
            if result['status'] in ('active', 'already_active'):
                p = result.get('publication', {})
                require(report.get('source_bucket_empty') is True and not report.get('publication_error')
                        and result.get('archive_verified') is True and p.get('status') == result['status']
                        and p.get('target_id') == result['request']['target_id']
                        and p.get('bucket') in ('alea-spell-art', 'alea-hermes-public', 'alea-skill-art')
                        and re.fullmatch(r'[a-f0-9]{64}', p.get('app_sha256', ''))
                        and p.get('path', '').endswith('.webp'), 'PUBLICATION_PROOF_INCOMPLETE')
        # Validate the entire receipt before accepting any individual success.
        for result in rows:
            row = state['items'][attempt['indexes'][result['index']]]
            row['stage'] = 'publication'
            if result['status'] in ('active', 'already_active'):
                row.update(status='active', publication=result['publication'], run_id=str(run['id']))
                row.pop('error', None)
            else:
                row.update(status='failed', error=result.get('error') or
                           result.get('publication', {}).get('error') or 'PUBLICATION_NOT_CONFIRMED')
        attempt.update(status='completed', run_id=str(run['id']),
                       duration_ms=receipt['duration_ms'], conclusion=run['conclusion'])
        self.ledger.save(state)
        return True

    def move_verified(self, state):
        quarantine = self.folders['folders']['verified_duplicates']
        for row in state['items']:
            if row['status'] != 'active':
                continue
            try:
                row['stage'] = 'cleanup'
                item = row['request']
                # Recheck the permanent original before removing the Inbox parent.
                row['archive_verified'] = False
                self.checked_bytes(row['archive_file_id'], archive_folder(item['kind'], self.folders), item)
                row['archive_verified'] = True
                meta = self.drive.meta(item['drive_file_id'])
                if FOLDER in meta.get('parents', []):
                    self.checked_bytes(item['drive_file_id'], FOLDER, item)
                    self.drive.move(item['drive_file_id'], FOLDER, quarantine)
                self.checked_bytes(item['drive_file_id'], quarantine, item)
                require(FOLDER not in self.drive.meta(item['drive_file_id'])['parents'], 'INBOX_MOVE_UNCONFIRMED')
                row.update(status='moved', stage='completed')
                row.pop('error', None)
            except Exception as error:
                row['error'] = safe_error(error)
            self.ledger.save(state)

    def report(self, state):
        done = all(r['status'] == 'moved' for r in state['items'])
        state['status'] = 'pending'
        counts = dict(received=sum(bool(r.get('received')) for r in state['items']),
                      archived=sum(bool(r.get('archive_verified')) for r in state['items']),
                      published_webp=sum('publication' in r for r in state['items']),
                      activated_references=sum('publication' in r for r in state['items']),
                      moved_from_inbox=sum(r['status'] == 'moved' for r in state['items']))
        report = dict(schema=4, batch_id=state['id'], manifest_sha256=state['digest'], status=state['status'],
                      expected_count=len(state['items']), counts=counts, items=state['items'], attempts=state['attempts'],
                      retryable=True, automatic_retry_remaining=not done and len(state['attempts']) < self.max_attempts,
                      error=state.get('error'))
        # Stable report name; update an existing ID after uncertain writes, never append duplicates.
        self.drive.report('hermes4-' + state['id'] + '.report.json', canonical(report).encode(),
                          self.folders['folders']['batches_reports'])
        if done:
            meta = self.drive.meta(state['manifest_id'])
            if FOLDER in meta.get('parents', []):
                self.drive.move(state['manifest_id'], FOLDER, self.folders['folders']['batches_reports'])
            require(self.folders['folders']['batches_reports'] in self.drive.meta(state['manifest_id'])['parents']
                    and FOLDER not in self.drive.meta(state['manifest_id'])['parents'], 'MANIFEST_MOVE_UNCONFIRMED')
            report['status'] = 'completed'
            report['retryable'] = False
            self.drive.report('hermes4-' + state['id'] + '.report.json', canonical(report).encode(),
                              self.folders['folders']['batches_reports'])
            state['status'] = 'completed'
        self.ledger.save(state)
        return report

    def step(self, state):
        if state['status'] == 'completed':
            return  # Never reopen completed deliveries or touch their originals.
        try:
            if not state['attempts']:
                if not self.archive(state):
                    return self.report(state)
                self.queue(state)
            attempt = state['attempts'][-1]
            if attempt['status'] != 'completed':
                if not self.publication(state, attempt):
                    return self.report(state)
            self.move_verified(state)
            if any(r['status'] == 'failed' for r in state['items']):
                self.queue(state)
            state.pop('error', None)
        except Exception as error:
            state['error'] = safe_error(error)
            self.ledger.save(state)
        return self.report(state)

    def tick(self):
        # A bad/incomplete manifest must not block other independent deliveries.
        errors = []
        for meta in self.drive.list(FOLDER):
            if not READY.fullmatch(meta['name']):
                continue
            try:
                require(meta['mimeType'] == 'application/json' and int(meta['size']) <= MAX_JSON,
                        'INVALID_MANIFEST_METADATA')
                raw = self.drive.read(meta['id'], MAX_JSON)
                require(len(raw) == int(meta['size']), 'MANIFEST_TRUNCATED')
                self.ledger.claim(meta['id'], delivery(raw, meta['name']))
            except Exception as error:
                errors.append(dict(manifest_id=meta['id'], error=safe_error(error)))
        reports = []
        for state in self.ledger.states():
            if state['status'] == 'completed':
                continue
            # Never use an old manifest after Work changes its bytes in place.
            try:
                current = self.drive.read(state['manifest_id'], MAX_JSON)
                require(delivery(current, 'hermes4-' + state['id'] + '.ready.json') == state['delivery'],
                        'MANIFEST_CHANGED_AFTER_CLAIM')
                report = self.step(state)
                if report:
                    reports.append(report)
            except Exception as error:
                errors.append(dict(batch_id=state['id'], error=safe_error(error)))
        return dict(reports=reports, errors=errors)


def safe_error(error):
    # Connector responses may contain signed URLs. Persist only controlled error codes.
    return str(error) if isinstance(error, ValueError) and re.fullmatch(r'[A-Z0-9_]+', str(error)) else 'EXTERNAL_OPERATION_FAILED'


class ToolRPC:
    """No shell, token export or direct Google API: use the connected identity in the host."""
    def __call__(self, name, **arguments):
        print(canonical(dict(tool='mcp__codex_apps__' + name, arguments=arguments)), flush=True)
        result = json.loads(sys.stdin.readline())
        require(not result.get('isError') and 'error' not in result, 'CONNECTED_TOOL_FAILED')
        return result.get('structuredContent', result)


def json_content(result):
    while isinstance(result, dict) and isinstance(result.get('content'), str):
        result = json.loads(result['content'])
    return result


def materialized(result, limit):
    """Only read authenticated materializations; never dereference arbitrary bearer URLs."""
    path = result.get('workspace_path') or result.get('file_uri')
    if isinstance(path, dict):
        path = path.get('workspace_path') or path.get('path')
    require(isinstance(path, str) and Path(path).is_absolute(), 'MATERIALIZED_FILE_REQUIRED')
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= limit, 'INVALID_MATERIALIZED_FILE')
    with path.open('rb') as stream:
        data = stream.read(limit + 1)
    require(len(data) <= limit, 'MATERIALIZED_FILE_TOO_LARGE')
    # The authenticated tool host owns materialization cleanup; never unlink an arbitrary supplied path.
    return data


class ConnectedDrive:
    def __init__(self, call):
        self.call = call

    def meta(self, file_id):
        m = self.call('google_drive_get_file_metadata', fileId=file_id,
                      fields='id,name,mimeType,parents,size,trashed')
        return dict(id=m['id'], name=m.get('title', m.get('name')),
                    mimeType=m.get('mime_type', m.get('mimeType')), size=m.get('size'),
                    parents=m.get('parent_ids', m.get('parents', [])), trashed=m.get('trashed', False))

    def list(self, folder, name=None):
        if name is None or not name.endswith('.png'):
            # The legacy search endpoint omits raw JSON in the connected provider.
            # Use a bounded direct-folder enumeration for manifests/reports instead.
            response = self.call('google_drive_list_folder',
                                 url='https://drive.google.com/drive/folders/' + folder, top_k=1000)
            files = response['files']
            require(len(files) < 1000 and not response.get('truncated')
                    and not response.get('next_page_token'), 'DRIVE_LIST_INCOMPLETE')
            candidates = [m for m in files if (name is None or m.get('title', m.get('name')) == name)
                          and (name is not None or folder != FOLDER
                               or m.get('mime_type', m.get('mimeType')) == 'application/json')]
            return [self.meta(m['id']) for m in candidates]
        query = "'" + folder + "' in parents and trashed = false"
        if name is not None:
            query += " and name = '" + name.replace('\\', '\\\\').replace("'", "\\'") + "'"
        page, result, seen = None, [], set()
        while True:
            args = dict(special_filter_query_str=query, best_effort_fetch=False, topn=100)
            if name and name.endswith('.png'):
                args['item_type'] = 'image'
            # Fail closed at the bounded legacy JSON search limit. Never infer absence there.
            if page:
                args['page_token'] = page
            response = self.call('google_drive_search', **args)
            require(not response.get('incompleteSearch') and not response.get('truncated'), 'DRIVE_LIST_INCOMPLETE')
            for row in response.get('results', []):
                result.append(self.meta(row['id']))
            page = response.get('next_page_token')
            if not page:
                require(len(response.get('results', [])) < 100 or args.get('item_type') == 'image',
                        'DRIVE_LIST_INCOMPLETE')
                return result
            require(page not in seen, 'DRIVE_PAGINATION_LOOP')
            seen.add(page)

    def read(self, file_id, limit):
        meta = self.meta(file_id)  # Ground MIME and identity before the raw fetch.
        require(meta['id'] == file_id and int(meta['size'] or 0) <= limit, 'FILE_SIZE_OUT_OF_RANGE')
        result = self.call('google_drive_fetch', url='https://drive.google.com/file/d/' + file_id + '/view',
                           download_raw_file=True, include_base64=False)
        return materialized(result, limit)

    def copy(self, file_id, folder, name):
        result = self.call('google_drive_copy_file', url='https://drive.google.com/file/d/' + file_id + '/view',
                           parent_folder=folder, new_title=name)
        # Do not infer IDs from titles. The connector must return an ID or a canonical URL.
        file_id = result.get('id') or result.get('file_id')
        if not file_id:
            match = re.search(r'/d/([A-Za-z0-9_-]+)', result.get('url', ''))
            file_id = match[1] if match else None
        require(isinstance(file_id, str) and FILE_ID_PATTERN.fullmatch(file_id), 'COPY_ID_MISSING')
        return file_id

    def ensure_reader(self, file_id):
        account = json.loads(CONFIG.read_text())['safety']['service_account']
        def roles():
            meta = self.call('google_drive_get_file_metadata', fileId=file_id,
                             fields='id,permissions(type,emailAddress,role)')
            require(isinstance(meta.get('permissions'), list), 'DRIVE_PERMISSION_METADATA_REQUIRED')
            return [p['role'] for p in meta['permissions'] if p.get('emailAddress') == account]
        existing = roles()
        require(all(role == 'reader' for role in existing), 'HERMES_MUST_REMAIN_READ_ONLY')
        if not existing:
            self.call('google_drive_share_file', url='https://drive.google.com/file/d/' + file_id + '/view',
                      user_email=account, permission='reader')
        require(set(roles()) == {'reader'}, 'HERMES_READER_PERMISSION_UNCONFIRMED')

    def move(self, file_id, source, destination):
        meta = self.meta(file_id)
        require(source in meta['parents'] and not meta.get('trashed'), 'MOVE_SOURCE_CHANGED')
        self.call('google_drive_update_file', fileId=file_id, addParents=destination, removeParents=source)
        meta = self.meta(file_id)
        require(destination in meta['parents'] and source not in meta['parents'], 'MOVE_READBACK_FAILED')

    def report(self, name, raw, folder):
        matches = self.list(folder, name)
        require(len(matches) <= 1, 'AMBIGUOUS_REPORT_FILES')
        with tempfile.TemporaryDirectory(prefix='hermes4-report-') as directory:
            path = Path(directory) / name
            path.write_bytes(raw)
            if matches:
                result = self.call('google_drive_update_file', fileId=matches[0]['id'], file_uri=str(path), mime_type='application/json')
            else:
                result = self.call('google_drive_upload_file', file_uri=str(path), file_name=name,
                                   mime_type='application/json', parent_folder_id=folder)
        # Resolve after create even if the upload response omits its ID.
        matches = self.list(folder, name)
        require(len(matches) == 1 and self.read(matches[0]['id'], MAX_JSON * 4) == raw, 'REPORT_READBACK_FAILED')


class ConnectedGitHub:
    def __init__(self, call):
        self.call = call
        self.root = 'https://api.github.com/repos/' + REPO

    def get(self, path):
        return json_content(self.call('github_fetch', url=self.root + path))

    def enqueue(self, path, request):
        # Read the directory instead of interpreting arbitrary connector error strings as 404.
        listing = self.get('/contents/hermes/queue?ref=main')
        require(isinstance(listing, list) and len(listing) < 1000, 'QUEUE_DIRECTORY_LIMIT_REACHED')
        matches = [row for row in listing if row['path'] == path]
        if not matches:
            self.call('github_create_file', repository_full_name=REPO, branch='main', path=path,
                      content=canonical(request) + '\n', message='HERMES Work delivery: ' + Path(path).stem)
        contents = self.get('/contents/' + path + '?ref=main')
        require(json.loads(base64.b64decode(contents['content'])) == request, 'QUEUE_CONTENT_COLLISION')
        commits = self.get('/commits?' + urlencode(dict(path=path, sha='main', per_page=2)))
        require(len(commits) == 1, 'QUEUE_WAS_MODIFIED')
        return commits[0]['sha']

    def receipt(self, commit, path):
        result = self.get('/actions/runs?' + urlencode(
            dict(head_sha=commit, event='push', branch='main', per_page=100)))
        require(result['total_count'] <= 100, 'ACTIONS_LIST_INCOMPLETE')
        runs = [r for r in result['workflow_runs'] if r['path'] == '.github/workflows/hermes-drive-intake.yml']
        if not runs:
            return None
        require(len(runs) == 1, 'AMBIGUOUS_PUBLICATION_RUNS')
        run = runs[0]
        if run['status'] != 'completed':
            return None
        jobs = self.get(f"/actions/runs/{run['id']}/jobs?filter=latest&per_page=100")
        require(jobs['total_count'] <= 100 and all(j['completed_at'] for j in jobs['jobs']),
                'RUN_TIMING_UNAVAILABLE')
        start = datetime.fromisoformat(run['run_started_at'].replace('Z', '+00:00'))
        end = max((datetime.fromisoformat(j['completed_at'].replace('Z', '+00:00')) for j in jobs['jobs']),
                  default=datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00')))
        duration_ms = int((end - start).total_seconds() * 1000)
        require(duration_ms >= 0, 'INVALID_RUN_TIMING')
        artifacts = self.get(f"/actions/runs/{run['id']}/artifacts?per_page=100")
        require(artifacts['total_count'] <= 100, 'ARTIFACT_LIST_INCOMPLETE')
        matches = [a for a in artifacts['artifacts'] if a['name'] == 'hermes4-batch-reports' and not a['expired']]
        require(len(matches) <= 1, 'AMBIGUOUS_PUBLICATION_ARTIFACTS')
        if not matches:
            return dict(run=run, report=None, duration_ms=duration_ms)
        data = self.call('github_download_workflow_artifact', repo_full_name=REPO, artifact_id=matches[0]['id'])
        raw = materialized(data, 16 * MAX_JSON)
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            # Read a bounded member in memory; never extract provider-controlled paths.
            suffix = Path(path).name + '/batch-report.json'
            members = [m for m in archive.infolist() if m.filename.endswith(suffix)]
            require(len(members) == 1 and members[0].file_size <= 4 * MAX_JSON
                    and '..' not in PurePosixPath(members[0].filename).parts, 'INVALID_BATCH_ARTIFACT')
            report = json.loads(archive.read(members[0]))
        return dict(run=run, report=report, duration_ms=duration_ms)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ledger', required=True, type=Path)
    args = parser.parse_args()
    if sys.stdin.isatty():
        # Tool hosts use a PTY so stdin stays open. Disable echo/canonical buffering
        # before receiving potentially large connector JSON responses.
        import tty
        tty.setcbreak(sys.stdin.fileno())
    ledger = Ledger(args.ledger)
    try:
        call = ToolRPC()
        result = Coordinator(ConnectedDrive(call), ConnectedGitHub(call), ledger).tick()
        # Detailed reports are already stored in Drive. Keep the tool transcript bounded.
        summary = dict(errors=result['errors'], reports=[{
            k: r[k] for k in ('batch_id', 'status', 'counts', 'retryable', 'automatic_retry_remaining', 'error')
        } for r in result['reports']])
        print(canonical(dict(result=summary)), flush=True)
    finally:
        ledger.close()
