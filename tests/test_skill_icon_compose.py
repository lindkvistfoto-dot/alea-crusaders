import sys, tempfile, unittest
from pathlib import Path
from PIL import Image,ImageDraw
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
from skill_icon_compose import compose, opening_mask

FRAME=Path(__file__).resolve().parents[1] / 'assets/skill-icons/klattra-frame-master.png'

class TestSkillIconCompose(unittest.TestCase):
    def test_small_scene_fails_without_draft(self):
        with tempfile.TemporaryDirectory() as t:
            t=Path(t)
            Image.new('RGB',(220,220),'olive').save(t/'scene.png')
            with self.assertRaisesRegex(ValueError,'REJECTED'):
                compose(FRAME,t/'scene.png',t/'icon.png')
            self.assertFalse((t/'icon.png').exists())
    def test_master_unchanged_and_geometry(self):
        with tempfile.TemporaryDirectory() as t:
            t=Path(t)
            Image.new('RGB',(1024,1024),(70,130,200)).save(t/'scene.png')
            meta=compose(FRAME,t/'scene.png',t/'icon.png')
            im=Image.open(t/'icon.png').convert('RGBA')
            frm=Image.open(FRAME).convert('RGBA')
            self.assertEqual(im.getpixel((0,0))[3],0)
            self.assertEqual(im.getpixel((627,627)),(70,130,200,255))
            for xy in [(627,5),(627,40),(85,625),(1150,625),(627,1180)]:
                if frm.getpixel(xy)[3]==255: self.assertEqual(im.getpixel(xy),frm.getpixel(xy))
            self.assertEqual(meta['state'],'TECHNICALLY_VALID_NEEDS_VISUAL_REVIEW')
    def test_separate_draft_status(self):
        with tempfile.TemporaryDirectory() as t:
            t=Path(t)
            Image.new('RGB',(200,200),'green').save(t/'scene.png')
            meta=compose(FRAME,t/'scene.png',t/'icon.png',draft=True)
            self.assertEqual(meta['state'],'DRAFT_DO_NOT_PUBLISH')
if __name__=='__main__':unittest.main()
