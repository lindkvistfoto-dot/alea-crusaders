import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {reconcileIndexAssetVersions} from './reconcile-index-asset-versions.mjs';

function publicWindowAssignments(source) {
  return new Set([...source.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1]));
}

export function reconcileChronicleSessions(base, source, live) {
  if (source === base) return {handled: false, text: live, reason: 'no-source-change'};

  const liveExports = publicWindowAssignments(live);
  const sourceExports = publicWindowAssignments(source);
  const missingExports = [...liveExports].filter(name => !sourceExports.has(name));
  if (missingExports.length) return {handled: false, text: live, reason: 'public-api-loss'};

  const required = [
    'aleaSetCampaignDayNumber',
    'aleaSaveArcaneWeather',
    'aleaStartNextWorldDay',
    'aleaApplyCampaignRest',
    'aleaSessionHistory',
    'aleaSessionParticipants',
  ];
  const missingFeatures = required.filter(name => !sourceExports.has(name));
  if (missingFeatures.length) return {handled: false, text: live, reason: 'incomplete-chronicle-source'};

  const oldPausedLabel = "btn.textContent=activeGameSession?'🎲 Spelmöte · Pågår':'🎲 Spelmöte';";
  const pausedLabel = "btn.textContent=activeGameSession?(activeGameSession.status==='paused'?'⏸ Spelmöte':'🎲 Spelmöte · Pågår'):'🎲 Spelmöte';";
  if (!source.includes(oldPausedLabel)) return {handled: false, text: live, reason: 'unexpected-button-renderer'};

  // Preserve the paused indicator from the LIVE implementation while promoting
  // the reviewed Chronicle V2 module and its existing public browser API.
  return {handled: true, text: source.replace(oldPausedLabel, pausedLabel)};
}

function extractUnique(html, regex) {
  const matches = [...html.matchAll(regex)];
  return matches.length === 1 ? matches[0][0] : null;
}

function replaceUnique(html, before, after) {
  if (!before || html.split(before).length !== 2) return null;
  return html.replace(before, after);
}

export function reconcileChronicleIndex(base, source, live, assetPaths) {
  const baseButton = extractUnique(base, /<button\b[^>]*\bid="campaignTimeBtn"[^>]*>[\s\S]*?<\/button>/g);
  const sourceButton = extractUnique(source, /<button\b[^>]*\bid="campaignTimeBtn"[^>]*>[\s\S]*?<\/button>/g);
  const liveButton = extractUnique(live, /<button\b[^>]*\bid="campaignTimeBtn"[^>]*>[\s\S]*?<\/button>/g);
  const baseMenu = extractUnique(base, /<div\b[^>]*\bid="campaignTimeMenu"[^>]*>[\s\S]*?<\/div>/g);
  const sourceMenu = extractUnique(source, /<div\b[^>]*\bid="campaignTimeMenu"[^>]*>[\s\S]*?<\/div>/g);
  const liveMenu = extractUnique(live, /<div\b[^>]*\bid="campaignTimeMenu"[^>]*>[\s\S]*?<\/div>/g);
  const baseTitle = extractUnique(base, /<h2\b[^>]*\bid="campaignDayTitle"[^>]*>[\s\S]*?<\/h2>/g);
  const sourceTitle = extractUnique(source, /<h2\b[^>]*\bid="campaignDayTitle"[^>]*>[\s\S]*?<\/h2>/g);
  const liveTitle = extractUnique(live, /<h2\b[^>]*\bid="campaignDayTitle"[^>]*>[\s\S]*?<\/h2>/g);
  if (![baseButton, sourceButton, liveButton, baseMenu, sourceMenu, liveMenu, baseTitle, sourceTitle, liveTitle].every(Boolean)) {
    return {handled: false, html: live, reason: 'time-controls-not-unique'};
  }
  if (liveButton !== baseButton || liveMenu !== baseMenu || liveTitle !== baseTitle) {
    return {handled: false, html: live, reason: 'live-chronicle-controls-also-changed'};
  }

  const expectedButton = baseButton
    .replace('title="Tid på dygnet"', 'title="Dygnsfas"')
    .replace('>🌤️ Morgon</button>', '>🌤️ Förmiddag</button>');
  const expectedMenu = baseMenu.replace('aria-label="Välj tid på dygnet"', 'aria-label="Öppna Spelmöte"');
  const expectedTitle = baseTitle.replace('>Dag & väder</h2>', '>Spelmöte</h2>');
  if (sourceButton !== expectedButton || sourceMenu !== expectedMenu || sourceTitle !== expectedTitle) {
    return {handled: false, html: live, reason: 'unexpected-time-control-edit'};
  }

  const maskedBase = replaceUnique(replaceUnique(base, baseButton, '__OLYMPIA_CAMPAIGN_TIME_BUTTON__'), baseMenu, '__OLYMPIA_CAMPAIGN_TIME_MENU__');
  const maskedSource = replaceUnique(replaceUnique(replaceUnique(source, sourceButton, '__OLYMPIA_CAMPAIGN_TIME_BUTTON__'), sourceMenu, '__OLYMPIA_CAMPAIGN_TIME_MENU__'), sourceTitle, '__OLYMPIA_CAMPAIGN_DAY_TITLE__');
  const finalBase = replaceUnique(maskedBase, baseTitle, '__OLYMPIA_CAMPAIGN_DAY_TITLE__');
  if (finalBase === null || maskedSource === null) return {handled: false, html: live, reason: 'mask-failed'};

  const cache = reconcileIndexAssetVersions(finalBase, maskedSource, live, assetPaths);
  if (!cache.handled) return {handled: false, html: live, reason: 'unapproved-index-change'};
  const withButton = replaceUnique(cache.html, baseButton, sourceButton);
  const withMenu = withButton && replaceUnique(withButton, baseMenu, sourceMenu);
  const result = withMenu && replaceUnique(withMenu, baseTitle, sourceTitle);
  if (!result) return {handled: false, html: live, reason: 'live-markup-replacement-failed'};
  return {handled: true, html: result};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, basePath, sourcePath, livePath, ...assetPaths] = process.argv.slice(2);
  if (!['sessions', 'index'].includes(mode) || !basePath || !sourcePath || !livePath) {
    console.error('Usage: reconcile-chronicle-live-conflicts.mjs sessions|index BASE SOURCE LIVE [ASSET_PATH...]');
    process.exit(1);
  }
  const base = fs.readFileSync(basePath, 'utf8');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const live = fs.readFileSync(livePath, 'utf8');
  const result = mode === 'sessions'
    ? reconcileChronicleSessions(base, source, live)
    : reconcileChronicleIndex(base, source, live, assetPaths);
  if (!result.handled) {
    console.error(`Unresolved ${mode} conflict: ${result.reason}.`);
    process.exit(2);
  }
  fs.writeFileSync(livePath, mode === 'sessions' ? result.text : result.html);
}
