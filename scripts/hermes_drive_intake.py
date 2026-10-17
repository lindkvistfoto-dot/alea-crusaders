#!/usr/bin/env python3
"""HERMES: event-driven, authenticated Drive -> immutable GitHub PNG -> dispatch.

Run only from trusted push-to-main GitHub Actions. Do not print Google tokens or PNG bytes.
The queue JSON is a start instruction, NEVER a binary image or a public Drive URL.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

REPO = "lindkvistfoto-dot/alea-crusaders"
FOLDER = "1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp"
FILE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{10,160}$")
KEY_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
QUEUE_PATTERN = re.compile(r"^hermes/queue/[a-z0-9][a-z0-9-]{0,99}\.json$")
MAX_BYTES = 8_388_608
UI_TARGETS = {"arcane-mechanism-link", "arcane-mechanism-chamber", "arcane-gallery-overlay",
              "arcane-gallery-goose-left", "arcane-gallery-goose-right", "arcane-gallery-goose-seal"}


def api(url: str, token: str, *, method: str = "GET", payload=None) -> tuple[int, bytes]:
    headers = {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json" if "api.github.com" in url else "application/json",
        "User-Agent": "Alea-HERMES-Drive-Intake",
    }
    if "api.github.com" in url:
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    body = None
    if payload is not None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, headers=headers, data=body, method=method)
    try:
        with urllib.request.urlopen(req, timeout=80) as result:
            return result.status, result.read(MAX_BYTES * 2 if "googleapis.com" in url else 1024 * 1024)
    except urllib.error.HTTPError as err:
        # Do not include request headers or access tokens in logs.
        raise RuntimeError(f"HTTP_{err.code} {method} {urllib.parse.urlsplit(url).path}") from None


def find_drive_file_by_name(file_name: str) -> str:
    """Resolve a unique file solely within the authorized HERMES Inbox."""
    if not isinstance(file_name, str) or not file_name.endswith(".png") or not re.fullmatch(r"[A-Za-z0-9._-]{1,160}", file_name):
        raise ValueError("INVALID_DRIVE_FILE_NAME")
    query = "'" + FOLDER + "' in parents and name = '" + file_name + "' and trashed = false"
    url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode({
        "q": query,
        "fields": "nextPageToken,files(id,name,mimeType,parents,size)",
        "pageSize": 100,
    })
    _, response = api(url, os.environ["GOOGLE_ACCESS_TOKEN"])
    payload = json.loads(response)
    matches = [item for item in payload.get("files", []) if item.get("name") == file_name
               and item.get("mimeType") == "image/png" and FOLDER in item.get("parents", [])]
    if payload.get("nextPageToken") or len(matches) != 1:
        raise ValueError("DRIVE_FILENAME_MUST_MATCH_EXACTLY_ONE_PNG")
    return matches[0]["id"]


def google_file(file_id: str) -> bytes:
    token = os.environ["GOOGLE_ACCESS_TOKEN"]
    base = "https://www.googleapis.com/drive/v3/files/" + file_id
    _, meta_bytes = api(
        base + "?fields=id,name,mimeType,size,parents,trashed", token)
    meta = json.loads(meta_bytes)
    if meta.get("trashed") or FOLDER not in meta.get("parents", []):
        raise ValueError("FILE_NOT_IN_HERMES_INBOX")
    if meta.get("mimeType") != "image/png":
        raise ValueError("FILE_NOT_PNG_MIME")
    if not 100 <= int(meta.get("size", 0)) <= MAX_BYTES:
        raise ValueError("FILE_SIZE_OUT_OF_RANGE")
    _, data = api(base + "?alt=media", token)
    if len(data) != int(meta["size"]):
        raise ValueError("FILE_TRUNCATED")
    return data


def validate_png(data: bytes, kind: str = "spell", target_key: str = "") -> str:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("BAD_PNG_SIGNATURE")
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.format != "PNG":
            raise ValueError("BAD_PNG_FORMAT")
        if kind == "ui":
            if target_key not in UI_TARGETS or not (640 <= image.width <= 4096 and (
                (target_key == "arcane-mechanism-link" and (
                    image.width * 2 == 3 * image.height or image.width * 3 == 4 * image.height
                    or image.width * 4 == 3 * image.height
                ))
                or (target_key == "arcane-mechanism-chamber" and image.width == 3 * image.height)
                or (target_key == "arcane-gallery-overlay" and (image.width, image.height) == (1536, 1024))
                or (target_key in {"arcane-gallery-goose-left", "arcane-gallery-goose-right"}
                    and image.size == (724, 1086))
                or (target_key == "arcane-gallery-goose-seal" and image.size == (515, 527))
            )):
                raise ValueError("BAD_UI_PNG")
            if target_key.startswith("arcane-gallery-goose-"):
                if image.mode != "RGBA" or image.getchannel("A").getextrema() != (0, 255):
                    raise ValueError("GOOSE_SPRITE_REQUIRES_TRUE_ALPHA")
            elif target_key == "arcane-mechanism-link":
                if image.mode != "RGBA" or image.getchannel("A").getextrema() != (0, 255):
                    raise ValueError("UI_LINK_REQUIRES_TRUE_ALPHA")
            elif target_key == "arcane-gallery-overlay":
                # The approved overlay can arrive as an RGBA PNG with genuine
                # transparency. The immutable original stays untouched.
                if image.mode not in ("RGB", "RGBA") or (
                    image.mode == "RGBA" and image.getchannel("A").getextrema()[1] == 0
                ):
                    raise ValueError("UI_GALLERY_SOURCE_INVALID")
            elif image.mode not in ("RGB", "RGBA") or (
                image.mode == "RGBA" and image.getchannel("A").getextrema() != (255, 255)
            ):
                raise ValueError("UI_OPAQUE_SOURCE_REQUIRED")
        else:
            if image.mode != "RGBA":
                raise ValueError("NOT_RGBA_PNG")
            if not (image.width == image.height and 640 <= image.width <= 4096):
                raise ValueError("BAD_PNG_DIMENSIONS")
            alpha_min, alpha_max = image.getchannel("A").getextrema()
            if alpha_min == 255 or alpha_max == 0:
                raise ValueError("INVALID_ALPHA")
        print("PNG_OK", f"{image.width}x{image.height}", "bytes", len(data))
    return hashlib.sha256(data).hexdigest()


def github_json(endpoint: str, *, method="GET", payload=None):
    _, body = api(
        "https://api.github.com/repos/" + REPO + endpoint,
        os.environ["GITHUB_TOKEN"],
        method=method, payload=payload)
    return json.loads(body) if body else {}


def upload_if_missing(path: str, data: bytes) -> bool:
    git_sha = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
    # A duplicate file is fine only if it has the *exact* same bytes.
    head = github_json("/git/ref/heads/main")["object"]["sha"]
    try:
        original = github_json("/contents/" + path + "?ref=main")
        if original["sha"] != git_sha:
            raise ValueError("GITHUB_PATH_COLLISION")
        print("GITHUB_ORIGINAL_ALREADY_EXISTS", path, git_sha)
        return False
    except RuntimeError as e:
        if "HTTP_404" not in str(e):
            raise

    created = github_json(
        "/git/blobs", method="POST",
        payload={"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"})
    if created["sha"] != git_sha:
        raise ValueError("GITHUB_BLOB_INTEGRITY_FAILURE")
    for attempt in range(5):
        ref = github_json("/git/ref/heads/main")["object"]["sha"]
        commit = github_json("/git/commits/" + ref)
        tree = github_json("/git/trees", method="POST", payload={
            "base_tree": commit["tree"]["sha"],
            "tree": [{"path": path, "mode": "100644", "type": "blob", "sha": git_sha}]
        })
        next_commit = github_json("/git/commits", method="POST", payload={
            "message": "HERMES: archive verified immutable Drive PNG " + path,
            "tree": tree["sha"], "parents": [ref]
        })
        try:
            github_json("/git/refs/heads/main", method="PATCH",
                        payload={"sha": next_commit["sha"], "force": False})
            check = github_json("/contents/" + path + "?ref=" + next_commit["sha"])
            if check["sha"] != git_sha:
                raise ValueError("GITHUB_READBACK_SHA_MISMATCH")
            print("GITHUB_ORIGINAL_COMMITTED", path, next_commit["sha"])
            return True
        except RuntimeError as e:
            if "HTTP_409" not in str(e) and "HTTP_422" not in str(e):
                raise
            time.sleep(1 + attempt)
    raise RuntimeError("GITHUB_REF_CONFLICT_TOO_MANY_RETRIES")


def run(request_path: str) -> None:
    if not QUEUE_PATTERN.fullmatch(request_path):
        raise ValueError("INVALID_QUEUE_PATH")
    if os.environ.get("GITHUB_REPOSITORY") != REPO or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise ValueError("UNTRUSTED_GITHUB_CONTEXT")
    root = Path.cwd()
    request_file = (root / request_path).resolve()
    if not request_file.is_relative_to((root / "hermes" / "queue").resolve()) or not request_file.is_file():
        raise ValueError("QUEUE_FILE_NOT_FOUND")
    request = json.loads(request_file.read_text(encoding="utf-8"))
    common_keys = {"schema", "kind", "target_key", "mode"}
    if not isinstance(request, dict) or not (
        set(request) == common_keys | {"drive_file_id"} or
        set(request) == common_keys | {"drive_file_name"}
    ):
        raise ValueError("INVALID_QUEUE_SCHEMA")
    if request["schema"] != 1 or request["kind"] not in ("spell", "symbol", "ui"):
        raise ValueError("INVALID_HERMES_KIND")
    if not isinstance(request["target_key"], str) or not KEY_PATTERN.fullmatch(request["target_key"]):
        raise ValueError("INVALID_TARGET_KEY")
    if request["kind"] == "ui" and request["target_key"] not in UI_TARGETS:
        raise ValueError("INVALID_UI_TARGET")
    if "drive_file_id" in request:
        if not isinstance(request["drive_file_id"], str) or not FILE_ID_PATTERN.fullmatch(request["drive_file_id"]):
            raise ValueError("INVALID_DRIVE_FILE_ID")
        file_id = request["drive_file_id"]
    else:
        if not isinstance(request["drive_file_name"], str):
            raise ValueError("INVALID_DRIVE_FILE_NAME")
        file_id = find_drive_file_by_name(request["drive_file_name"])
    if request["mode"] not in ("verify", "publish"):
        raise ValueError("INVALID_MODE")
    print("QUEUE_ACCEPTED", request_path, request["mode"], request["kind"], request["target_key"])
    data = google_file(file_id)
    digest = validate_png(data, request["kind"], request["target_key"])
    path = (
        "assets/hermes/originals/" + request["kind"] + "/" + request["target_key"]
        + "/" + digest + ".png"
    )
    print("DRIVE_DOWNLOAD_VERIFIED", "sha256", digest, "target", path)
    if request["mode"] == "verify":
        print("HERMES_VERIFY_ONLY_NO_GITHUB_OR_SUPABASE_WRITES")
        return

    # Only the explicit 'publish' request can put a PUBLIC image in PUBLIC GitHub.
    upload_if_missing(path, data)
    # GitHub's GITHUB_TOKEN commit does NOT cause ordinary push workflows.
    # Explicit workflow_dispatch with GITHUB_TOKEN DOES trigger a second workflow.
    workflow = "hermes-ui-intake.yml" if request["kind"] == "ui" else "hermes21-intake.yml"
    github_json("/actions/workflows/" + workflow + "/dispatches", method="POST",
                payload={"ref": "main", "inputs": {"source_path": path}})
    print("HERMES_PUBLISH_DISPATCHED", path, "workflow", workflow)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
            output.write(
                f"### HERMES queue consumed\n\n- Source: \`{path}\`\n"
                "- Publication dispatched explicitly; check HERMES 2.1 run for ACTIVE status.\n"
            )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Usage: hermes_drive_intake.py hermes/queue/JOB.json [...]")
    for p in sys.argv[1:]:
        run(p)
