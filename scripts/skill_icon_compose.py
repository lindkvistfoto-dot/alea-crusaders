#!/usr/bin/env python3
"""Produce skill icons without ever regenerating the approved Klättra frame.

This script handles *geometry* and byte-integrity. A human/vision review must separately
confirm that the artwork depicts the named skill and contains no pre-existing frame.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops

MIN_SOURCE_EDGE = 640

def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def opening_mask(frame):
    """Flood-fill the *central* transparent component; never include the exterior."""
    width, height = frame.size
    transparency = frame.getchannel('A').point(lambda v: 255 if v <= 5 else 0)
    if transparency.getpixel((width//2,height//2)) != 255:
        raise ValueError('Frame center must be transparent')
    ImageDraw.floodfill(transparency, (width//2,height//2), 127, thresh=0)
    inner = transparency.point(lambda v: 255 if v == 127 else 0)
    if inner.getpixel((0,0)) != 0 or inner.getpixel((width//2,height//2)) != 255:
        raise ValueError('Master frame inner opening connects to exterior')
    return inner.filter(ImageFilter.MaxFilter(7))  # 3 px under the opaque rim

def compose(frame_path, scene_path, output_path, crop=None, draft=False):
    frame_path,scene_path,output_path = map(Path,(frame_path,scene_path,output_path))
    frame=Image.open(frame_path).convert('RGBA')
    if frame.size != (1254,1254):
        raise ValueError('This locked master is 1254×1254; do not rescale the frame')
    with Image.open(scene_path) as opened:
        source = opened.copy()
    if crop:
        if len(crop) != 4:
            raise ValueError('Crop must specify four integers')
        l,t,r,b=crop
        if not(0<=l<r<=source.width and 0<=t<b<=source.height):
            raise ValueError('Crop outside source image')
        source=source.crop(crop)
    w,h=source.size
    if w!=h:
        raise ValueError('Scene must be square; crop square without distorting artwork')
    if min(w,h)<MIN_SOURCE_EDGE and not draft:
        raise ValueError(f'REJECTED: intrinsic scene only {w}x{h}; require >=640x640 (use --draft for PREVIEW only)')
    mask=opening_mask(frame)
    scene=source.convert('RGB').resize(frame.size,Image.Resampling.LANCZOS).convert('RGBA')
    scene.putalpha(mask)
    result=Image.alpha_composite(scene,frame)
    if result.getpixel((0,0))[3] or result.getpixel((1253,1253))[3]:
        raise AssertionError('Exterior must be transparent')
    # Opaque original frame pixels must have identical RGBA in the output.
    opaque = frame.getchannel('A').point(lambda a: 255 if a == 255 else 0)
    transparent = Image.new('RGBA',frame.size,(0,0,0,0))
    original_opaque = Image.composite(frame,transparent,opaque)
    final_opaque = Image.composite(result,transparent,opaque)
    if ImageChops.difference(original_opaque,final_opaque).getbbox():
        raise AssertionError('An opaque master frame pixel was altered')
    output_path.parent.mkdir(parents=True,exist_ok=True)
    result.save(output_path,format='PNG',compress_level=3)
    info={
        'skill':output_path.stem,'state':'DRAFT_DO_NOT_PUBLISH' if draft else 'TECHNICALLY_VALID_NEEDS_VISUAL_REVIEW',
        'source_path':str(scene_path),'source_sha256':sha256(scene_path),
        'master_path':str(frame_path),'master_sha256':sha256(frame_path),
        'intrinsic_scene_pixels':[w,h], 'output_path':str(output_path),
        'output_sha256':sha256(output_path),'dimensions':[1254,1254],
        'requires_visual_approval':True,
    }
    output_path.with_suffix('.qa.json').write_text(json.dumps(info,indent=2,ensure_ascii=False)+'\n')
    return info

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--frame',required=True);p.add_argument('--scene',required=True);p.add_argument('--output',required=True)
    p.add_argument('--crop',type=lambda s:tuple(map(int,s.split(','))),help='Scene source crop: left,top,right,bottom')
    p.add_argument('--draft',action='store_true',help='Allow low-resolution *previews*, explicitly not publishable')
    a=p.parse_args()
    print(json.dumps(compose(a.frame,a.scene,a.output,a.crop,a.draft),ensure_ascii=False,indent=2))
