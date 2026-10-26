#!/usr/bin/env python3
"""HERMES V: tiny trophy-room adapter for the existing verified HERMES publisher.

No new image engine, credentials, storage APIs or original copies in GitHub.
Creates a pinned, single-image request. The trusted runner verifies the actual
Inbox and archived bytes before WebP conversion and Supabase activation.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/hermes-v-trophy.json"
COLORS = ("red", "green", "blue")

def request(color, mode="publish"):
    if color not in COLORS or mode not in ("verify", "pilot", "publish"):
        raise ValueError("INVALID_HERMES_V_REQUEST")
    config = json.loads(CONFIG.read_text())
    if config.get("schema") != 1:
        raise ValueError("INVALID_HERMES_V_CONFIG")
    item = config["assets"][color]
    for name in ("inbox_id", "archive_id"):
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,160}", item[name]):
            raise ValueError("INVALID_DRIVE_ID")
    if item["inbox_id"] == item["archive_id"]:
        raise ValueError("ARCHIVE_NOT_INDEPENDENT")
    if item["key"] != "arcane-medal-display-" + color:
        raise ValueError("UNEXPECTED_TARGET")
    if not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
        raise ValueError("INVALID_SOURCE_SHA256")
    return {"schema": 4, "mode": mode, "items": [{
        "kind": "system-asset",
        "target_key": item["key"],
        "target_id": item["target_id"],
        "drive_file_id": item["inbox_id"],
        "archive_file_id": item["archive_id"],
        "source_sha256": item["sha256"],
        "visual_approved": True
    }]}

def main():
    parser = argparse.ArgumentParser(description="HERMES V trophy pilot")
    parser.add_argument("--color", choices=COLORS, required=True)
    parser.add_argument("--mode", choices=("verify", "pilot", "publish"), default="verify")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    payload = request(args.color, args.mode)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print("HERMES V request ready:", args.color, args.mode)

if __name__ == "__main__":
    main()
