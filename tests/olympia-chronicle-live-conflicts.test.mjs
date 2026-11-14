import {describe, expect, it} from 'vitest';
import {reconcileChronicleIndex, reconcileChronicleSessions} from '../scripts/olympia/reconcile-chronicle-live-conflicts.mjs';

const liveSessions = `window.aleaCurrentGameSessionId=null;
window.aleaGetActiveGameSessionId=async function(){};
window.openGameSessionPanel=function(){};
window.closeGameSessionPanel=function(){};`;
const sourceSessions = `window.aleaCurrentGameSessionId=null;
window.aleaGetActiveGameSessionId=async function(){};
window.openGameSessionPanel=function(){};
window.closeGameSessionPanel=function(){};
window.aleaSetCampaignDayNumber=function(){};
window.aleaSaveArcaneWeather=function(){};
window.aleaStartNextWorldDay=function(){};
window.aleaApplyCampaignRest=function(){};
window.aleaSessionHistory=[];
window.aleaSessionParticipants=[];
function renderButton(){
 btn.textContent=activeGameSession?'🎲 Spelmöte · Pågår':'🎲 Spelmöte';
}`;

const sessionBase = `window.aleaCurrentGameSessionId=null;
window.aleaGetActiveGameSessionId=async function(){};
window.openGameSessionPanel=function(){};
window.closeGameSessionPanel=function(){};`;

const css = 'features/chronicle/sessions.css';
const js = 'features/chronicle/sessions.js';
const app = 'legacy/app.js';
const index = (cssVersion, jsVersion, title, buttonText, menuLabel, liveExtra = '') =>
  `<!doctype html><html><head><link rel="stylesheet" href="./${css}?v=${cssVersion}"></head><body>`+
  `<button id="campaignTimeBtn" title="${title}">${buttonText}</button>`+
  `<div id="campaignTimeMenu" aria-label="${menuLabel}"></div>`+
  `<h2 id="campaignDayTitle">${title === 'Dygnsfas' ? 'Spelmöte' : 'Dag & väder'}</h2>`+
  `<script src="./${js}?v=${jsVersion}"></script><script src="./${app}?v=${jsVersion}"></script>${liveExtra}</body></html>`;

describe('OLYMPIA Spelmöte LIVE conflict reconciliation', () => {
  it('promotes the reviewed V2 panel while retaining the old public browser API and paused indicator', () => {
    const result = reconcileChronicleSessions(sessionBase, sourceSessions, liveSessions);
    expect(result.handled).toBe(true);
    expect(result.text).toContain("activeGameSession.status==='paused'?'⏸ Spelmöte'");
    for (const api of ['aleaCurrentGameSessionId', 'aleaGetActiveGameSessionId', 'openGameSessionPanel', 'closeGameSessionPanel']) {
      expect(result.text).toContain(`window.${api}=`);
    }
  });

  it('stops if the DEV module would drop a LIVE-only public API', () => {
    const result = reconcileChronicleSessions(sessionBase, sourceSessions.replace('window.closeGameSessionPanel=function(){};\n', ''), liveSessions);
    expect(result.handled).toBe(false);
    expect(result.reason).toBe('public-api-loss');
  });

  it('merges the Spelmöte labels and cache bumps without rewriting unrelated LIVE markup', () => {
    const base = index('20261029-1', '20261029-1', 'Tid på dygnet', '🌤️ Morgon', 'Välj tid på dygnet', '&env=dev1');
    const source = index('20261112-arcane-spelmoete-1', '20261112-arcane-spelmoete-1', 'Dygnsfas', '🌤️ Förmiddag', 'Öppna Spelmöte', '&env=dev1');
    const live = index('live-css', 'live-js', 'Tid på dygnet', '🌤️ Morgon', 'Välj tid på dygnet', '<p>LIVE-only markup</p>');
    const result = reconcileChronicleIndex(base, source, live, [css, js, app, 'index.html']);
    expect(result.handled).toBe(true);
    expect(result.html).toContain('./' + css + '?v=20261112-arcane-spelmoete-1');
    expect(result.html).toContain('./' + js + '?v=20261112-arcane-spelmoete-1');
    expect(result.html).toContain('title="Dygnsfas">🌤️ Förmiddag');
    expect(result.html).toContain('aria-label="Öppna Spelmöte"');
    expect(result.html).toContain('<h2 id="campaignDayTitle">Spelmöte</h2>');
    expect(result.html).toContain('./' + app + '?v=20261112-arcane-spelmoete-1');
    expect(result.html).toContain('LIVE-only markup');
  });

  it('stops if LIVE has independently changed the same campaign time controls', () => {
    const base = index('old-css', 'old-js', 'Tid på dygnet', '🌤️ Morgon', 'Välj tid på dygnet');
    const source = index('new-css', 'new-js', 'Dygnsfas', '🌤️ Förmiddag', 'Öppna Spelmöte');
    const live = index('live-css', 'live-js', 'LIVE time', '🌤️ Morgen', 'LIVE menu');
    expect(reconcileChronicleIndex(base, source, live, [css, js, app]).handled).toBe(false);
  });
});
