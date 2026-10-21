import copy
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import hermes4_work as work
import hermes_drive_intake as intake


FOLDERS = json.loads(work.CONFIG.read_text())
ARCHIVE = FOLDERS['spell_types']['cutout']
REPORTS = FOLDERS['folders']['batches_reports']


def png(color=120):
    image = Image.new('RGBA', (1024, 1024))
    ImageDraw.Draw(image).ellipse((100, 100, 924, 924), fill=(color, 70, 40, 255))
    data = io.BytesIO()
    image.save(data, 'PNG')
    return data.getvalue()


class FakeDrive:
    def __init__(self):
        self.files, self.copies, self.moves, self.reports = {}, [], [], {}
        self.copy_timeout = self.move_timeout = self.report_timeout = self.trash_timeout = False
        self.trashes = []

    def add(self, file_id, name, data, folder, mime='image/png'):
        self.files[file_id] = dict(id=file_id, name=name, mimeType=mime, size=str(len(data)),
                                   parents=[folder], data=data, trashed=False, headRevisionId='revision-1', properties={})

    def meta(self, file_id):
        if file_id not in self.files:
            raise RuntimeError('missing file')
        return {k: copy.deepcopy(v) for k, v in self.files[file_id].items() if k != 'data'}

    def revision(self, file_id):
        return self.meta(file_id)['headRevisionId']

    def list(self, folder, name=None):
        return [self.meta(k) for k, m in self.files.items() if folder in m['parents'] and not m['trashed']
                and (name is None or name == m['name'])]

    def read(self, file_id, limit):
        data = self.files[file_id]['data']
        work.require(len(data) <= limit, 'TEST_READ_TOO_LARGE')
        return data

    def copy(self, file_id, folder, name):
        new_id = 'archive-copy-' + str(len(self.copies))
        self.add(new_id, name, self.files[file_id]['data'], folder)
        self.copies.append((file_id, new_id, folder))
        if self.copy_timeout:
            self.copy_timeout = False
            raise TimeoutError('response lost after server copied the file')
        return new_id

    def move(self, file_id, source, destination):
        self.files[file_id]['parents'].remove(source)
        if destination not in self.files[file_id]['parents']:
            self.files[file_id]['parents'].append(destination)
        self.moves.append((file_id, source, destination))
        if self.move_timeout:
            self.move_timeout = False
            raise TimeoutError('response lost after server moved the file')

    def report(self, name, data, folder):
        self.reports[name] = json.loads(data)
        if self.report_timeout:
            self.report_timeout = False
            raise TimeoutError('response lost after report saved')

    def ensure_reader(self, file_id, allow_inbox_editor=False):
        pass  # Remote read-only ACLs are exercised separately by connector contract tests.


class FakeTrash:
    def __init__(self, drive):
        self.drive = drive

    def trash(self, file_id, revision, intent):
        meta = self.drive.files[file_id]
        work.require(meta['parents'] == [work.FOLDER], 'CLEANUP_OUTSIDE_INBOX')
        work.require(meta['headRevisionId'] == revision, 'SOURCE_REVISION_CHANGED')
        if not meta['trashed']:
            meta.update(trashed=True, explicitlyTrashed=True, properties=dict(hermesCleanup=intent))
            self.drive.trashes.append(file_id)
            if self.drive.trash_timeout:
                self.drive.trash_timeout = False
                raise TimeoutError('trash response lost')
        work.require(meta['properties'].get('hermesCleanup') == intent, 'TRASHED_BY_OTHER_OPERATION')
        return dict(file_id=file_id, source_revision=revision, intent=intent, trashed=True)


