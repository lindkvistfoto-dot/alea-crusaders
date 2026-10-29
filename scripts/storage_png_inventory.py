#!/usr/bin/env python3
"""Read-only inventory of PNG objects in Supabase Storage.

Lists buckets and pages through their object trees. It never uploads, updates,
or deletes objects, and it never queries or changes database rows.
"""
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OUT_DIR = Path(os.environ.get("REPORT_DIR", "storage-png-report"))
PAGE_SIZE = 500
TIMEOUT = 45


def request_json(url, method="GET", body=None):
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        # Do not echo request URLs, response bodies, or credentials into Actions logs.
        raise RuntimeError("SUPABASE_STORAGE_HTTP_" + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("SUPABASE_STORAGE_NETWORK_ERROR") from None


def list_children(bucket, prefix):
    offset = 0
    while True:
        url = SUPABASE_URL + "/storage/v1/object/list/" + urllib.parse.quote(bucket, safe="")
        rows = request_json(url, "POST", {
            "prefix": prefix,
            "limit": PAGE_SIZE,
            "offset": offset,
            "sortBy": {"column": "name", "order": "asc"},
        })
        if not isinstance(rows, list):
            raise RuntimeError("UNEXPECTED_STORAGE_LIST_RESPONSE")
        yield from rows
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE


def list_bucket(bucket):
    pending = [""]
    visited = set()
    objects = []
    while pending:
        prefix = pending.pop()
        if prefix in visited:
            continue
        visited.add(prefix)
        for entry in list_children(bucket, prefix):
            name = entry.get("name")
            if not isinstance(name, str) or not name:
                continue
            path = prefix + name
            metadata = entry.get("metadata")
            is_file = entry.get("id") is not None or metadata is not None
            if not is_file:
                pending.append(path.rstrip("/") + "/")
                continue
            metadata = metadata if isinstance(metadata, dict) else {}
            objects.append({
                "bucket": bucket,
                "path": path,
                "size_bytes": int(metadata.get("size") or 0),
                "content_type": metadata.get("mimetype") or metadata.get("contentType") or "",
                "etag": metadata.get("eTag") or metadata.get("etag") or "",
                "last_modified": entry.get("updated_at") or entry.get("updatedAt") or "",
            })
    return objects


def main():
    if not SUPABASE_URL.startswith("https://"):
        raise RuntimeError("SUPABASE_URL_MUST_USE_HTTPS")

    buckets = request_json(SUPABASE_URL + "/storage/v1/bucket")
    if not isinstance(buckets, list):
        raise RuntimeError("UNEXPECTED_BUCKET_LIST_RESPONSE")

    all_objects = []
    for bucket_row in buckets:
        name = bucket_row.get("name")
        if not isinstance(name, str) or not name:
            continue
        items = list_bucket(name)
        all_objects.extend(items)
        print("Scanned bucket:", name, "objects:", len(items))

    pngs = [
        item for item in all_objects
        if item["content_type"].lower() == "image/png" or item["path"].lower().endswith(".png")
    ]
    groups = defaultdict(list)
    for item in pngs:
        if item["etag"] and item["size_bytes"] > 0:
            groups[(item["etag"], item["size_bytes"])].append(item)
    suspected_duplicates = [
        {"etag": etag, "size_bytes": size, "objects": rows}
        for (etag, size), rows in groups.items() if len(rows) > 1
    ]

    report = {
        "mode": "report_only",
        "project_url": SUPABASE_URL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bucket_count": len(buckets),
        "object_count": len(all_objects),
        "png_count": len(pngs),
        "png_bytes": sum(item["size_bytes"] for item in pngs),
        "png_by_bucket": {},
        "png_objects": sorted(pngs, key=lambda item: (item["bucket"], item["path"])),
        "suspected_duplicates_by_etag_and_size": suspected_duplicates,
        "duplicate_warning": "Matching ETag and size is a candidate signal, not proof of identical file bytes.",
        "reference_warning": "This report inventories Storage only; it does not prove whether application/database references exist.",
    }
    for item in pngs:
        bucket = item["bucket"]
        summary = report["png_by_bucket"].setdefault(bucket, {"count": 0, "bytes": 0})
        summary["count"] += 1
        summary["bytes"] += item["size_bytes"]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUT_DIR / "inventory.json"
    csv_path = OUT_DIR / "png-objects.csv"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=[
            "bucket", "path", "size_bytes", "content_type", "etag", "last_modified",
        ])
        writer.writeheader()
        writer.writerows(report["png_objects"])

    print("PNG inventory:", json_path)
    print("PNG count:", report["png_count"])
    print("PNG bytes:", report["png_bytes"])
    print("Suspected duplicate groups:", len(suspected_duplicates))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        label = str(error) if str(error).isupper() else type(error).__name__
        print("Inventory failed:", label, file=sys.stderr)
        raise SystemExit(1)
