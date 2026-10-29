#!/usr/bin/env python3
"""Delete only the three database/code-unreferenced pose-staging PNG candidates."""
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "alea-battle-pose-staging"
OUT = Path(os.environ.get("REPORT_DIR", "pose-png-cleanup"))
TARGETS = [
    "battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/76f2b738-8b5a-494e-99a4-49b889041992.png",
    "battle-pose/character-npc/d6310877-52e8-41c0-b2e5-bd81d5a50bbf/standard/a05d1885-e890-4859-b226-06ca9d76ef7b.png",
    "battle-pose/enemy/be8bb82b-3024-469d-aaa7-c838c2cd0124/standard/03272ddc-d167-4cf4-a96a-720b8444b793.png",
]
TIMEOUT = 60

def request(path, method="GET", body=None, allow_missing=False):
    url = BASE + "/storage/v1/object/" + BUCKET + "/" + urllib.parse.quote(path, safe="/")
    headers = {"apikey": KEY, "Authorization": "Bearer " + KEY}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if allow_missing and error.code == 404:
            return None
        raise RuntimeError("STORAGE_HTTP_" + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("STORAGE_NETWORK_ERROR") from None

def main():
    if not BASE.startswith("https://") or not KEY:
        raise RuntimeError("SUPABASE_CONFIGURATION_MISSING")

    # Confirm the exact candidate set exists before issuing the batch deletion.
    sources = {}
    for path in TARGETS:
        content = request(path)
        sources[path] = {"size_bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}

    delete_url = BASE + "/storage/v1/object/" + BUCKET
    req = urllib.request.Request(
        delete_url,
        data=json.dumps({"prefixes": TARGETS}).encode("utf-8"),
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError("STORAGE_DELETE_HTTP_" + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("STORAGE_DELETE_NETWORK_ERROR") from None

    for path in TARGETS:
        if request(path, allow_missing=True) is not None:
            raise RuntimeError("OBJECT_STILL_PRESENT_AFTER_DELETE")

    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "result": "deleted_and_verified",
        "bucket": BUCKET,
        "deleted_objects": [{"path": path, **sources[path]} for path in TARGETS],
    }
    (OUT / "cleanup-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": report["result"], "deleted_count": len(TARGETS)}))

if __name__ == "__main__":
    main()