class FakeGitHub:
    def __init__(self, drive):
        self.drive, self.queues, self.finished = drive, {}, {}
        self.writes, self.timeout = 0, False
        self.pending = {}

    def pending_sources(self):
        return self.pending

    def enqueue(self, path, request):
        if path not in self.queues:
            self.queues[path] = copy.deepcopy(request)
            self.writes += 1
        work.require(self.queues[path] == request, 'QUEUE_CONTENT_COLLISION')
        if self.timeout:
            self.timeout = False
            raise TimeoutError('response lost after queue commit')
        return hashlib.sha1(path.encode()).hexdigest()

    def receipt(self, commit, path):
        return self.finished.get(path)

    def finish(self, path=None, failed=(), real_conversion=False):
        path = path or list(self.queues)[-1]
        request = self.queues[path]
        if real_conversion:
            with tempfile.TemporaryDirectory() as out, \
                 patch.object(intake, 'verify_source_revision'), \
                 patch.object(intake, 'google_file', side_effect=lambda i: self.drive.read(i, work.MAX_BYTES)), \
                 patch.object(intake, 'drive_file', side_effect=lambda i, _: self.drive.read(i, work.MAX_BYTES)):
                manifest = intake.run_batch(request, Path(out))
                self_check = list(Path(out).rglob('*.png'))
                assert not self_check
                assert len(manifest['assets']) == len(request['items'])
                for a in manifest['assets']:
                    with Image.open(Path(out, a['app_file'])) as image:
                        assert image.format == 'WEBP' and image.size == (640, 640)
        rows = []
        for i, item in enumerate(request['items']):
            failed_item = i in failed
            status = 'failed' if failed_item else 'active'
            rows.append(dict(index=i, request=item, status=status, archive_verified=True,
                             publication=dict(status=status, target_id=item['target_id'],
                                              bucket='alea-spell-art', path='spell/test/verified.webp',
                                              app_sha256='b' * 64, error='SIMULATED_UPLOAD_FAILURE' if failed_item else None)))
        commit = hashlib.sha1(path.encode()).hexdigest()
        run = dict(id=10000000 + len(self.finished), repository=dict(full_name=work.REPO),
                   run_attempt=1,
                   head_sha=commit, head_branch='main', event='push', status='completed',
                   conclusion='failure' if failed else 'success', path='.github/workflows/hermes-drive-intake.yml')
        report = dict(schema=4, mode='publish', run_id=str(run['id']), commit=commit,
                      run_attempt=1,
                      items=rows, source_bucket_empty=True)
        self.finished[path] = dict(run=run, report=report, duration_ms=42000)
        return self.finished[path]


