import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name, ROOT/'scripts'/f'{name}.py')
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value
prepare=module('hermes2_prepare')
intake=module('hermes_drive_intake')

def png(size, mode='RGB', color=None):
    im=Image.new(mode,size,color or ((80,100,70,255) if mode=='RGBA' else (80,100,70)))
    out=io.BytesIO();im.save(out,'PNG');return out.getvalue()

class WidePipeline(unittest.TestCase):
    def test_accepts_native_rounding_and_preserves_full_dimensions(self):
        data=png((1672,941))
        digest=intake.validate_png(data,'skill-illustration-wide','forsta-hjalpen')
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory); previous=prepare.ROOT
            prepare.ROOT=base/'originals'
            try:
                source=prepare.ROOT/'skill-illustration-wide'/'forsta-hjalpen'/(digest+'.png')
                source.parent.mkdir(parents=True);source.write_bytes(data)
                m=prepare.prepare(source,base/'out')
                self.assertEqual((m['width'],m['height']),(1672,941))
                self.assertFalse(m['alpha_preserved'])
                with Image.open(base/'out'/m['app_file']) as result:
                    self.assertEqual(result.size,(1672,941))
                self.assertEqual(source.read_bytes(),data)
            finally: prepare.ROOT=previous
    def test_rejects_square_portrait_and_transparent_wide(self):
        for data in (png((640,640)),png((941,1672)),png((1672,941),'RGBA',(80,100,70,0))):
            with self.assertRaises(ValueError):
                intake.validate_png(data,'skill-illustration-wide','forsta-hjalpen')
    def test_square_illustration_profile_unchanged(self):
        intake.validate_png(png((640,640)),'skill-illustration','geografi')
        with self.assertRaises(ValueError):
            intake.validate_png(png((1672,941)),'skill-illustration','geografi')
    def test_content_address_rejects_corruption(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);previous=prepare.ROOT;prepare.ROOT=base
            try:
                source=base/'skill-illustration-wide'/'forsta-hjalpen'/('0'*64+'.png')
                source.parent.mkdir(parents=True);source.write_bytes(png((1672,941)))
                with self.assertRaisesRegex(ValueError,'SHA-256'):
                    prepare.prepare(source,base/'out')
            finally:prepare.ROOT=previous
if __name__=='__main__':unittest.main()
