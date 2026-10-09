"""Import CC0 Cethiel Weapon Slash effect as reproducible six-frame PNG strips.

The SHA256-pinned archive is downloadable from OpenGameArt. Run this script
locally with --source-zip or in GitHub Actions to generate the 20 atlas PNGs.
"""
from __future__ import annotations
import argparse
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen
from zipfile import ZipFile
from PIL import Image

SOURCE_URL = 'https://opengameart.org/sites/default/files/Everything_0.zip'
SOURCE_SHA256 = '163eb4e4d41385f3b888e7176c6da077d0e7fa7c101da96bbaa4645a2ec9d673'
WIDTH, HEIGHT, FRAMES = 126, 150, 6
VARIANTS = (
 ('classic','Classic','Classic'),
 ('purple','Alternative 1','Alternative_1'),
 ('blue','Alternative 2','Alternative_2'),
 ('fire','Alternative 3','Alternative_3'),
)

def build(zip_path: Path, dest: Path) -> None:
 raw = zip_path.read_bytes()
 actual = sha256(raw).hexdigest()
 if actual != SOURCE_SHA256:
  raise ValueError(f'Original ZIP failed SHA256 verification: {actual}')
 dest.mkdir(parents=True, exist_ok=True)
 with ZipFile(BytesIO(raw)) as archive:
  for style, folder, prefix in VARIANTS:
   for group in range(1, 6):
    strip = Image.new('RGBA', (WIDTH*FRAMES, HEIGHT))
    for frame in range(FRAMES):
     ordinal = (group-1)*FRAMES+frame+1
     member = f'{folder}/{group}/{prefix}_{ordinal:02d}.png'
     with archive.open(member) as inp:
      img = Image.open(inp).convert('RGBA')
      if img.height!=HEIGHT or img.width>WIDTH:
       raise ValueError(f'{member} wrong size {img.size}')
      strip.paste(img, (frame*WIDTH+(WIDTH-img.width)//2, 0))
    dest.joinpath(f'{style}-slash-{group}.png').parent.mkdir(parents=True,exist_ok=True)
    strip.save(dest/f'{style}-slash-{group}.png', optimize=True)
 files = list(dest.glob('*-slash-*.png'))
 if len(files)!=20:
  raise ValueError('Expected exactly 20 animation strips; got '+str(len(files)))
 (dest/'CREDITS.md').write_text(
  '# Weapon Slash – Effect\n\n'
  'Created by **Cethiel**. Source: https://opengameart.org/content/weapon-slash-effect\n\n'
  'License: **CC0 1.0 Universal** https://creativecommons.org/publicdomain/zero/1.0/\n\n'
  f'Original ZIP: {SOURCE_URL}\nSHA-256: {SOURCE_SHA256}\n\n'
  '20 six-frame RGBA PNG sprite strips, 126×150 px per frame; 90 ms per frame.\n',
  encoding='utf-8')
 print(f'Generated {len(files)} CC0 sprites ({sum(f.stat().st_size for f in files)} bytes).')

def main() -> None:
 parser=argparse.ArgumentParser()
 parser.add_argument('--source-zip',type=Path)
 parser.add_argument('--destination',type=Path,default=Path('assets/combat/slashes'))
 args=parser.parse_args()
 if args.source_zip:
  build(args.source_zip,args.destination)
  return
 request=Request(SOURCE_URL,headers={'User-Agent':'AleaCrusaders/1.0 CC0 import'})
 with urlopen(request,timeout=90) as response:
  payload=response.read(12_000_000)
 with TemporaryDirectory() as tmp:
  zip_path=Path(tmp)/'Everything.zip'
  zip_path.write_bytes(payload)
  build(zip_path,args.destination)

if __name__=='__main__':
 main()
