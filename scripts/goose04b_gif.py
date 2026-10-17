"""Build a small real-Chromium animated visual acceptance clip (synthetic media only)."""
from pathlib import Path
from PIL import Image
root=Path("tests/visual-regressions/goose04b")
files=sorted((root/"frames").glob("*.png"))
assert len(files)>=20, f"missing animation frames: {len(files)}"
frames=[]
for file in files:
    with Image.open(file) as raw:
        # Crop to the actual gate: high resolution and no giant empty desktop margins.
        image=raw.convert("RGB").crop((155,85,845,775))
        image=image.resize((480,480),Image.Resampling.LANCZOS)
        frames.append(image.quantize(colors=96,method=Image.Quantize.MEDIANCUT))
output=root/"goose04b-ceremonial-opening.gif"
frames[0].save(output,save_all=True,append_images=frames[1:],
               duration=95,loop=0,disposal=2,optimize=True)
assert output.stat().st_size>50000, "empty GIF"
print("GOOSE_GIF_ACCEPTANCE",len(frames),output,output.stat().st_size)
