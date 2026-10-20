import hashlib
import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import hermes_drive_intake as intake


def source():
    image = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse((150, 150, 874, 874), fill=(150, 100, 30, 255))
    data = io.BytesIO()
    image.save(data, 'PNG')
    return data.getvalue()


class Hermes4Batch(unittest.TestCase):
    def setUp(self):
        self.raw = source()
        self.sha = hashlib.sha256(self.raw).hexdigest()
        self.items = [dict(kind='spell-cutout', target_key=f'test-{i}',
                           target_id=f'00000000-0000-4000-8000-{i:012d}',
                           drive_file_id=f'inbox-source-{i}', archive_file_id=f'archive-source-{i}',
                           source_sha256=self.sha, visual_approved=True) for i in range(5)]

    def batch(self, items=None, mode='publish'):
        return dict(schema=4, mode=mode, items=self.items if items is None else items)

    def execute(self, output, request=None, inbox=None, archive=None, workers=3):
        with patch.object(intake, 'google_file', side_effect=inbox or (lambda _: self.raw)), \
             patch.object(intake, 'drive_file', side_effect=archive or (lambda *_: self.raw)):
            return intake.run_batch(request or self.batch(), Path(output), workers)

    def published(self, output, assets):
        report = dict(source_bucket_empty=True, elapsed_seconds=0.1,
                      items=[dict(index=a['batch_index'], status='active', path='verified.webp') for a in assets])
        Path(output, 'publisher-report.json').write_text(json.dumps(report))

    def test_five_real_conversions_archives_and_one_combined_manifest(self):
        archive_reads = []
        def archive(file_id, folder):
            archive_reads.append((file_id, folder))
            return self.raw
        with tempfile.TemporaryDirectory() as output:
            result = self.execute(output, archive=archive)
            self.assertEqual(len(result['assets']), 5)
            self.assertEqual(len(archive_reads), 5)
            self.assertTrue(all(folder == '1FrKbSXLq1hp7eE6J6O-lrKeK3Vj5n-of' for _, folder in archive_reads))
            self.assertFalse(list(Path(output).rglob('*.png')))
            for asset in result['assets']:
                self.assertEqual(asset['source_path'], 'drive://' + asset['archive_file_id'])
                self.assertTrue(asset['archive_verified'])
                with Image.open(Path(output, asset['app_file'])) as webp:
                    self.assertEqual(webp.size, (640, 640))
                    self.assertEqual(webp.getchannel('A').getextrema(), (0, 255))
            self.published(output, result['assets'])
            self.assertTrue(intake.finalize_batch(Path(output)))
            self.assertEqual(json.loads(Path(output, 'batch-report.json').read_text())['succeeded'], 5)
            self.assertFalse(Path(output, 'retry-request.json').exists())

    def test_bad_original_among_five_does_not_stop_four_and_retry_downloads_only_one(self):
        def inbox(file_id):
            return b'corrupt image' if file_id == 'inbox-source-2' else self.raw
        with tempfile.TemporaryDirectory() as output, tempfile.TemporaryDirectory() as retry_output:
            result = self.execute(output, inbox=inbox)
            self.assertEqual(len(result['assets']), 4)
            self.published(output, result['assets'])
            self.assertFalse(intake.finalize_batch(Path(output)))
            retry = json.loads(Path(output, 'retry-request.json').read_text())
            self.assertEqual([i['target_key'] for i in retry['items']], ['test-2'])
            reads = []
            result = self.execute(retry_output, retry, inbox=lambda file_id: reads.append(file_id) or self.raw)
            self.assertEqual(reads, ['inbox-source-2'])
            self.assertEqual(len(result['assets']), 1)

    def test_corrupt_archive_or_wrong_source_hash_blocks_only_affected_item(self):
        def archive(file_id, folder):
            return self.raw + b'changed' if file_id == 'archive-source-1' else self.raw
        self.items[3]['source_sha256'] = '0' * 64
        with tempfile.TemporaryDirectory() as output:
            result = self.execute(output, archive=archive)
            self.assertEqual(len(result['assets']), 3)
            report = json.loads(Path(output, 'intake-report.json').read_text())
            self.assertEqual([x['stage'] for x in report['items'] if x['status'] == 'failed'], ['archive', 'validation'])

    def test_missing_archive_or_visual_approval_cannot_reach_converter(self):
        del self.items[0]['archive_file_id']
        self.items[1]['visual_approved'] = False
        with tempfile.TemporaryDirectory() as output:
            result = self.execute(output)
            self.assertEqual(len(result['assets']), 3)
            self.assertFalse(Path(output, 'spell-cutout/test-0').exists())
            self.assertFalse(Path(output, 'spell-cutout/test-1').exists())

    def test_interrupted_publication_is_red_and_retries_every_unconfirmed_item(self):
        with tempfile.TemporaryDirectory() as output:
            self.execute(output)
            self.assertFalse(intake.finalize_batch(Path(output)))
            retry = json.loads(Path(output, 'retry-request.json').read_text())
            self.assertEqual(len(retry['items']), 5)

    def test_failed_publication_is_in_retry_and_successes_are_omitted(self):
        with tempfile.TemporaryDirectory() as output:
            result = self.execute(output)
            self.published(output, result['assets'])
            path = Path(output, 'publisher-report.json')
            report = json.loads(path.read_text())
            report['items'][4].update(status='failed', error='STORAGE_READBACK_FAILED')
            path.write_text(json.dumps(report))
            self.assertFalse(intake.finalize_batch(Path(output)))
            retry = json.loads(Path(output, 'retry-request.json').read_text())
            self.assertEqual([i['target_key'] for i in retry['items']], ['test-4'])

    def test_work_manifest_maps_inbox_archive_uuid_and_hash_and_requires_explicit_mode(self):
        request = dict(schema_version='1.0', records=[dict(image_type='spell-cutout',
                       spell_key='test-0', spell_id=self.items[0]['target_id'],
                       inbox_file_id='inbox-source-0', drive_file_id='archive-source-0',
                       sha256=self.sha, quality_status='approved')])
        with self.assertRaisesRegex(ValueError, 'BATCH_MODE_REQUIRED'):
            intake.batch_request(request)
        request['mode'] = 'publish'
        self.assertEqual(intake.batch_request(request)['items'][0], self.items[0])

    def test_limits_duplicates_and_untrusted_queue_fail_before_reads(self):
        with patch.object(intake, 'google_file') as fetch:
            for items in ([], self.items * 21, [self.items[0], self.items[0]]):
                with self.assertRaises(ValueError):
                    intake.batch_request(self.batch(items))
            fetch.assert_not_called()
        with tempfile.TemporaryDirectory() as output:
            with self.assertRaisesRegex(ValueError, 'UNTRUSTED_GITHUB_CONTEXT'):
                intake.run('hermes/queue/five.json', Path(output))

    def test_verify_mode_has_no_archive_or_webp_writes(self):
        with tempfile.TemporaryDirectory() as output, patch.object(intake, 'drive_file') as archive:
            with patch.object(intake, 'google_file', return_value=self.raw):
                result = intake.run_batch(self.batch(mode='verify'), Path(output))
            archive.assert_not_called()
            self.assertEqual(result['assets'], [])
            self.assertFalse(list(Path(output).rglob('*.webp')))
            self.assertTrue(intake.finalize_batch(Path(output)))

    def test_three_workers_overlap_io_with_one_shared_batch_context(self):
        lock = threading.Lock()
        active = peak = 0
        def inbox(_):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.03)
            with lock:
                active -= 1
            return self.raw
        with tempfile.TemporaryDirectory() as output:
            self.execute(output, self.batch(mode='verify'), inbox=inbox)
        self.assertGreater(peak, 1)
        self.assertLessEqual(peak, 3)

    def test_archive_read_requires_correct_folder_and_reuses_the_same_token_for_bytes(self):
        metadata = dict(mimeType='image/png', size=str(len(self.raw)), parents=['required-archive'])
        with patch.dict(os.environ, {'GOOGLE_ACCESS_TOKEN': 'test-only-token'}), \
             patch.object(intake, 'api', side_effect=[(200, json.dumps(metadata).encode()), (200, self.raw)]) as api:
            self.assertEqual(intake.drive_file('archive-source-0', 'required-archive'), self.raw)
            self.assertEqual([call.args[1] for call in api.call_args_list], ['test-only-token'] * 2)
        metadata['parents'] = ['wrong-folder']
        with patch.dict(os.environ, {'GOOGLE_ACCESS_TOKEN': 'test-only-token'}), \
             patch.object(intake, 'api', return_value=(200, json.dumps(metadata).encode())) as api:
            with self.assertRaisesRegex(ValueError, 'FILE_NOT_IN_REQUIRED_HERMES_FOLDER'):
                intake.drive_file('archive-source-0', 'required-archive')
            self.assertEqual(api.call_count, 1)

    def test_archive_permission_denial_is_reported_per_image(self):
        def archive(file_id, folder):
            if file_id == 'archive-source-3':
                raise RuntimeError('HTTP_403 GET /drive/v3/files/archive-source-3')
            return self.raw
        with tempfile.TemporaryDirectory() as output:
            result = self.execute(output, archive=archive)
            self.assertEqual(len(result['assets']), 4)
            report = json.loads(Path(output, 'intake-report.json').read_text())
            self.assertEqual(report['items'][3]['stage'], 'archive')
            self.assertIn('HTTP_403', report['items'][3]['error'])


if __name__ == '__main__':
    unittest.main()
