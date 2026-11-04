#!/usr/bin/env python3
"""Conservatively select focused MINOTAURUS checks from changed repository paths.

Known ordinary application UI paths are covered by required CI and do not start
legacy HERMES environments. Shared/test/workflow/config changes and unknown
paths select every focused MINOTAURUS check.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import PurePosixPath

VITEST = {
    "legacy": {
        "tests/minotaurus-publisher.test.mjs",
        "tests/hermes4-batch-publisher.test.mjs",
        "tests/hermes-system-assets-publisher.test.mjs",
        "tests/hermes-wide-publisher.test.mjs",
        "tests/hermes-spell-cutout-profile.test.js",
    },
    "arcane": {
        "tests/arcane-paper-doll-assets.test.js",
        "tests/arcane-system-assets-rls.test.mjs",
        "tests/arcane-gallery-release-smoke.test.js",
        "tests/arcane-morph-art-assets.test.js",
    },
    "v2": {"tests/hermes-v2-gates.test.mjs"},
}
ALL_VITEST = set().union(*VITEST.values())

LEGACY_PREFIXES = ("hermes/queue/", "hermes/system-assets/")
LEGACY_FILES = {
    ".github/workflows/hermes-drive-intake.yml",
    ".github/workflows/hermes-web-intake.yml",
    ".github/workflows/hermes41-single-pilot.yml",
    ".github/workflows/hermes41-isolated-tests.yml",
    ".github/workflows/hermes41-small-tests.yml",
    "scripts/hermes_drive_intake.py",
    "scripts/hermes_web_worker.py",
    "scripts/hermes2_prepare.py",
    "scripts/hermes2_publish.ts",
    "scripts/hermes2_asset_profiles.ts",
    "scripts/hermes_system_assets.py",
    "tests/test_minotaurus_direct.py",
    "tests/test_hermes_web_worker.py",
    "config/hermes-system-assets.json",
    *VITEST["legacy"],
}
ARCANE_PREFIXES = (
    "features/trophy-room/",
    "features/honors/",
    "src/honors/",
    "features/ui/arcane-paper-doll-",
    "features/ui/arcane-morph-",
)
ARCANE_FILES = {
    "features/ui/arcane-paper-doll-assets.js",
    "features/ui/arcane-paper-doll-workshop.js",
    *VITEST["arcane"],
}
V2_FILES = {
    "features/combat/hermes2.js",
    "features/combat/admin-symbols.js",
    "features/combat/spell-art.js",
    "features/combat/runtime.js",
    *VITEST["v2"],
}
FULL_FILES = {
    "scripts/minotaurus_select.py",
    "scripts/minotaurus_guard.py",
    "tests/test_minotaurus_select.py",
    "package.json",
    "package-lock.json",
    "vitest.config.js",
    "vitest.config.mjs",
    "vitest.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.ts",
}
SAFE_APP_PREFIXES = (
    "features/ui/",
    "features/combat/",
    "features/material/",
    "features/hermes-core/",
    "features/trophy-room/",
    "features/honors/",
    "src/honors/",
)


def _normalize(path: str) -> str:
    return PurePosixPath(path).as_posix().removeprefix("./")


def select(changed_paths: list[str]) -> dict[str, object]:
    paths = {_normalize(path) for path in changed_paths}
    full = any(
        path in FULL_FILES
        or path.startswith((".github/workflows/", "tests/helpers/", "supabase/", "config/"))
        for path in paths
    )

    legacy = full or any(
        path in LEGACY_FILES
        or path.startswith(LEGACY_PREFIXES)
        or (path.startswith("tests/test_hermes4") and path.endswith(".py"))
        for path in paths
    )
    arcane = full or bool(paths & ARCANE_FILES) or any(
        path.startswith(ARCANE_PREFIXES) for path in paths
    )
    v2 = full or bool(paths & V2_FILES) or any(
        path.startswith("supabase/functions/hermes-v2/") for path in paths
    )

    unknown = any(
        not (
            path.startswith(SAFE_APP_PREFIXES)
            or path.startswith(("hermes/queue/", "hermes/system-assets/"))
            or path in LEGACY_FILES | ARCANE_FILES | V2_FILES
        )
        for path in paths
    )
    # A path we cannot classify must never silently reduce coverage.
    full = full or unknown
    if full:
        legacy = arcane = v2 = True

    web_worker = legacy and any(
        path in {
            "scripts/hermes_web_worker.py",
            "tests/test_hermes_web_worker.py",
            ".github/workflows/hermes-web-intake.yml",
            ".github/workflows/hermes41-single-pilot.yml",
            ".github/workflows/hermes41-isolated-tests.yml",
            ".github/workflows/hermes41-small-tests.yml",
        }
        for path in paths
    )
    return {
        "full": full,
        "hermes4_python": legacy,
        "web_worker_python": web_worker,
        "vitest_files": " ".join(sorted(
            (VITEST["legacy"] if legacy else set())
            | (VITEST["arcane"] if arcane else set())
            | (VITEST["v2"] if v2 else set())
        )),
        "deno_hermes2": legacy,
        "deno_hermes_v2": v2,
    }


def changed_paths(base: str, head: str) -> list[str]:
    if not base or not head or set(base) == {"0"}:
        raise ValueError("BASE and HEAD must identify real commits")
    result = subprocess.run(
        ["git", "diff", "--no-renames", "--name-only", "--diff-filter=ACMRD", base, head],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.splitlines()


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: minotaurus_select.py BASE HEAD")
    paths = changed_paths(sys.argv[1], sys.argv[2])
    result = select(paths)
    print("Changed paths:", ", ".join(paths) if paths else "(none)", file=sys.stderr)
    for key, value in result.items():
        print(f"{key}={str(value).lower() if isinstance(value, bool) else value}")


if __name__ == "__main__":
    main()
