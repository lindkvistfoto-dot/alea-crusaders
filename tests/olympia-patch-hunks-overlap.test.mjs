import { describe, expect, it } from 'vitest';
import { overlaps, parsePatch } from '../scripts/olympia/patch-hunks-overlap.mjs';

const patch = (path, hunk) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${hunk}\n`;

describe('OLYMPIA accepted patch freshness', () => {
  it('allows disjoint hunks in the same file', () => {
    expect(overlaps(patch('index.html', '@@ -470,1 +470,1 @@\n-old\n+new'), patch('index.html', '@@ -479,1 +479,1 @@\n-old2\n+new2'))).toBe(false);
  });
  it('blocks overlapping hunks in the same file', () => {
    expect(overlaps(patch('index.html', '@@ -470,2 +470,2 @@\n-a\n+b'), patch('index.html', '@@ -471,1 +471,1 @@\n-c\n+d'))).toBe(true);
  });
  it('does not confuse changes in different files', () => {
    expect(overlaps(patch('index.html', '@@ -10,1 +10,1 @@\n-a\n+b'), patch('sessions.js', '@@ -10,1 +10,1 @@\n-c\n+d'))).toBe(false);
  });
  it('fails closed when patch ranges are missing', () => {
    expect(() => parsePatch('diff --git a/index.html b/index.html\n')).toThrow();
  });
});
