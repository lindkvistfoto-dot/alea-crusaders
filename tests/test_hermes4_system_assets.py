import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import hermes_drive_intake as intake
from hermes_system_assets import PROFILE


def png(size, high=255, mode='RGBA'):
    im = Image.new('RGBA', size)
    ImageDraw.Draw(im).ellipse((100, 100, size[0]-100, size[1]-100), fill=(171, 130, 81, high))
    if mode != 'RGBA':
        im = im.convert(mode)
    out = io.BytesIO()
    im.save(out, 'PNG')
    return out.getvalue()


class SystemAssets(unittest.TestCase):
    def setUp(self):
        self.items, self.sources = [], {}
        for i, (key, profile) in enumerate(PROFILE['assets'].items()):
            raw = png(tuple(profile['source_size']), 254 if i == 0 else 255)
            self.sources['inbox-system-'+str(i)] = raw
            self.sources['archive-system-'+str(i)] = raw
            self.items.append(dict(kind='system-asset', target_key=key, target_id=profile['id'],
                drive_file_id='inbox-system-'+str(i), archive_file_id='archive-system-'+str(i),
                source_sha256=hashlib.sha256(raw).hexdigest(), visual_approved=True))

    def execute(self, output):
        def archived(file_id, folder):
            key = self.items[int(file_id[-1])]['target_key']
            self.assertEqual(folder, PROFILE['assets'][key]['archive_folder_id'])
            return self.sources[file_id]
        with patch.object(intake, 'google_file', side_effect=self.sources.__getitem__), \
             patch.object(intake, 'drive_file', side_effect=archived):
            return intake.run_batch(dict(schema=4, mode='publish', items=self.items), Path(output))

    def test_two_profiles_preserve_aspect_and_every_resized_alpha_pixel(self):
        with tempfile.TemporaryDirectory() as output, tempfile.TemporaryDirectory() as again:
            first = self.execute(output)['assets']
            second = self.execute(again)['assets']
            self.assertEqual(len(first), 2)
            self.assertEqual([x['app_sha256'] for x in first], [x['app_sha256'] for x in second])
            for a in first:
                profile = PROFILE['assets'][a['target_key']]
                self.assertTrue(a['archive_verified'])
                self.assertTrue(a['alpha_preserved'])
                self.assertLessEqual(a['app_bytes'], 500000)
                with Image.open(io.BytesIO(self.sources['inbox-system-'+str(a['batch_index'])])) as original:
                    original.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                    with Image.open(Path(output, a['app_file'])) as webp:
                        self.assertEqual(list(webp.size), profile['display_size'])
                        self.assertEqual(webp.getchannel('A').tobytes(), original.getchannel('A').tobytes())
            self.assertFalse(list(Path(output).rglob('*.png')))

    def test_bad_archive_is_isolated_and_cannot_become_publication_input(self):
        self.sources['archive-system-0'] += b'changed'
        with tempfile.TemporaryDirectory() as output:
            assets = self.execute(output)['assets']
            self.assertEqual([a['batch_index'] for a in assets], [1])
            report = json.loads(Path(output, 'intake-report.json').read_text())
            self.assertEqual(report['items'][0]['error'], 'DRIVE_ARCHIVE_SHA256_MISMATCH')

    def test_allowlist_and_pinned_id_fail_before_fetch(self):
        for key, target_id in [('unknown', self.items[0]['target_id']),
                               (self.items[0]['target_key'], self.items[1]['target_id'])]:
            with self.assertRaises(ValueError):
                intake.validate_batch_item(dict(self.items[0], target_key=key, target_id=target_id))

    def test_rejects_wrong_dimensions_opaque_empty_and_rgb_sources(self):
        key = self.items[0]['target_key']
        for raw in [png((1024, 1024)), png((1220, 811), mode='RGB'), png((1220, 811), high=0)]:
            with self.assertRaises(ValueError):
                intake.validate_png(raw, 'system-asset', key)
        image = Image.new('RGBA', (1220, 811), (1, 2, 3, 255))
        out = io.BytesIO(); image.save(out, 'PNG')
        with self.assertRaisesRegex(ValueError, 'TRUE_ALPHA'):
            intake.validate_png(out.getvalue(), 'system-asset', key)

if __name__ == '__main__':
    unittest.main()
