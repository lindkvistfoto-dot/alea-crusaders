#!/usr/bin/env python3
"""Turn Chrome-captured *real browser frames* into an inspectable mobile GIF."""
from pathlib import Path
from PIL import Image

source=Path("tests/visual-regressions/arcane-morph-frames")
target=Path("tests/visual-regressions/arcane-morph-animation.gif")
paths=sorted(source.glob("*.png"))
if len(paths)<30:
    raise ValueError(f"too few visual animation frames: {len(paths)}")
images=[]
for path in paths:
    with Image.open(path) as frame:
        rgb=frame.convert("RGB")
        resized=rgb.resize((400,750),Image.Resampling.LANCZOS)
        images.append(resized.quantize(colors=96,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE))
target.parent.mkdir(parents=True,exist_ok=True)
images[0].save(target,save_all=True,append_images=images[1:],
              duration=90,loop=0,disposal=2,optimize=True)
with Image.open(target) as check:
    count=getattr(check,"n_frames",0)
    if count<30 or check.size!=(400,750):
        raise ValueError(f"bad animation: {count} frames, size {check.size}")
print("ARCANE_ANIMATION_GIF_READY",target,count,target.stat().st_size)
