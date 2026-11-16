#!/usr/bin/env python3
"""Route changed HERMES CORE DEV request paths to their existing Actions jobs."""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path
from typing import Iterable

_COMMIT_SHA = re.compile(r"^[0-9a-f]{40}$")
_QUEUE_PREFIX = "hermes/core/queue/dev/"
_CLEANUP_PREFIX = "hermes/core/cleanup/dev/"


def route_changed_paths(paths: Iterable[str]) -> dict[str, bool]:
    """Return the job selector for changed DEV queue and cleanup files."""
    changed = tuple(paths)
    return {
        "publish": any(path.startswith(_QUEUE_PREFIX) for path in changed),
        "asset_cleanup": any(path.startswith(_CLEANUP_PREFIX) for path in changed),
    }


def changed_paths(before: str, after: str) -> list[str]:
    """Read changed paths from Git trees, not the truncated push event payload."""
    if not _COMMIT_SHA.fullmatch(before) or not _COMMIT_SHA.fullmatch(after):
        raise ValueError("HERMES_INVALID_PUSH_COMMIT")
    result = subprocess.run(
        [
            "git",
            "diff",
            "--name-only",
            "--diff-filter=AM",
            before,
            after,
            "--",
            "hermes/core/queue/dev/",
            "hermes/core/cleanup/dev/",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.splitlines()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    routes = route_changed_paths(changed_paths(args.before, args.after))
    with Path(args.output).open("a", encoding="utf-8") as stream:
        stream.write(f"publish={str(routes['publish']).lower()}\n")
        stream.write(f"asset_cleanup={str(routes['asset_cleanup']).lower()}\n")


if __name__ == "__main__":
    main()
