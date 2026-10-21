#!/usr/bin/env python3
"""HERMES: event-driven, authenticated Drive -> verified WebP in runner temporary storage.

Run only from trusted push-to-main GitHub Actions. Do not print Google tokens or PNG bytes.
The queue JSON is a start instruction, NEVER a binary image or a public Drive URL.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
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
CODEX_UI_TARGETS = {"arcane-skill-codex-outer-frame", "arcane-skill-codex-header", "arcane-skill-codex-leather", "arcane-skill-codex-dark-panel", "arcane-skill-codex-parchment-fishing", "arcane-skill-codex-parchment-neutral", "arcane-skill-codex-stat-plate", "arcane-skill-codex-medallion", "arcane-skill-codex-close-button", "arcane-skill-codex-divider", "arcane-skill-codex-illustration-frame", "arcane-skill-codex-ornament"}
UI_TARGETS |= CODEX_UI_TARGETS


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
            return result.status, result.read(MAX_BYTES * 2)  # GitHub Contents base64 JSON can exceed 1 MiB for valid PNG originals
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


def drive_file(file_id: str, folder: str) -> bytes:
    if not isinstance(file_id, str) or not FILE_ID_PATTERN.fullmatch(file_id):
        raise ValueError("INVALID_DRIVE_FILE_ID")
    token = os.environ["GOOGLE_ACCESS_TOKEN"]
    base = "https://www.googleapis.com/drive/v3/files/" + file_id
    _, meta_bytes = api(
        base + "?fields=id,name,mimeType,size,parents,trashed", token)
    meta = json.loads(meta_bytes)
    if meta.get("trashed"):
        raise ValueError("FILE_NOT_IN_REQUIRED_HERMES_FOLDER")
    parents = meta.get("parents", [])
    if parents and folder not in parents:
        raise ValueError("FILE_NOT_IN_REQUIRED_HERMES_FOLDER")
    if meta.get("mimeType") != "image/png":
        raise ValueError("FILE_NOT_PNG_MIME")
    if not 100 <= int(meta.get("size", 0)) <= MAX_BYTES:
        raise ValueError("FILE_SIZE_OUT_OF_RANGE")
    if not parents:
        # Individually shared files can hide an unshared parent's metadata.
        # Require server-side membership evidence for this exact file instead;
        # never treat missing parents or a matching filename alone as proof.
        if not FILE_ID_PATTERN.fullmatch(folder) or not isinstance(meta.get("name"), str) or not meta["name"]:
            raise ValueError("FILE_PARENT_MEMBERSHIP_UNVERIFIED")
        name = meta["name"].replace("\\", "\\\\").replace("'", "\\'")
        query = "'" + folder + "' in parents and name = '" + name + "' and trashed = false"
        url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode({
            "q": query, "fields": "nextPageToken,incompleteSearch,files(id)",
            "pageSize": 100, "corpora": "user", "spaces": "drive",
        })
        _, listing_bytes = api(url, token)
        listing = json.loads(listing_bytes)
        if listing.get("nextPageToken") or listing.get("incompleteSearch") or not any(
            item.get("id") == file_id for item in listing.get("files", [])
        ):
            raise ValueError("FILE_PARENT_MEMBERSHIP_UNVERIFIED")
    _, data = api(base + "?alt=media", token)
    if len(data) != int(meta["size"]):
        raise ValueError("FILE_TRUNCATED")
    return data


def google_file(file_id: str) -> bytes:
    return drive_file(file_id, FOLDER)


KINDS = {"spell", "spell-cutout", "symbol", "skill", "skill-illustration",
         "skill-illustration-wide", "spell-illustration", "spell-illustration-wide"}


def archive_folder(kind: str, folders: dict) -> str:
    group, profile = {
        "spell": ("spell_types", "icon"), "symbol": ("spell_types", "icon"),
        "spell-cutout": ("spell_types", "cutout"),
        "spell-illustration": ("spell_types", "square"),
        "spell-illustration-wide": ("spell_types", "wide"),
        "skill": ("skill_types", "icon"), "skill-illustration": ("skill_types", "square"),
        "skill-illustration-wide": ("skill_types", "wide"),
    }[kind]
    return folders[group][profile]


def batch_request(request: dict) -> dict:
    """Normalize the small queue format or Work's approved records, never infer publish."""
    mode = request.get("mode")
    if mode not in ("verify", "pilot", "publish"):
        raise ValueError("BATCH_MODE_REQUIRED")
    if request.get("schema") == 4 and set(request) == {"schema", "mode", "items"}:
        items = request["items"]
    elif request.get("schema_version") == "1.0" and isinstance(request.get("records"), list):
        items = []
        for row in request["records"]:
            if not isinstance(row, dict):
                items.append(row)
                continue
            inbox = row.get("inbox_file_id", row.get("drive_file_id"))
            archive = row.get("archive_file_id")
            if archive is None and row.get("inbox_file_id") and row.get("drive_file_id") and row["drive_file_id"] != inbox:
                archive = row.get("drive_file_id")
            items.append({"kind": row.get("image_type"), "target_key": row.get("spell_key"),
                          "target_id": row.get("spell_id"), "drive_file_id": inbox,
                          "source_sha256": row.get("sha256"), "archive_file_id": archive,
                          "visual_approved": row.get("quality_status") == "approved"})
    else:
        raise ValueError("INVALID_BATCH_SCHEMA")
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        raise ValueError("BATCH_REQUIRES_1_TO_100_ITEMS")
    slots = [(item.get("kind"), item.get("target_key")) for item in items if isinstance(item, dict)]
    # Reject duplicate target slots before any download, conversion or publication.
    if len({json.dumps(slot) for slot in slots}) != len(slots):
        raise ValueError("DUPLICATE_BATCH_TARGET")
    return {"schema": 4, "mode": mode, "items": items}