class WorkFlow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ledger = work.Ledger(Path(self.tmp.name) / 'ledger.db')
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self.ledger.close)
        self.drive = FakeDrive()
        self.github = FakeGitHub(self.drive)
        self.cleanup = FakeTrash(self.drive)
        self.worker = work.Coordinator(self.drive, self.github, self.ledger, cleanup=self.cleanup)
        self.value = dict(schema=4, mode='publish', batch_id='isolated-test', complete=True, expected_count=5, items=[])
        for i in range(5):
            raw = png(i + 100)
            file_id = f'inbox-source-{i}'
            self.drive.add(file_id, f'synthetic-{i}.png', raw, work.FOLDER)
            self.value['items'].append(dict(kind='spell-cutout', target_key=f'test-{i}', target_id=f'test_{i}',
                                           drive_file_id=file_id, source_sha256=hashlib.sha256(raw).hexdigest(),
                                           visual_approved=True, source_revision='revision-1'))
        self.manifest()

    def manifest(self, value=None, file_id='manifest-test-0'):
        value = value or self.value
        self.drive.add(file_id, f"hermes4-{value['batch_id']}.ready.json", work.canonical(value).encode(),
                       work.FOLDER, 'application/json')

    def tick(self):
        # Keep fixture verifier logs out of unittest output.
        with patch('sys.stderr', new=io.StringIO()):
            return self.worker.tick()

    def report(self):
        return self.drive.reports['hermes4-isolated-test.report.json']

    def test_end_to_end_real_image_verification_and_conversion_then_cleanup(self):
        self.tick()
        self.assertEqual((len(self.drive.copies), self.github.writes), (5, 1))
        self.assertFalse(self.drive.moves)
        self.assertFalse(self.drive.trashes)
        self.github.finish(real_conversion=True)
        self.tick()
        self.assertEqual(self.report()['counts'], dict(received=5, archived=5, published_webp=5,
                                                      activated_references=5, moved_from_inbox=5, trashed_from_inbox=5))
        self.assertEqual(self.report()['attempts'][0]['duration_ms'], 42000)
        self.assertEqual(self.report()['status'], 'completed')
        self.assertEqual(self.drive.meta('manifest-test-0')['parents'], [REPORTS])
        for i in range(5):
            self.assertEqual(self.drive.meta(f'inbox-source-{i}')['parents'], [work.FOLDER])
            self.assertTrue(self.drive.meta(f'inbox-source-{i}')['trashed'])
            self.assertEqual(self.drive.read(f'archive-copy-{i}', work.MAX_BYTES),
                             self.drive.read(f'inbox-source-{i}', work.MAX_BYTES))
        before = (self.github.writes, len(self.drive.copies), len(self.drive.moves))
        self.tick()
        self.assertEqual(before, (self.github.writes, len(self.drive.copies), len(self.drive.moves)))

    def test_twenty_synthetic_cutouts_use_one_publication_and_complete_cleanup(self):
        for i in range(5, 20):
            raw = png(i + 100)
            file_id = f'inbox-source-{i}'
            self.drive.add(file_id, f'synthetic-{i}.png', raw, work.FOLDER)
            self.value['items'].append(dict(kind='spell-cutout', target_key=f'test-{i}', target_id=f'test_{i}',
                                           drive_file_id=file_id, source_sha256=hashlib.sha256(raw).hexdigest(),
                                           visual_approved=True, source_revision='revision-1'))
        self.value['expected_count'] = 20
        self.manifest()
        self.tick()
        self.assertEqual(self.github.writes, 1)
        self.github.finish()
        self.tick()
        self.assertEqual(self.report()['counts'], dict(received=20, archived=20, published_webp=20,
                                                      activated_references=20, moved_from_inbox=20, trashed_from_inbox=20))
        self.assertEqual(self.report()['status'], 'completed')
        self.assertFalse(self.report()['retryable'])

    def test_incomplete_bad_hash_or_absent_source_never_copies_or_starts_actions(self):
        for failure in ('count', 'not_ready', 'hash', 'missing', 'bad_png', 'no_visual_approval', 'wrong_parent'):
            with self.subTest(failure=failure):
                original = copy.deepcopy(self.drive.files)
                value = copy.deepcopy(self.value)
                if failure == 'count': value['expected_count'] = 6
                if failure == 'not_ready': value['complete'] = False
                if failure == 'hash': value['items'][0]['source_sha256'] = '0' * 64
                if failure == 'missing': del self.drive.files['inbox-source-0']
                if failure == 'bad_png': self.drive.files['inbox-source-0']['data'] = b'not PNG'
                if failure == 'no_visual_approval': value['items'][0]['visual_approved'] = False
                if failure == 'wrong_parent': self.drive.files['inbox-source-0']['parents'] = [ARCHIVE]
                self.manifest(value)
                case_ledger = work.Ledger(Path(self.tmp.name) / (failure + '.db'))
                self.worker = work.Coordinator(self.drive, self.github, case_ledger, cleanup=self.cleanup)
                try:
                    self.tick()
                    self.assertEqual((self.drive.copies, self.github.writes, self.drive.moves), ([], 0, []))
                finally:
                    case_ledger.close()
                    self.drive.files = original

    def test_copy_response_lost_is_reconciled_by_hash_without_second_copy(self):
        self.drive.copy_timeout = True
        self.tick()
        self.assertEqual(len(self.drive.copies), 5)
        self.assertEqual(self.github.writes, 0)
        self.tick()
        self.assertEqual((len(self.drive.copies), self.github.writes), (5, 1))

    def test_lost_queue_commit_response_does_not_start_second_run(self):
        self.github.timeout = True
        self.tick()
        self.assertEqual(self.github.writes, 1)
        self.tick()
        self.assertEqual(self.github.writes, 1)
        self.github.finish()
        self.tick()
        self.assertEqual(self.report()['status'], 'completed')

    def test_partial_publication_trashes_only_successes_and_retries_only_failure(self):
        self.tick()
        self.github.finish(failed=(2,))
        self.tick()
        self.assertEqual(self.github.writes, 2)
        retry = list(self.github.queues.values())[-1]
        self.assertEqual([i['target_key'] for i in retry['items']], ['test-2'])
        self.assertEqual(self.report()['counts']['moved_from_inbox'], 4)
        self.assertEqual(self.drive.meta('manifest-test-0')['parents'], [work.FOLDER])
        self.assertEqual(self.drive.meta('inbox-source-2')['parents'], [work.FOLDER])
        self.github.finish()
        self.tick()
        self.assertEqual(self.report()['status'], 'completed')
        self.assertEqual(len(self.drive.copies), 5)

    def test_lost_trash_response_and_restart_only_finish_cleanup(self):
        self.tick()
        self.github.finish()
        self.drive.trash_timeout = True
        self.tick()
        self.assertEqual(self.report()['counts']['moved_from_inbox'], 4)
        self.ledger.close()
        self.ledger = work.Ledger(Path(self.tmp.name) / 'ledger.db')
        self.cleanup = FakeTrash(self.drive)
        self.worker = work.Coordinator(self.drive, self.github, self.ledger, cleanup=self.cleanup)
        self.addCleanup(self.ledger.close)
        self.tick()
        self.assertEqual(self.report()['status'], 'completed')
        self.assertEqual((self.github.writes, len(self.drive.copies), len(self.drive.trashes), len(self.drive.moves)), (1, 5, 5, 1))

    def test_report_failure_leaves_manifest_and_retry_finishes_without_republishing(self):
        self.tick()
        self.github.finish()
        self.drive.report_timeout = True
        self.assertTrue(self.tick()['errors'])
        self.assertEqual(self.drive.meta('manifest-test-0')['parents'], [work.FOLDER])
        self.tick()
        self.assertEqual(self.report()['status'], 'completed')
        self.assertEqual(self.github.writes, 1)

    def test_manifest_move_failure_cannot_leave_a_completed_final_report(self):
        self.tick()
        self.github.finish()
        original = self.drive.move
        def fail_manifest(file_id, source, destination):
            if file_id == 'manifest-test-0':
                raise TimeoutError('manifest move unavailable')
            return original(file_id, source, destination)
        with patch.object(self.drive, 'move', side_effect=fail_manifest):
            self.tick()
        self.assertEqual(self.report()['counts']['moved_from_inbox'], 5)
        self.assertEqual(self.report()['status'], 'pending')
        self.assertTrue(self.report()['retryable'])
        self.assertEqual(self.drive.meta('manifest-test-0')['parents'], [work.FOLDER])
        self.tick()
        self.assertEqual(self.report()['status'], 'completed')
        self.assertEqual(self.github.writes, 1)

    def test_changed_revision_with_identical_bytes_keeps_source_in_inbox(self):
        self.tick()
        self.github.finish()
        self.drive.files['inbox-source-0']['headRevisionId'] = 'revision-2'
        self.tick()
        self.assertFalse(self.drive.meta('inbox-source-0')['trashed'])
        self.assertEqual(self.report()['items'][0]['error'], 'SOURCE_REVISION_CHANGED')
        self.assertEqual(self.github.writes, 1)

    def test_another_batch_claim_blocks_cleanup_without_republication(self):
        self.tick()
        self.github.finish()
        with self.ledger.db:
            self.ledger.db.execute('UPDATE sources SET batch=? WHERE id=?', ('another-running-batch', 'inbox-source-0'))
        self.tick()
        self.assertFalse(self.drive.meta('inbox-source-0')['trashed'])
        self.assertEqual(self.report()['items'][0]['error'], 'SOURCE_CLAIM_CONFLICT')
        self.assertEqual(self.github.writes, 1)

    def test_another_pending_actions_batch_blocks_trash_of_shared_source(self):
        self.tick()
        self.github.finish()
        self.github.pending['inbox-source-0'] = {'hermes/queue/unrelated-batch.json'}
        self.tick()
        self.assertFalse(self.drive.meta('inbox-source-0')['trashed'])
        self.assertEqual(self.report()['items'][0]['error'], 'SOURCE_IN_OTHER_ACTIONS_BATCH')
        self.github.pending.clear()
        self.tick()
        self.assertTrue(self.drive.meta('inbox-source-0')['trashed'])
        self.assertEqual(self.github.writes, 1)

    def test_changed_manifest_and_reused_source_are_rejected(self):
        self.tick()
        self.value['items'][0]['target_key'] = 'changed-target'
        self.manifest()
        result = self.tick()
        self.assertTrue(any(e['error'] == 'BATCH_ID_REUSED' for e in result['errors']))
        self.assertFalse(self.drive.moves)
        self.assertFalse(self.drive.trashes)
        other = copy.deepcopy(self.value)
        other['batch_id'] = 'another-batch'
        self.manifest(other, 'manifest-test-1')
        result = self.tick()
        self.assertTrue(any(e['error'] == 'SOURCE_ALREADY_CLAIMED' for e in result['errors']))
        self.assertEqual(self.github.writes, 1)

    def test_archive_corruption_before_cleanup_keeps_that_inbox_source(self):
        self.tick()
        self.github.finish()
        self.drive.files['archive-copy-0']['data'] = png(250)
        self.tick()
        self.assertEqual(self.report()['counts']['moved_from_inbox'], 4)
        self.assertEqual(self.drive.meta('inbox-source-0')['parents'], [work.FOLDER])
        self.assertEqual(self.drive.meta('manifest-test-0')['parents'], [work.FOLDER])
        self.assertEqual(self.github.writes, 1)

    def test_cancelled_or_interrupted_run_without_report_retries_without_cleanup(self):
        self.tick()
        receipt = self.github.finish()
        receipt['report'] = None
        receipt['run']['conclusion'] = 'cancelled'
        self.tick()
        self.assertFalse(self.drive.moves)
        self.assertFalse(self.drive.trashes)
        self.assertEqual(self.github.writes, 2)
        self.assertEqual(len(list(self.github.queues.values())[-1]['items']), 5)
        self.github.finish()
        self.tick()
        self.assertEqual(self.report()['status'], 'completed')
        self.assertEqual(len(self.drive.copies), 5)

    def test_wrong_receipt_cannot_move_anything(self):
        self.tick()
        receipt = self.github.finish()
        pristine = copy.deepcopy(receipt)
        corruptions = [lambda r: r['run'].update(head_sha='0' * 40),
                       lambda r: r['run'].update(head_branch='untrusted'),
                       lambda r: r['run'].update(path='.github/workflows/other.yml'),
                       lambda r: r['report'].update(run_id='wrong'),
                       lambda r: r['run'].update(run_attempt=2),
                       lambda r: r['report'].update(source_bucket_empty=False),
                       lambda r: r['report']['items'][0]['request'].update(target_key='wrong'),
                       lambda r: r['report']['items'][0]['publication'].update(target_id='wrong'),
                       lambda r: r['report']['items'].pop()]
        for corrupt in corruptions:
            r = copy.deepcopy(pristine)
            corrupt(r)
            self.github.finished[list(self.github.queues)[0]] = r
            self.tick()
            self.assertFalse(self.drive.moves)
            self.assertFalse(self.drive.trashes)
            self.assertEqual(self.report()['counts']['activated_references'], 0)

    def test_bounded_automatic_retries_preserve_failure_and_do_not_spin(self):
        self.tick()
        for _ in range(3):
            self.github.finish(failed=range(5))
            self.tick()
        self.assertEqual(self.github.writes, 3)
        self.assertFalse(self.report()['automatic_retry_remaining'])
        self.assertFalse(self.drive.moves)
        self.assertFalse(self.drive.trashes)
        self.tick()
        self.assertEqual(self.github.writes, 3)

    def test_existing_archive_reused_only_after_matching_bytes_and_folder(self):
        row = self.value['items'][0]
        name = row['source_sha256'] + '.png'
        self.drive.add('existing-archive-0', name, self.drive.read(row['drive_file_id'], work.MAX_BYTES), ARCHIVE)
        self.tick()
        self.assertEqual(len(self.drive.copies), 4)
        self.assertEqual(self.github.writes, 1)

    def test_duplicate_archive_candidates_fail_closed(self):
        row = self.value['items'][0]
        for i in range(2):
            self.drive.add(f'existing-archive-{i}', row['source_sha256'] + '.png',
                           self.drive.read(row['drive_file_id'], work.MAX_BYTES), ARCHIVE)
        self.tick()
        self.assertEqual(self.github.writes, 0)
        self.assertFalse(self.drive.moves)
        self.assertFalse(self.drive.trashes)


