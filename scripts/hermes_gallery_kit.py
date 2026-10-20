#!/usr/bin/env python3
"""HERMES gallery-kit: verified Drive ZIP -> immutable GitHub source + lossless public sprites.
Restricted to the SISYPHUS preview branch. No database writes or production deployment.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from PIL import Image

REPO = "lindkvistfoto-dot/alea-crusaders"
BRANCH = "sisyphus/arcane-gallery-shared-mechanics-20261016"
TARGET = "arcane-gallery-kit"
DEST = "features/material/arcane-morphing-assets/v01"
EXPECTED = set("""
blue_gem_left blue_gem_right center_blue_gem gear_east gear_west large_blue_crystal
lower_frame piston_closed_a piston_closed_b piston_extended_a piston_extended_b
rune_bar_lower rune_bar_upper rune_tablet_vertical side_center_a side_center_b
side_center_c side_left_bottom side_left_inner side_left_middle side_left_outer
side_left_top side_right_bottom side_right_inner side_right_middle
side_right_outer side_right_top small_blue_crystal upper_frame
""".split())

def http(url, token, *, method="GET", body=None, limit=12000000):
    headers = {"Authorization": "Bearer " + token, "User-Agent": "Alea-HERMES-GalleryKit"}
    if "api.github.com" in url:
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    if body is not None:
        body = json.dumps(body, separators=(",", ":")).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=80) as response:
            data = response.read(limit + 1)
            if len(data) > limit:
                raise ValueError("HTTP_RESPONSE_TOO_LARGE")
            return json.loads(data) if "api.github.com" in url else data
    except urllib.error.HTTPError as exc:
        raise ValueError(f"HTTP_{exc.code} {method} {urllib.parse.urlsplit(url).path}") from None

def digest(data):
    return hashlib.sha256(data).hexdigest()

def blobsha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def main():
    if os.environ.get("GITHUB_REPOSITORY") != REPO or os.environ.get("GITHUB_REF") != "refs/heads/" + BRANCH:
        raise ValueError("UNTRUSTED_PREVIEW_BRANCH")
    queue_path = "hermes/gallery-queue/arcane-gallery-kit-v01.json"
    with open(queue_path, encoding="utf-8") as f:
        job = json.load(f)
    if set(job) != {"schema", "target_key", "drive_file_id", "sha256", "mode"} or (
        job["schema"] != 1 or job["target_key"] != TARGET or job["mode"] != "preview"
    ):
        raise ValueError("INVALID_GALLERY_KIT_JOB")
    file_id = job["drive_file_id"]
    if not isinstance(file_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{10,160}", file_id):
        raise ValueError("INVALID_DRIVE_FILE_ID")
    expected_sha = job["sha256"]
    if not isinstance(expected_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
        raise ValueError("INVALID_ZIP_SHA")
    # Original downloaded from the authorized Drive folder via HERMES 2.2,
    # then uploaded as a binary Git blob and checked against local git hash.
    # The sprite importer never needs Google credentials on a preview branch.
    immutable = f"assets/hermes/originals/ui/{TARGET}/{expected_sha}.zip"
    from pathlib import Path
    archive_path = Path(immutable)
    if not archive_path.is_file():
        raise ValueError("IMMUTABLE_GITHUB_SOURCE_NOT_FOUND")
    archive = archive_path.read_bytes()
    if not 10000 <= len(archive) <= 8_388_608 or digest(archive) != expected_sha:
        raise ValueError("SOURCE_HASH_MISMATCH")
    print("HERMES_GALLERY_SOURCE_VERIFIED", expected_sha, len(archive))
    source = io.BytesIO(archive)
    outputs = {}
    sprite_manifest = {"schema": 1, "kind": "ui", "target_key": TARGET,
                       "preview_only": True, "supabase_activation": False,
                       "original_path": f"assets/hermes/originals/ui/{TARGET}/{expected_sha}.zip",
                       "original_sha256": expected_sha, "sprites": {}}
    with zipfile.ZipFile(source) as z:
        infos = z.infolist()
        if any(info.file_size > 2_000_000 or info.compress_size > 2_000_000 or
               (not info.filename.startswith("arcane_morphing_frame/")) or
               ".." in info.filename or "\\" in info.filename
               for info in infos):
            raise ValueError("UNSAFE_ZIP_MEMBER")
        if sum(info.file_size for info in infos) > 17_000_000:
            raise ValueError("ZIP_DECOMPRESSION_LIMIT")
        names = {name.removeprefix("arcane_morphing_frame/") for name in z.namelist()
                 if name.endswith(".png")}
        if names != {n + ".png" for n in EXPECTED}:
            raise ValueError("UNEXPECTED_SPRITE_NAMES")
        metadata = json.loads(z.read("arcane_morphing_frame/manifest.json"))
        if set(metadata.get("assets", {})) != EXPECTED:
            raise ValueError("SPRITE_MANIFEST_COUNT_MISMATCH")
        for name in sorted(EXPECTED):
            data = z.read(f"arcane_morphing_frame/{name}.png")
            if len(data) < 100 or not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("INVALID_PNG_" + name)
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                if (image.format != "PNG" or image.mode != "RGBA" or
                    not 16 <= image.width <= 2500 or not 16 <= image.height <= 2500 or
                    image.getchannel("A").getextrema()[0] != 0 or
                    image.getchannel("A").getextrema()[1] < 200 or
                    metadata["assets"][name]["size"] != [image.width, image.height]):
                    raise ValueError("SPRITE_INVALID_" + name)
                output = io.BytesIO()
                image.save(output, format="WEBP", lossless=True, quality=100, method=6, exact=True)
                webp = output.getvalue()
                with Image.open(io.BytesIO(webp)) as check:
                    check.load()
                    if check.size != image.size or check.convert("RGBA").tobytes() != image.tobytes():
                        raise ValueError("SPRITE_LOSSLESS_MISMATCH_" + name)
                path = f"{DEST}/{name}.webp"
                outputs[path] = webp
                sprite_manifest["sprites"][name] = {
                    "path": path, "source_sha256": digest(data), "app_sha256": digest(webp),
                    "width": image.width, "height": image.height, "alpha_preserved": True
                }
    # Original ZIP remains in Drive; never include it in Git publication.
    manifest_path = f"{DEST}/manifest.json"
    outputs[manifest_path] = (json.dumps(sprite_manifest, indent=2, ensure_ascii=False) + "\n").encode()
    print("HERMES_GALLERY_SPRITES_VALIDATED", len(sprite_manifest["sprites"]),
          "webp_bytes", sum(len(x) for p, x in outputs.items() if p.endswith(".webp")))

    token = os.environ["GITHUB_TOKEN"]
    root = "https://api.github.com/repos/" + REPO
    def git(endpoint, *, method="GET", body=None):
        return http(root + endpoint, token, method=method, body=body)
    ref = git("/git/ref/heads/" + BRANCH)["object"]["sha"]
    base_tree = git("/git/commits/" + ref)["tree"]["sha"]
    trees = []
    for path, content in sorted(outputs.items()):
        git_sha = blobsha(content)
        try:
            existing = git("/contents/" + path + "?ref=" + urllib.parse.quote(BRANCH))
            if existing["sha"] != git_sha:
                raise ValueError("IMMUTABLE_ASSET_CONFLICT_" + path)
        except ValueError as exc:
            if "HTTP_404" not in str(exc):
                raise
        created = git("/git/blobs", method="POST",
                      body={"encoding": "base64", "content": base64.b64encode(content).decode("ascii")})
        if created["sha"] != git_sha:
            raise ValueError("BLOB_SHA_MISMATCH_" + path)
        trees.append({"path": path, "mode": "100644", "type": "blob", "sha": git_sha})
    tree = git("/git/trees", method="POST", body={"base_tree": base_tree, "tree": trees})
    commit = git("/git/commits", method="POST", body={
        "message": "HERMES: archive and publish verified Arcane Gallery kit sprites (preview)",
        "tree": tree["sha"], "parents": [ref]
    })
    if git("/git/ref/heads/" + BRANCH)["object"]["sha"] != ref:
        raise ValueError("BRANCH_CHANGED_RETRY_REQUIRED")
    git("/git/refs/heads/" + BRANCH, method="PATCH",
        body={"sha": commit["sha"], "force": False})
    print("HERMES_GALLERY_PREVIEW_COMMITTED", commit["sha"], manifest_path)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write(f"### HERMES Gallery Kit v0.1\n\n- Source SHA-256: \`{expected_sha}\`\n"
                          f"- Sprites: {len(EXPECTED)} lossless WebP with verified alpha\n"
                          f"- Branch: \`{BRANCH}\` (not production)\n"
                          f"- Commit: \`{commit['sha']}\`\n"
                          "- Supabase activation: none\n")

if __name__ == "__main__":
    raise SystemExit("MINOTAURUS: Gallery Kit publication retired; existing WebP assets retained")
