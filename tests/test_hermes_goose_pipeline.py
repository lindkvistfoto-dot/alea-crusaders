"""GOOSE artwork pipeline must be isolated from existing UI/spell HERMES targets."""
import hashlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image

REPO_ROOT=Path(__file__).resolve().parents[1]

def load_module(name, relative_path):
    spec=importlib.util.spec_from_file_location(name,REPO_ROOT/relative_path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class GoosePipelineTests(unittest.TestCase):
    def test_exact_alpha_and_dimensions_in_drive_intake(self):
        intake=load_module('goose_drive','scripts/hermes_drive_intake.py')
        for key,dimensions in (
            ('arcane-gallery-goose-left',(724,1086)),
            ('arcane-gallery-goose-right',(724,1086)),
            ('arcane-gallery-goose-seal',(515,527))
        ):
            image=Image.new('RGBA',dimensions,(77,54,32,255))
            image.putpixel((0,0),(0,0,0,0))
            raw=io.BytesIO()
            image.save(raw,'PNG')
            self.assertEqual(intake.validate_png(raw.getvalue(),'ui',key),
                             hashlib.sha256(raw.getvalue()).hexdigest())
            with self.assertRaises(ValueError):
                intake.validate_png(raw.getvalue(),'ui','arcane-gallery-overlay')
        self.assertTrue({'arcane-gallery-overlay','arcane-mechanism-link','arcane-mechanism-chamber'}.issubset(intake.UI_TARGETS))
    def test_lossy_webp_keeps_precise_alpha_and_local_output_directory(self):
        pipeline=load_module('goose_prepare','scripts/hermes_ui_prepare.py')
        with tempfile.TemporaryDirectory(prefix='goose-hermes-') as d:
            home=Path(d)
            pipeline.ROOT=home
            pipeline.SOURCES=home/'assets/hermes/originals/ui'
            for key,size in pipeline.GOOSE_SIZES.items():
                image=Image.new('RGBA',size,(84,52,29,255))
                image.putpixel((0,0),(0,0,0,0))
                image.putpixel((size[0]//2,size[1]//2),(0,130,230,128))
                blob=io.BytesIO()
                image.save(blob,'PNG')
                raw=blob.getvalue()
                src='assets/hermes/originals/ui/'+key+'/'+hashlib.sha256(raw).hexdigest()+'.png'
                file=home/src
                file.parent.mkdir(parents=True,exist_ok=True)
                file.write_bytes(raw)
                webp,meta=pipeline.prepare(src)
                self.assertEqual(webp,'features/material/goose04/'+key.removeprefix('arcane-gallery-goose-')+'.webp')
                self.assertTrue((home/meta).is_file())
                with Image.open(home/webp) as rendered:
                    self.assertEqual(rendered.size,size)
                    self.assertEqual(rendered.convert('RGBA').getchannel('A').tobytes(),
                                     image.getchannel('A').tobytes())
    def test_out_of_scope_png_denied(self):
        intake=load_module('goose_drive','scripts/hermes_drive_intake.py')
        image=Image.new('RGBA',(724,900),(200,120,0,255))
        image.putpixel((0,0),(0,0,0,0))
        out=io.BytesIO();image.save(out,'PNG')
        with self.assertRaises(ValueError):
            intake.validate_png(out.getvalue(),'ui','arcane-gallery-goose-left')

if __name__=='__main__':
    unittest.main()
