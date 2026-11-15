#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function parsePatch(text) {
  const files = new Map();
  let path = null;
  let hunks = null;
  let sawPatch = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (!match || match[1] !== match[2]) throw new Error('Unparseable diff file header');
      path = match[1];
      hunks = [];
      files.set(path, hunks);
      sawPatch = true;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const match = line.match(/^\+\+\+ b\/(.+)$/);
      if (!match) throw new Error('Unparseable patch path');
      path = match[1];
      if (!files.has(path)) files.set(path, []);
      hunks = files.get(path);
      sawPatch = true;
      continue;
    }
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (!match || !hunks) throw new Error('Unparseable patch hunk');
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count)) throw new Error('Invalid patch range');
      hunks.push({ start, end: count === 0 ? start : start + count - 1, insertion: count === 0 });
    }
  }
  if (!sawPatch) throw new Error('Patch is empty or unavailable');
  for (const ranges of files.values()) if (ranges.length === 0) throw new Error('Patch has a file without hunks');
  return files;
}

function overlaps(leftText, rightText) {
  const left = parsePatch(leftText);
  const right = parsePatch(rightText);
  for (const [path, ranges] of left) {
    const other = right.get(path);
    if (!other) continue;
    for (const a of ranges) for (const b of other) {
      if (a.insertion || b.insertion) {
        const point = a.insertion ? a.start : b.start;
        const region = a.insertion ? b : a;
        if (point >= region.start - 1 && point <= region.end + 1) return true;
      } else if (a.start <= b.end && b.start <= a.end) return true;
    }
  }
  return false;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 4) {
    console.error('Usage: patch-hunks-overlap.mjs <approved-patch> <later-patch>');
    process.exit(3);
  }
  try {
    process.exit(overlaps(readFileSync(process.argv[2], 'utf8'), readFileSync(process.argv[3], 'utf8')) ? 2 : 0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(3);
  }
}

export { overlaps, parsePatch };