class Contracts(unittest.TestCase):
    def test_batch_capacity_and_duplicate_identities(self):
        item = dict(kind='spell-cutout', target_key='test', target_id='test', drive_file_id='inbox-test-0',
                    source_sha256='a' * 64, visual_approved=True, source_revision='revision-1')
        for count in (1, 20, 100):
            value = dict(schema=4, mode='publish', complete=True, batch_id='capacity', expected_count=count,
                         items=[dict(item, target_key=f'test-{i}', target_id=f'test_{i}',
                                     drive_file_id=f'inbox-test-{i}') for i in range(count)])
            self.assertEqual(len(work.delivery(work.canonical(value).encode(), 'hermes4-capacity.ready.json')['items']), count)
        for mutate in (lambda v: v['items'].append(v['items'][0]),
                       lambda v: v['items'][1].update(drive_file_id=v['items'][0]['drive_file_id']),
                       lambda v: v['items'][1].update(target_id=v['items'][0]['target_id'])):
            candidate = copy.deepcopy(value)
            mutate(candidate)
            with self.assertRaises(ValueError):
                work.delivery(work.canonical(candidate).encode(), 'hermes4-capacity.ready.json')

    def test_json_discovery_uses_direct_folder_listing_and_fails_closed_at_bound(self):
        calls = []
        def call(name, **args):
            calls.append(name)
            if name == 'google_drive_list_folder':
                return dict(files=[dict(id='manifest-test', title='hermes4-test.ready.json', mime_type='application/json'),
                                   dict(id='image-test', title='test.png', mime_type='image/png')])
            return dict(id='manifest-test', title='hermes4-test.ready.json', mime_type='application/json',
                        size='100', parent_ids=[work.FOLDER])
        self.assertEqual([m['id'] for m in work.ConnectedDrive(call).list(work.FOLDER)], ['manifest-test'])
        self.assertNotIn('google_drive_search', calls)
        with self.assertRaisesRegex(ValueError, 'DRIVE_LIST_INCOMPLETE'):
            work.ConnectedDrive(lambda *a, **kw: dict(files=[{}] * 1000)).list(work.FOLDER)

    def test_only_the_existing_hermes_account_can_receive_reader_permission(self):
        calls = []
        def call(name, **args):
            calls.append((name, args))
            if name == 'google_drive_share_file':
                return {}
            return dict(permissions=[] if len(calls) == 1 else [dict(role='reader',
                        emailAddress=FOLDERS['safety']['service_account'])])
        work.ConnectedDrive(call).ensure_reader('synthetic-file')
        self.assertEqual(calls[1], ('google_drive_share_file', dict(url='https://drive.google.com/file/d/synthetic-file/view',
                         user_email=FOLDERS['safety']['service_account'], permission='reader')))
        with self.assertRaisesRegex(ValueError, 'HERMES_MUST_REMAIN_READ_ONLY'):
            work.ConnectedDrive(lambda *a, **kw: dict(permissions=[dict(role='writer',
                              emailAddress=FOLDERS['safety']['service_account'])])).ensure_reader('synthetic-file')

    def test_second_worker_is_locked_out(self):
        with tempfile.TemporaryDirectory() as folder:
            first = work.Ledger(Path(folder) / 'state.db')
            try:
                with self.assertRaises(BlockingIOError):
                    work.Ledger(Path(folder) / 'state.db')
            finally:
                first.close()

    def test_materialization_requires_local_bounded_file_never_downloads_a_url(self):
        for result in (dict(file_uri='https://signed.example/bytes'), {}, dict(file_uri='/missing')):
            with self.assertRaises(ValueError):
                work.materialized(result, 10)
        with tempfile.NamedTemporaryFile() as file:
            file.write(b'safe JSON')
            file.flush()
            self.assertEqual(work.materialized(dict(workspace_path=file.name), 10), b'safe JSON')
            with self.assertRaises(ValueError):
                work.materialized(dict(workspace_path=file.name), 3)

    def test_connector_move_preserves_unrelated_parents_and_reads_back(self):
        calls = []
        def call(name, **args):
            calls.append((name, args))
            if name == 'google_drive_get_file_metadata':
                return dict(id='synthetic-file', mime_type='image/png', title='test.png', size=100,
                            parent_ids=['inbox', 'unrelated'] if len(calls) == 1 else ['quarantine', 'unrelated'])
            return {}
        work.ConnectedDrive(call).move('synthetic-file', 'inbox', 'quarantine')
        self.assertEqual(calls[1], ('google_drive_update_file',
                                   dict(fileId='synthetic-file', addParents='quarantine', removeParents='inbox')))

    def test_github_adapter_reads_exact_zip_member_filters_workflow_and_measures_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('work-test-1.json/batch-report.json', json.dumps(dict(schema=4)))
            run = dict(id=12345678, path='.github/workflows/hermes-drive-intake.yml', status='completed',
                       run_started_at='2026-10-21T12:00:00Z', updated_at='2026-10-21T12:00:43Z')
            calls = []
            def call(name, **args):
                calls.append((name, args))
                if name == 'github_download_workflow_artifact':
                    return dict(workspace_path=str(path))
                url = args['url']
                if '/actions/runs?' in url:
                    data = dict(total_count=2, workflow_runs=[run, dict(run, path='.github/workflows/ci.yml')])
                elif '/jobs?' in url:
                    data = dict(total_count=1, jobs=[dict(completed_at='2026-10-21T12:00:42Z')])
                elif '/artifacts?' in url:
                    data = dict(total_count=1, artifacts=[dict(id=99, name='hermes4-batch-reports', expired=False)])
                else:
                    self.fail('Unsupported GitHub endpoint: ' + url)
                return dict(content=json.dumps(data))
            receipt = work.ConnectedGitHub(call).receipt('a' * 40, 'hermes/queue/work-test-1.json')
            self.assertEqual(receipt['duration_ms'], 42000)
            self.assertEqual(receipt['report'], dict(schema=4))
            self.assertTrue(calls[0][1]['url'].startswith('https://api.github.com/repos/' + work.REPO + '/actions/runs?'))
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('../work-test-1.json/batch-report.json', '{}')
            with self.assertRaisesRegex(ValueError, 'INVALID_BATCH_ARTIFACT'):
                work.ConnectedGitHub(call).receipt('a' * 40, 'hermes/queue/work-test-1.json')

    def test_secret_errors_are_not_written_to_reports(self):
        self.assertEqual(work.safe_error(RuntimeError('https://signed.example?token=secret')), 'EXTERNAL_OPERATION_FAILED')


if __name__ == '__main__':
    unittest.main()
