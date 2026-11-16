#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] || '');
const indexPath = join(root, 'index.html');
if (!existsSync(indexPath)) throw new Error(`LIVE Pages root is missing ${indexPath}`);

// OLYMPIA is available under /dev after the DEV tree is copied there. Remove
// every top-level LIVE copy and its navigation/iframe entry points.
for (const path of ['olympia', 'olympia-v2', 'olympia-mini']) {
  rmSync(join(root, path), { recursive: true, force: true });
}

const html = readFileSync(indexPath, 'utf8')
  // DEV uses this bootstrap to scope legacy local storage. It must never ship
  // in the shared LIVE artifact, which can contain unrelated local state.
  .replace(/<script\b(?=[^>]*\bsrc=["']\.\/dev-storage-scope\.js(?:[?#][^"']*)?["'])[^>]*>\s*<\/script>/gi, '')
  .replace(/<button\b(?=[^>]*\bdata-dev-only-tool="olympia")[^>]*>[\s\S]*?<\/button>/g, '')
  .replace(/<section\b(?=[^>]*\bdata-dev-only-tool="olympia")[^>]*>[\s\S]*?<\/section>/g, '');
if (/data-dev-only-tool="olympia"|\.\/olympia-v2\/|dev-storage-scope\.js/i.test(html)) {
  throw new Error('LIVE Pages still contains a DEV-only entry point after isolation.');
}
writeFileSync(indexPath, html);
