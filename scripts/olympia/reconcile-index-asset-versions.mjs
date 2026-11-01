import fs from 'node:fs';

function assetPath(url) {
  try {
    return new URL(url, 'https://olympia.invalid/').pathname.replace(/^\\/+/, '');
  } catch {
    return null;
  }
}

function versionParts(url) {
  const queryAt = url.indexOf('?');
  if (queryAt < 0) return null;
  const hashAt = url.indexOf('#', queryAt);
  const before = url.slice(0, queryAt);
  const query = url.slice(queryAt + 1, hashAt < 0 ? undefined : hashAt);
  const hash = hashAt < 0 ? '' : url.slice(hashAt);
  const parts = query.split('&');
  const matches = parts.map((part, index) => ({ part, index, key: part.split('=', 1)[0] }))
    .filter(entry => {
      try { return decodeURIComponent(entry.key.replace(/\\+/g, ' ')) === 'v'; } catch { return false; }
    });
  if (matches.length !== 1) return null;
  const entry = matches[0];
  const value = entry.part.includes('=') ? entry.part.slice(entry.part.indexOf('=') + 1) : '';
  let version;
  try { version = decodeURIComponent(value.replace(/\\+/g, ' ')); } catch { return null; }
  if (!version) return null;
  return { before, parts, index: entry.index, hash, version };
}

function replaceVersion(url, version) {
  const parsed = versionParts(url);
  if (!parsed) return null;
  const entry = parsed.parts[parsed.index];
  const key = entry.split('=', 1)[0];
  parsed.parts[parsed.index] = key + '=' + encodeURIComponent(version);
  return parsed.before + '?' + parsed.parts.join('&') + parsed.hash;
}

function refsFor(html, allowedPaths) {
  const allowed = new Set(allowedPaths.map(path => path.replace(/^\\.\\//, '').replace(/^\\/+/, '')));
  const refs = [];
  const tags = /<[^>]+>/g;
  let tagMatch;
  while ((tagMatch = tags.exec(html))) {
    const attrs = /\\b(href|src)\\s*=\\s*(["'])(.*?)\\2/gi;
    let attrMatch;
    while ((attrMatch = attrs.exec(tagMatch[0]))) {
      const url = attrMatch[3];
      const path = assetPath(url);
      if (!path || !allowed.has(path)) continue;
      const urlOffset = tagMatch[0].indexOf(url, attrMatch.index);
      refs.push({
        path,
        url,
        start: tagMatch.index + urlOffset,
        end: tagMatch.index + urlOffset + url.length,
      });
    }
  }
  return refs;
}

function replaceRefs(html, refs, mapper) {
  let output = html;
  for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, ref.start) + mapper(ref.url, ref.path) + output.slice(ref.end);
  }
  return output;
}

function normalized(html, paths) {
  const refs = refsFor(html, paths);
  if (!refs.length) return null;
  for (const ref of refs) if (!versionParts(ref.url)) return null;
  return replaceRefs(html, refs, url => replaceVersion(url, '__OLYMPIA_VERSION__'));
}

/**
 * Promote only cache-version changes in approved HTML asset references.
 * LIVE-specific query parameters (for example, omission of DEV's env=dev1)
 * are preserved. Any other HTML change falls back to the normal three-way
 * merge path so Git can merge non-overlapping edits or stop on real conflicts.
 */
export function reconcileIndexAssetVersions(baseHtml, sourceHtml, liveHtml, allowedAssetPaths) {
  const paths = [...new Set(allowedAssetPaths
    .filter(path => typeof path === 'string' && path !== 'index.html' && /\\.(css|js|mjs)$/.test(path))
    .map(path => path.replace(/^\\.\\//, '').replace(/^\\/+/, '')))];
  if (!paths.length || baseHtml === sourceHtml) return { handled: false, html: liveHtml };

  const normalizedBase = normalized(baseHtml, paths);
  const normalizedSource = normalized(sourceHtml, paths);
  if (normalizedBase === null || normalizedSource === null || normalizedBase !== normalizedSource) {
    return { handled: false, html: liveHtml };
  }

  const baseRefs = refsFor(baseHtml, paths);
  const sourceRefs = refsFor(sourceHtml, paths);
  const liveRefs = refsFor(liveHtml, paths);
  const changed = [];
  for (const path of paths) {
    const before = baseRefs.filter(ref => ref.path === path);
    const after = sourceRefs.filter(ref => ref.path === path);
    if (before.length !== after.length) return { handled: false, html: liveHtml };
    if (before.length > 1) return { handled: false, html: liveHtml };
    if (!before.length) continue;
    const beforeVersion = versionParts(before[0].url)?.version;
    const afterVersion = versionParts(after[0].url)?.version;
    if (!beforeVersion || !afterVersion) return { handled: false, html: liveHtml };
    if (beforeVersion !== afterVersion) changed.push({ path, version: afterVersion });
  }
  if (!changed.length) return { handled: false, html: liveHtml };

  const replacements = new Map();
  for (const change of changed) {
    const matches = liveRefs.filter(ref => ref.path === change.path);
    if (matches.length !== 1) return { handled: false, html: liveHtml };
    const url = replaceVersion(matches[0].url, change.version);
    if (!url) return { handled: false, html: liveHtml };
    replacements.set(matches[0].start, { ref: matches[0], url });
  }

  const html = replaceRefs(liveHtml, [...replacements.values()].map(entry => entry.ref),
    (_url, _path, index) => _url);
  // Apply by original byte offsets, from right to left, preserving every other LIVE byte.
  let output = liveHtml;
  for (const { ref, url } of [...replacements.values()].sort((a, b) => b.ref.start - a.ref.start)) {
    output = output.slice(0, ref.start) + url + output.slice(ref.end);
  }
  return { handled: true, html: output };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const [basePath, sourcePath, livePath, ...assetPaths] = process.argv.slice(2);
  if (!basePath || !sourcePath || !livePath || !assetPaths.length) {
    console.error('Usage: reconcile-index-asset-versions.mjs BASE SOURCE LIVE ASSET_PATH...');
    process.exit(1);
  }
  const result = reconcileIndexAssetVersions(
    fs.readFileSync(basePath, 'utf8'),
    fs.readFileSync(sourcePath, 'utf8'),
    fs.readFileSync(livePath, 'utf8'),
    assetPaths,
  );
  if (!result.handled) process.exit(2);
  fs.writeFileSync(livePath, result.html);
}