def validate_batch_item(item: dict) -> None:
    required = {"kind", "target_key", "target_id", "drive_file_id", "source_sha256", "visual_approved"}
    if not isinstance(item, dict) or not required <= set(item) or set(item) - required - {"archive_file_id"}:
        raise ValueError("INVALID_BATCH_ITEM")
    if not isinstance(item["kind"], str) or item["kind"] not in KINDS:
        raise ValueError("INVALID_HERMES_KIND")
    if not isinstance(item["target_key"], str) or not KEY_PATTERN.fullmatch(item["target_key"]):
        raise ValueError("INVALID_TARGET_KEY")
    if not isinstance(item["target_id"], str) or not re.fullmatch(r"[a-z0-9_-]{1,80}", item["target_id"]):
        raise ValueError("PINNED_TARGET_ID_REQUIRED")
    if not isinstance(item["source_sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", item["source_sha256"]):
        raise ValueError("PINNED_SOURCE_SHA256_REQUIRED")
    if item["visual_approved"] is not True:
        raise ValueError("VISUAL_APPROVAL_REQUIRED")


def run_batch(request: dict, output_root: Path, workers: int = 3) -> dict:
    """One authenticated batch; only WebP/JSON reach disk. A failed image stays isolated."""
    if not 1 <= workers <= 4:
        raise ValueError("WORKERS_MUST_BE_1_TO_4")
    batch = batch_request(request)
    if output_root.resolve().is_relative_to(Path.cwd().resolve()):
        raise ValueError("OUTPUT_MUST_BE_OUTSIDE_CHECKOUT")
    folders = json.loads((Path(__file__).resolve().parents[1] / "config/hermes-drive-folders.json").read_text())
    if folders["inbox_folder_id"] != FOLDER:
        raise ValueError("INBOX_CONFIGURATION_MISMATCH")
    # Never let stale files from a previous invocation become publication input.
    output_root.mkdir(parents=True, exist_ok=True)
    for name in ("manifest.json", "publisher-report.json", "batch-report.json", "retry-request.json"):
        (output_root / name).unlink(missing_ok=True)
    started = time.monotonic()

    def prepare_item(index_item):
        index, item = index_item
        result = {"index": index, "request": item, "status": "failed", "stage": "validation"}
        item_start = time.monotonic()
        try:
            validate_batch_item(item)
            raw = google_file(item["drive_file_id"])
            if validate_png(raw, item["kind"], item["target_key"]) != item["source_sha256"]:
                raise ValueError("DRIVE_SOURCE_SHA256_MISMATCH")
            if item["kind"] == "spell-cutout":
                with Image.open(io.BytesIO(raw)) as image:
                    if image.getchannel("A").getextrema()[0] != 0:
                        raise ValueError("CUTOUT_REQUIRES_FULLY_TRANSPARENT_PIXELS")
            if batch["mode"] == "verify":
                result["status"] = "verified"
                return result, None
            result["stage"] = "archive"
            archive_id = item.get("archive_file_id")
            if not archive_id:
                raise ValueError("ARCHIVE_COPY_REQUIRED_USE_CONNECTED_DRIVE")
            if archive_id == item["drive_file_id"]:
                raise ValueError("ARCHIVE_MUST_BE_SEPARATE_FROM_INBOX")
            archived = drive_file(archive_id, archive_folder(item["kind"], folders))
            if len(archived) != len(raw) or hashlib.sha256(archived).hexdigest() != item["source_sha256"]:
                raise ValueError("DRIVE_ARCHIVE_SHA256_MISMATCH")
            result["archive_verified"] = True
            result["stage"] = "conversion"
            from hermes2_prepare import prepare_bytes
            asset = prepare_bytes(raw, item["kind"], item["target_key"], item["source_sha256"],
                                  output_root, "drive://" + archive_id)
            asset.update(target_id=item["target_id"], batch_index=index,
                         archive_file_id=archive_id, archive_verified=True,
                         inbox_file_id=item["drive_file_id"])
            result["status"] = "prepared"
            return result, asset
        except Exception as error:
            # api() removes credentials and response bodies from provider errors.
            result["error"] = str(error)[:400]
            print("HERMES_ITEM_FAILED", index, result["stage"], result["error"])
            return result, None
        finally:
            result["elapsed_seconds"] = round(time.monotonic() - item_start, 3)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        prepared = list(pool.map(prepare_item, enumerate(batch["items"])))
    results = [result for result, _ in prepared]
    manifest = {"schema": 2, "publication_mode": batch["mode"], "archive_required": True,
                "assets": [asset for _, asset in prepared if asset is not None]}
    report = {"schema": 4, "mode": batch["mode"], "workers": workers,
              "elapsed_seconds": round(time.monotonic() - started, 3), "items": results}
    (output_root / "intake-report.json").write_text(json.dumps(report, indent=2) + "\n")
    if manifest["assets"]:
        (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def finalize_batch(output_root: Path) -> bool:
    """Combine both stages and emit a retry instruction containing only failed images."""
    report = json.loads((output_root / "intake-report.json").read_text())
    publication_file = output_root / "publisher-report.json"
    publication = json.loads(publication_file.read_text()) if publication_file.exists() else {}
    published = {item["index"]: item for item in publication.get("items", [])}
    retries = []
    for item in report["items"]:
        if item["status"] == "prepared":
            outcome = published.get(item["index"], {"status": "failed", "error": publication.get("error") or "PUBLICATION_NOT_COMPLETED"})
            item["publication"] = outcome
            item["status"] = outcome["status"]
        if item["status"] == "failed":
            retries.append(item["request"])
    report["source_bucket_empty"] = publication.get("source_bucket_empty")
    report["publication_error"] = publication.get("error")
    report["elapsed_seconds"] += publication.get("elapsed_seconds", 0)
    report["run_id"] = os.environ.get("GITHUB_RUN_ID")
    report["commit"] = os.environ.get("GITHUB_SHA")
    report["failed"] = len(retries)
    report["succeeded"] = len(report["items"]) - len(retries)
    success = not retries and not publication.get("error") and (
        report["mode"] == "verify" or publication.get("source_bucket_empty") is True)
    report["success"] = success
    (output_root / "batch-report.json").write_text(json.dumps(report, indent=2) + "\n")
    if retries:
        (output_root / "retry-request.json").write_text(json.dumps(
            {"schema": 4, "mode": report["mode"], "items": retries}, indent=2) + "\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(f"### HERMES 4.0: {report['succeeded']}/{len(report['items'])} succeeded\n\n")
            stream.write("| Target | Result | Error |\n|---|---|---|\n")
            for item in report["items"]:
                request = item["request"] if isinstance(item["request"], dict) else {}
                error = item.get("error", item.get("publication", {}).get("error", ""))
                clean = lambda value: str(value).replace("|", "/").replace("\n", " ").replace("<", "&lt;")
                stream.write(f"| {clean(request.get('target_key', '?'))} | {item['status']} | {clean(error)} |\n")
            stream.write(f"\nSource bucket empty: {report['source_bucket_empty']}. See JSON artifact for hashes, archive IDs, paths and retry input.\n")
    print("HERMES_BATCH_REPORT", json.dumps({key: report[key] for key in (
        "succeeded", "failed", "success", "elapsed_seconds", "source_bucket_empty")}))
    return success


def validate_png(data: bytes, kind: str = "spell", target_key: str = "") -> str:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("BAD_PNG_SIGNATURE")
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.format != "PNG":
            raise ValueError("BAD_PNG_FORMAT")
        if kind == "ui":
            if target_key in CODEX_UI_TARGETS:
                if not (100 <= image.width <= 4096 and 40 <= image.height <= 4096 and image.width * image.height <= 16_000_000):
                    raise ValueError("CODEX_UI_DIMENSIONS_INVALID")
            elif target_key not in UI_TARGETS or not ((target_key.startswith("arcane-gallery-goose-") and (
                image.size in {(724, 1086), (515, 527)})) or (640 <= image.width <= 4096 and (
                (target_key == "arcane-mechanism-link" and (
                    image.width * 2 == 3 * image.height or image.width * 3 == 4 * image.height
                    or image.width * 4 == 3 * image.height
                ))
                or (target_key == "arcane-mechanism-chamber" and image.width == 3 * image.height)
                or (target_key == "arcane-gallery-overlay" and (image.width, image.height) == (1536, 1024))
                or (target_key in {"arcane-gallery-goose-left", "arcane-gallery-goose-right"}
                    and image.size == (724, 1086))
                or (target_key == "arcane-gallery-goose-seal" and image.size == (515, 527))
            ))):
                raise ValueError("BAD_UI_PNG")
            if target_key in CODEX_UI_TARGETS:
                if image.mode != "RGBA":
                    raise ValueError("CODEX_UI_REQUIRES_RGBA")
                alpha_min, alpha_max = image.getchannel("A").getextrema()
                if alpha_min > 16 or alpha_max < 240:
                    raise ValueError("CODEX_UI_REQUIRES_TRUE_ALPHA")
            elif target_key.startswith("arcane-gallery-goose-"):
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
        elif kind in ("skill-illustration", "skill-illustration-wide", "spell-illustration-wide", "spell-illustration"):
            if image.mode not in ("RGB", "RGBA"):
                raise ValueError("ILLUSTRATION_REQUIRES_RGB_OR_OPAQUE_RGBA")
            if kind in ("skill-illustration-wide", "spell-illustration-wide"):
                ratio_ok = (1.25 <= image.width / image.height <= 2.4) if kind == "spell-illustration-wide" else (abs(image.width / image.height - 16 / 9) / (16 / 9) <= 0.003)
                if not (640 <= image.width <= 4096 and 360 <= image.height <= 4096 and ratio_ok):
                    raise ValueError("WIDE_REQUIRES_LANDSCAPE_NEAR_16_9")
            elif not (image.width == image.height and 640 <= image.width <= 4096):
                raise ValueError("BAD_PNG_DIMENSIONS")
            if image.mode == "RGBA" and image.getchannel("A").getextrema() != (255, 255):
                raise ValueError("ILLUSTRATION_REQUIRES_OPAQUE_FULL_FRAME")
        else:
            if image.mode != "RGBA":
                raise ValueError("NOT_RGBA_PNG")
            min_edge = 1024 if kind == "spell-cutout" else 640
            if not (image.width == image.height and min_edge <= image.width <= 4096):
                raise ValueError("BAD_PNG_DIMENSIONS")
            alpha_min, alpha_max = image.getchannel("A").getextrema()
            if alpha_min == 255 or alpha_max == 0:
                raise ValueError("INVALID_ALPHA")
        print("PNG_OK", f"{image.width}x{image.height}", "bytes", len(data))
    return hashlib.sha256(data).hexdigest()


def run(request_path: str, output_root: Path | None = None, workers: int = 3) -> dict | None:
    if not QUEUE_PATTERN.fullmatch(request_path):
        raise ValueError("INVALID_QUEUE_PATH")
    if os.environ.get("GITHUB_REPOSITORY") != REPO or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise ValueError("UNTRUSTED_GITHUB_CONTEXT")
    root = Path.cwd()
    request_file = (root / request_path).resolve()
    if not request_file.is_relative_to((root / "hermes" / "queue").resolve()) or not request_file.is_file():
        raise ValueError("QUEUE_FILE_NOT_FOUND")
    request = json.loads(request_file.read_text(encoding="utf-8"))
    if isinstance(request, dict) and (request.get("schema") == 4 or "records" in request):
        if output_root is None:
            raise ValueError("BATCH_OUTPUT_REQUIRED")
        return run_batch(request, output_root, workers)
    common_keys = {"schema", "kind", "target_key", "mode"}
    if not isinstance(request, dict) or not (
        set(request) in [common_keys | {selector} | extra
                        for selector in ("drive_file_id", "drive_file_name")
                        for extra in (set(), {"source_sha256"})]
    ):
        raise ValueError("INVALID_QUEUE_SCHEMA")
    if request["schema"] != 1 or request["kind"] not in ("spell", "spell-cutout", "symbol", "skill", "skill-illustration", "skill-illustration-wide", "spell-illustration-wide", "spell-illustration", "ui"):
        raise ValueError("INVALID_HERMES_KIND")
    if not isinstance(request["target_key"], str) or not KEY_PATTERN.fullmatch(request["target_key"]):
        raise ValueError("INVALID_TARGET_KEY")
    if request["kind"] == "ui":
        raise ValueError("UI_PUBLICATION_RETIRED_USE_EXISTING_WEBP")
    if "drive_file_id" in request:
        if not isinstance(request["drive_file_id"], str) or not FILE_ID_PATTERN.fullmatch(request["drive_file_id"]):
            raise ValueError("INVALID_DRIVE_FILE_ID")
        file_id = request["drive_file_id"]
    else:
        if not isinstance(request["drive_file_name"], str):
            raise ValueError("INVALID_DRIVE_FILE_NAME")
        file_id = find_drive_file_by_name(request["drive_file_name"])
    if request["mode"] not in ("verify", "pilot", "publish"):
        raise ValueError("INVALID_MODE")
    if request["mode"] != "verify" and not re.fullmatch(r"[a-f0-9]{64}", request.get("source_sha256", "")):
        raise ValueError("PINNED_SOURCE_SHA256_REQUIRED")
    print("QUEUE_ACCEPTED", request_path, request["mode"], request["kind"], request["target_key"])
    data = google_file(file_id)
    digest = validate_png(data, request["kind"], request["target_key"])
    if request["target_key"].startswith("arcane-gallery-goose-"):
        if request["kind"] != "ui":
            raise ValueError("GOOSE_REQUIRES_UI_KIND")
        manifest = json.loads((root / "features/material/goose04/source-manifest.json").read_text())
        pinned = manifest["assets"].get(request["target_key"])
        if not pinned or file_id != pinned["drive_file_id"] or digest != pinned["sha256"] or len(data) != pinned["bytes"]:
            raise ValueError("GOOSE_SOURCE_PIN_MISMATCH")
    if request.get("source_sha256", digest) != digest:
        raise ValueError("DRIVE_SOURCE_SHA256_MISMATCH")
    print("DRIVE_DOWNLOAD_VERIFIED", "sha256", digest, "drive_file_id", file_id)
    if request["mode"] == "verify":
        print("HERMES_VERIFY_ONLY_NO_WRITES")
        return None
    if output_root is None or output_root.resolve().is_relative_to(root.resolve()):
        raise ValueError("OUTPUT_MUST_BE_OUTSIDE_CHECKOUT")
    from hermes2_prepare import prepare_bytes
    asset = prepare_bytes(data, request["kind"], request["target_key"], digest,
                          output_root, "drive://" + file_id)
    manifest = {"schema": 2, "publication_mode": request["mode"], "assets": [asset]}
    (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("HERMES_DIRECT_PREPARED", request["kind"], request["target_key"])
    return manifest


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", nargs="?")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--finalize", action="store_true")
    args = parser.parse_args()
    if args.finalize:
        raise SystemExit(0 if finalize_batch(args.output) else 1)
    if not args.request:
        parser.error("request is required unless --finalize is used")
    run(args.request, args.output, args.workers)

