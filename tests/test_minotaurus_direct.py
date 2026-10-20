import hashlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import hermes_drive_intake as intake
import hermes2_prepare as prepare


def png(kind='symbol'):
    size=(1280,720) if 'wide' in kind else (1024,1024)
    if 'illustration' in kind:
        image=Image.new('RGB',size,(180,120,40))
    else:
        image=Image.new('RGBA',size,(180,120,40,255));image.putpixel((0,0),(0,0,0,0))
    buf=io.BytesIO();image.save(buf,'PNG');return buf.getvalue()


class DirectPipeline(unittest.TestCase):
    def test_all_eight_profiles_convert_from_memory_without_original_output(self):
        for kind in ['spell','symbol','skill','spell-cutout','skill-illustration',
                     'skill-illustration-wide','spell-illustration','spell-illustration-wide']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                raw=png(kind);sha=hashlib.sha256(raw).hexdigest()
                result=prepare.prepare_bytes(raw,kind,'verified-target',sha,Path(directory),'drive://verified-source-id')
                self.assertFalse(list(Path(directory).rglob('*.png')))
                output=Path(directory)/result['app_file']
                self.assertEqual(hashlib.sha256(output.read_bytes()).hexdigest(),result['app_sha256'])
                with Image.open(output) as image:
                    image.load();self.assertEqual(image.format,'WEBP')
                self.assertEqual(result['source_sha256'],sha)

    def test_queue_pilot_fetches_exact_drive_id_and_writes_only_webp_and_metadata(self):
        raw=png();sha=hashlib.sha256(raw).hexdigest()
        with tempfile.TemporaryDirectory() as checkout, tempfile.TemporaryDirectory() as output:
            queue=Path(checkout)/'hermes/queue/pilot.json';queue.parent.mkdir(parents=True)
            request=dict(schema=1,kind='symbol',target_key='stopp',drive_file_id='verified-source-id',source_sha256=sha,mode='pilot')
            queue.write_text(json.dumps(request))
            with patch.dict(os.environ,{'GITHUB_REPOSITORY':intake.REPO,'GITHUB_REF':'refs/heads/main'}),patch.object(Path,'cwd',return_value=Path(checkout)),patch.object(intake,'google_file',return_value=raw) as fetch:
                manifest=intake.run('hermes/queue/pilot.json',Path(output))
                fetch.assert_called_once_with('verified-source-id')
                self.assertEqual(manifest['publication_mode'],'pilot')
                self.assertEqual(manifest['assets'][0]['source_path'],'drive://verified-source-id')
                self.assertEqual(list(Path(checkout).rglob('*.png')),[])
                self.assertEqual(list(Path(output).rglob('*.png')),[])
                request['source_sha256']='0'*64;queue.write_text(json.dumps(request))
                with self.assertRaisesRegex(ValueError,'SHA256_MISMATCH'):
                    intake.run('hermes/queue/pilot.json',Path(output))
                request['kind']='ui';queue.write_text(json.dumps(request))
                with self.assertRaisesRegex(ValueError,'UI_PUBLICATION_RETIRED'):
                    intake.run('hermes/queue/pilot.json',Path(output))
                request['kind']='symbol';del request['source_sha256'];queue.write_text(json.dumps(request))
                with self.assertRaisesRegex(ValueError,'PINNED_SOURCE_SHA256_REQUIRED'):
                    intake.run('hermes/queue/pilot.json',Path(output))

    def test_invalid_hash_and_corrupt_png_fail_before_output(self):
        for raw,digest in [(png(),'0'*64),(b'\x89PNG\r\n\x1a\n'+b'broken'*30,None)]:
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(Exception):
                    prepare.prepare_bytes(raw,'symbol','stopp',digest or hashlib.sha256(raw).hexdigest(),Path(directory),'drive://verified-source-id')
                self.assertEqual(list(Path(directory).rglob('*')),[])

if __name__=='__main__':unittest.main()
