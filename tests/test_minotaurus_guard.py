import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GUARD=Path(__file__).resolve().parents[1]/'scripts/minotaurus_guard.py'

class OriginalRegressionGuard(unittest.TestCase):
    def test_rejects_new_pngs_and_allows_existing_pngs_and_webp_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            def git(*args):return subprocess.check_output(['git',*args],cwd=directory,stderr=subprocess.DEVNULL).decode().strip()
            def commit():
                git('add','-A');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','test');return git('rev-parse','HEAD')
            git('init','-q')
            Path(directory,'old.png').write_bytes(b'old original already present');base=commit()
            Path(directory,'app.webp').write_bytes(b'display');ok=commit()
            result=subprocess.run([sys.executable,str(GUARD),base,ok],cwd=directory,capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
            Path(directory,'new.png').write_bytes(b'new original');bad=commit()
            self.assertNotEqual(subprocess.run([sys.executable,str(GUARD),base,bad],cwd=directory,capture_output=True).returncode,0)

    def test_rejects_restored_original_tree_and_accepts_its_deletion(self):
        with tempfile.TemporaryDirectory() as directory:
            def git(*args):return subprocess.check_output(['git',*args],cwd=directory,stderr=subprocess.DEVNULL).decode().strip()
            def commit():
                git('add','-A');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','test');return git('rev-parse','HEAD')
            git('init','-q');p=Path(directory,'hermes/quarantine/file.bin');p.parent.mkdir(parents=True);p.write_bytes(b'original');base=commit()
            self.assertNotEqual(subprocess.run([sys.executable,str(GUARD),base,base],cwd=directory,capture_output=True).returncode,0)
            p.unlink();Path(directory,'app.webp').write_bytes(b'display');after=commit()
            self.assertEqual(subprocess.run([sys.executable,str(GUARD),base,after],cwd=directory,capture_output=True).returncode,0)

if __name__=='__main__':unittest.main()
