import hashlib
import io
import sys
from pathlib import Path
import unittest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import skylla_display_verify as d


class DisplayTests(unittest.TestCase):
    def fixture(self):
        stream = io.BytesIO()
        Image.new('RGBA', (8, 8), (40, 80, 120, 128)).save(stream, 'WEBP', lossless=True)
        raw = stream.getvalue()
        entry = {'size_bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                 'source_object_path': 'synthetic-source', 'bucket': 'alea-spell-art',
                 'path': 'spell/synthetic/image.webp'}
        return raw, entry

    def test_full_synthetic_webp_is_decoded_and_read_only(self):
        raw, entry = self.fixture()
        proof = d.verify_image(raw, entry)
        self.assertTrue(proof['complete_decode'])
        self.assertEqual(proof['width'], 8)
        self.assertFalse(proof['safe_to_delete'])

    def test_truncated_altered_and_wrong_container_fail(self):
        raw, entry = self.fixture()
        for data in (raw[:-1], raw[:-5], b'garbage', raw+b'extra'):
            with self.assertRaises(d.access.s.k.Blocked): d.verify_image(data, entry)
        wrong = {**entry, 'sha256': '0'*64}
        with self.assertRaises(d.access.s.k.Blocked): d.verify_image(raw, wrong)

    def test_corrupt_payload_with_matching_hash_cannot_pass_full_decode(self):
        raw, entry = self.fixture()
        bad = raw[:12] + b'corrupt!' + raw[20:]
        entry.update({'sha256': hashlib.sha256(bad).hexdigest(), 'size_bytes': len(bad)})
        with self.assertRaises(d.access.s.k.Blocked): d.verify_image(bad, entry)


if __name__ == '__main__': unittest.main()
