import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function assetPath(url) {
  try {
    return new URL(url, 'https://olympia.invalid/').pathname.replace(/^\/+/, '');
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
      try { return decodeURIComponent(entry.key.replace(/\+/g, ' ')) === 'v'; } catch { return false; }
    });
  if (matches.length !== 1) return null;
  const entry = matches[0];
  const value = entry.part.includes('=') ? entry.part.slice(entry.part.indexOf('=') + 1) : '';
  let version;
  try { version = decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return null; }
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
  const allowed = new Set(allowedPaths.map(path => path.replace(/^\.\//, '').replace(/^\/+/, '')));
  const refs = [];
  const tags = /<[^>]+>/g;
  let tagMatch;
  while ((tagMatch = tags.exec(html))) {
    const attrs = /\b(href|src)\s*=\s*(["'])(.*?)\2/gi;
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
 * are preserved. Any other HTML change falls back to Git three-way merge.
 */
export function reconcileIndexAssetVersions(baseHtml, sourceHtml, liveHtml, allowedAssetPaths) {
  const paths = [...new Set(allowedAssetPaths
    .filter(path => typeof path === 'string' && path !== 'index.html' && /\.(css|js|mjs)$/.test(path))
    .map(path => path.replace(/^\.\//, '').replace(/^\/+/, '')))];
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
    if (before.length !== after.length || before.length > 1) return { handled: false, html: liveHtml };
    if (!before.length) continue;
    const beforeVersion = versionParts(before[0].url)?.version;
    const afterVersion = versionParts(after[0].url)?.version;
    if (!beforeVersion || !afterVersion) return { handled: false, html: liveHtml };
    if (beforeVersion !== afterVersion) changed.push({ path, version: afterVersion });
  }
  if (!changed.length) return { handled: false, html: liveHtml };

  const replacements = [];
  for (const change of changed) {
    const matches = liveRefs.filter(ref => ref.path === change.path);
    if (matches.length !== 1) return { handled: false, html: liveHtml };
    const url = replaceVersion(matches[0].url, change.version);
    if (!url) return { handled: false, html: liveHtml };
    replacements.push({ ref: matches[0], url });
  }

  let output = liveHtml;
  for (const { ref, url } of replacements.sort((a, b) => b.ref.start - a.ref.start)) {
    output = output.slice(0, ref.start) + url + output.slice(ref.end);
  }
  return { handled: true, html: output };
}


// Carry only the approved Trofé room markup into LIVE. The complete DEV
// index is intentionally never merged: retain every LIVE-specific setting.
export function reconcileTrophy556(baseHtml, sourceHtml, liveHtml, currentDevHtml) {
  const welcome = 'Välkommen till Alea Crusaders';
  const debug = 'Välkommen <a href="?view=trophy-room" onclick="event.preventDefault(); window.openTrophyRoom?.()" aria-label="Öppna Troférummet">222</a> till Alea Crusaders';
  const medalWall = '<div id="trophyRoomMedalWall" class="trophy-room-medal-wall" aria-label="Medaljvägg" hidden></div>';
  const badgeWall = '<div id="trophyRoomBadgeWall" class="trophy-room-badge-wall" aria-label="Högra väggen: badges i 3 gånger 3" hidden></div>';
  const toolbarAnchor = '<button class="btn" type="button" onclick="trophyRoomReset()">Centrera</button>';
  const controls = '<button class="btn" id="trophyBadgeCalibrate" type="button" hidden onclick="trophyBadgeCalibrate()">Kalibrera badgevägg</button><button class="btn" id="trophyBadgeExport" type="button" onclick="trophyBadgeExport()">Kopiera koordinater</button><textarea id="trophyBadgeExportResult" hidden readonly aria-label="Sparade badgekoordinater" rows="3" style="width:100%;font-size:12px"></textarea>';
  const exactlyOnce = (html, part) => html.split(part).length === 2;

  if (![baseHtml, sourceHtml, liveHtml, currentDevHtml].every(html => exactlyOnce(html, medalWall) && exactlyOnce(html, toolbarAnchor))) {
    return { handled: false, html: liveHtml };
  }
  if (!exactlyOnce(sourceHtml, debug) || !exactlyOnce(baseHtml, welcome) || !exactlyOnce(liveHtml, welcome) || !exactlyOnce(currentDevHtml, welcome)) {
    return { handled: false, html: liveHtml };
  }
  if (!exactlyOnce(sourceHtml, medalWall + badgeWall) || !exactlyOnce(currentDevHtml, medalWall + badgeWall)) {
    return { handled: false, html: liveHtml };
  }
  if (baseHtml.includes(badgeWall) || liveHtml.includes(badgeWall) || currentDevHtml.includes(debug) ||
      baseHtml.includes(controls) || liveHtml.includes(controls)) {
    return { handled: false, html: liveHtml };
  }

  // The accepted source PR must contain only the temporary debug link and these
  // four required badge-wall elements. Any additional index edit remains blocked.
  const normalizedSource = sourceHtml
    .replace(debug, welcome)
    .replace(medalWall + badgeWall, medalWall)
    .replace(toolbarAnchor + controls, toolbarAnchor);
  if (normalizedSource !== baseHtml) return { handled: false, html: liveHtml };

  const html = liveHtml
    .replace(medalWall, medalWall + badgeWall)
    .replace(toolbarAnchor, toolbarAnchor + controls);
  return { handled: true, html };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [basePath, sourcePath, livePath, ...assetPaths] = process.argv.slice(2);
  if(assetPaths[0]==='--trophy-556'){
    const currentDevPath=assetPaths[1];
    if(!currentDevPath)process.exit(1);
    const result=reconcileTrophy556(fs.readFileSync(basePath,'utf8'),fs.readFileSync(sourcePath,'utf8'),fs.readFileSync(livePath,'utf8'),fs.readFileSync(currentDevPath,'utf8'));
    if(!result.handled)process.exit(2);
    fs.writeFileSync(livePath,result.html);
    process.exit(0);
  }
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
