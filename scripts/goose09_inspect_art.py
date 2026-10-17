from PIL import Image, ImageDraw
from pathlib import Path
from io import BytesIO
import base64
root=Path('features/material/goose04')
files=['left.webp','right.webp','seal.webp']
bg=Image.new('RGB',(1050,610),(29,26,22))
d=ImageDraw.Draw(bg)
for i,name in enumerate(files):
 img=Image.open(root/name).convert('RGBA')
 if name=='seal.webp': size=(330,338); pos=(710,86)
 else: size=(340,510);pos=(i*350+10,55)
 tile=Image.new('RGBA',size,(23,22,18,255))
 tile.alpha_composite(img.resize(size,Image.Resampling.LANCZOS))
 bg.paste(tile.convert('RGB'),pos)
 d.text((pos[0]+12,25),name,fill=(235,205,139))
 w,h=img.size
 px=img.load()
 blue=[]
 for y in range(h):
  for x in range(w):
   r,g,b,a=px[x,y]
   if a>100 and b>g*1.05 and b>r*1.08 and b>55:
    blue.append((x,y))
 if blue:
  print('GOOSE09_BLUE_PIXELS',name,len(blue),'bbox',[min(p[0] for p in blue),min(p[1] for p in blue),max(p[0] for p in blue),max(p[1] for p in blue)])
 else:print('GOOSE09_BLUE_PIXELS',name,0)
buf=BytesIO()
bg.save(buf,format='JPEG',quality=67,optimize=True)
print('GOOSE09_ART_SHEET_BASE64='+base64.b64encode(buf.getvalue()).decode('ascii'))
