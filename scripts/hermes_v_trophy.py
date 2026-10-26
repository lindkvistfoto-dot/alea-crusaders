#!/usr/bin/env python3
"""HERMES V: generic, single-image intake adapter for all supported Alea asset kinds.

Reuses the existing trusted HERMES 4 publisher. No separate storage engine,
no raw images in GitHub, and no bypass of source/archive integrity checks.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/hermes-v-trophy.json"
COLORS = ("red", "green", "blue")
KINDS = frozenset(("system-asset", "spell", "spell-cutout", "symbol", "skill",
    "skill-illustration", "skill-illustration-wide", "spell-illustration",
    "spell-illustration-wide"))
DRIVE_ID = re.compile(r"[A-Za-z0-9_-]{10,160}\Z")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
KEY = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
TARGET_ID = re.compile(r"[a-z0-9_-]{1,80}\Z")

def validate(item):
    required = ("kind", "target_key", "target_id", "drive_file_id",
                "archive_file_id", "source_sha256", "visual_approved")
    if any(key not in item for key in required):
        raise ValueError("MISSING_REQUIRED_ASSET_FIELD")
    if item["kind"] not in KINDS:
        raise ValueError("UNSUPPORTED_ASSET_KIND")
    if not isinstance(item["target_key"], str) or not KEY.fullmatch(item["target_key"]):
        raise ValueError("INVALID_ASSET_KEY")
    if not isinstance(item["target_id"], str) or not TARGET_ID.fullmatch(item["target_id"]):
        raise ValueError("INVALID_TARGET_ID")
    if not all(isinstance(item[k], str) and DRIVE_ID.fullmatch(item[k])
               for k in ("drive_file_id", "archive_file_id")):
        raise ValueError("INVALID_DRIVE_ID")
    if item["drive_file_id"] == item["archive_file_id"]:
        raise ValueError("ARCHIVE_NOT_INDEPENDENT")
    if not isinstance(item["source_sha256"], str) or not SHA256.fullmatch(item["source_sha256"]):
        raise ValueError("INVALID_SOURCE_SHA256")
    if item["visual_approved"] is not True:
        raise ValueError("VISUAL_APPROVAL_REQUIRED")
    return item

def request(color, mode="verify"):
    """Compatibility for the original three trophy-frame pilot assets."""
    if color not in COLORS:
        raise ValueError("UNKNOWN_TROPHY_ASSET")
    config = json.loads(CONFIG.read_text())
    if config.get("schema") != 1:
        raise ValueError("INVALID_HERMES_V_CONFIG")
    item = config["assets"][color]
    return build_request({
        "kind": "system-asset", "target_key": item["key"],
        "target_id": item["target_id"], "drive_file_id": item["inbox_id"],
        "archive_file_id": item["archive_id"], "source_sha256": item["sha256"],
        "visual_approved": True
    }, mode)

def build_request(item, mode="verify"):
    if mode not in ("verify", "pilot", "publish"):
        raise ValueError("INVALID_HERMES_V_MODE")
    return {"schema": 4, "mode": mode, "items": [validate(item)]}

def main():
    parser = argparse.ArgumentParser(description="HERMES V – all supported Alea image kinds")
    parser.add_argument("--color", choices=COLORS, help="Legacy trophy preset")
    parser.add_argument("--kind", choices=sorted(KINDS))
    parser.add_argument("--target-key")
    parser.add_argument("--target-id")
    parser.add_argument("--inbox-id")
    parser.add_argument("--archive-id")
    parser.add_argument("--sha256")
    parser.add_argument("--approved", action="store_true")
    parser.add_argument("--mode", choices=("verify", "pilot", "publish"), default="verify")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.color:
        if any((args.kind, args.target_key, args.target_id, args.inbox_id, args.archive_id, args.sha256, args.approved)):
            parser.error("Do not combine color preset with explicit asset arguments")
        payload = request(args.color, args.mode)
    else:
        payload = build_request({
            "kind": args.kind, "target_key": args.target_key,
            "target_id": args.target_id, "drive_file_id": args.inbox_id,
            "archive_file_id": args.archive_id, "source_sha256": args.sha256,
            "visual_approved": args.approved
        }, args.mode)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print("HERMES V request validated:", payload["items"][0]["kind"], payload["items"][0]["target_key"], args.mode)

if __name__ == "__main__":
    main()
