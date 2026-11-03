#!/usr/bin/env python3
"""Select MINOTAURUS test groups from changed repository paths.

The selector is deliberately conservative around CI/configuration, database,
publisher and package changes. Unknown application/UI paths do not select the
legacy HERMES 4 test group; existing application CI remains responsible for
their normal verification.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import PurePosixPath

VITEST_GROUPS = {
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
ALL_VITEST = set().union(*VITEST_GROUPS.values())

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
    "tests/hermes4-batch-publisher.test.mjs",
    "tests/hermes-system-assets-publisher.test.mjs",
    "tests/minotaurus-publisher.test.mjs",
    "tests/hermes-wide-publisher.test.mjs",
    "tests/hermes-spell-cutout-profile.test.js",
    "config/hermes-system-assets.json",
}

ARCANE_FILES = {
    "features/ui/arcane-paper-doll-assets.js",
    "features/ui/arcane-paper-doll-workshop.js",
    "tests/arcane-paper-doll-assets.test.js",
    "tests/arcane-system-assets-rls.test.mjs",
    "tests/arcane-gallery-release-smoke.test.js",
    "tests/arcane-morph-art-assets.test.js",
}
ARCANE_PREFIXES = (
    "features/trophy-room/",
    "features/honors/",
    "src/honors/",
    "features/ui/arcane-paper-doll-",
    "features/ui/arcane-morph-",
)
V2_FILES = {
    "features/combat/hermes2.js",
    "features/combat/admin-symbols.js",
    "features/combat/spell-art.js",
    "features/combat/runtime.js",
    "tests/hermes-v2-gates.test.mjs",
}


def select(changed_paths: list[str]) -> dict[str, object]:
    paths = {PurePosixPath(p).as_posix().removeprefix("./") for p in changed_paths}
    full = any(
        p in {
            ".github/workflows/minotaurus-guard.yml",
            "scripts/minotaurus_select.py",
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
        or p.startswith(".github/workflows/")
        or p.startswith("tests/helpers/")
        or p.startswith("supabase/")
        or p.startswith("config/")
        for p in paths
    )

    selected: set[str] = set(ALL_VITEST) if full else set()
    legacy = full or any(
        p in LEGACY_FILES
        or p.startswith(LEGACY_PREFIXES)
        or (p.startswith("tests/test_hermes4") and p.endswith(".py"))
        for p in paths
    )
    if legacy:
        selected.update(VITEST_GROUPS["legacy"])

    arcane = full or bool(paths & ARCANE_FILES) or any(
        p.startswith(ARCANE_PREFIXES) for p in paths
    )
    if arcane:
        selected.update(VITEST_GROUPS["arcane"])

    v2 = full or bool(paths & V2_FILES) or any(
        p.startswith("supabase/functions/hermes-v2/") for p in paths
    )
    if v2:
        selected.update(VITEST_GROUPS["v2"])

    hermes4_python = legacy
    web_worker_python = legacy and any(
        p in {
            "scripts/hermes_web_worker.py",
            "tests/test_hermes_web_worker.py",
            ".github/workflows/hermes-web-intake.yml",
            ".github/workflows/hermes41-single-pilot.yml",
            ".github/workflows/hermes41-isolated-tests.yml",
            ".github/workflows/hermes41-small-tests.yml",
        }
        for p in paths
    )

    return {
        "full": full,
        "hermes4_python": hermes4_python,
        "web_worker_python": web_worker_python,
        "vitest_files": " ".join(sorted(selected)),
        "deno_hermes2": full or legacy,
        "deno_hermes_v2": full or v2,
    }


def changed_paths(base: str, head: str) -> list[str]:
    if not base or not head or set(base) == {"0"}:
        raise ValueError("BASE and HEAD must identify real commits")
    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRD", base, head],
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
