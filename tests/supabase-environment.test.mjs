import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../legacy/supabase-environment.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
function configFor(hostname){const window={location:{hostname}};runInNewContext(source,{window});return window.ALEA_SUPABASE_CONFIG}

describe('Cloudflare Pages Supabase environment selection',()=>{
  it('routes only the canonical production hostname to LIVE',()=>{
    const live=configFor('alea-crusaders.pages.dev');
    expect(live.name).toBe('live');
    expect(live.sessionKey).toBe('alea_supabase_session');
    expect(new URL(live.endpoint('/rest/v1/characters')).hostname).toBe(new URL(live.url).hostname);
  });
  it.each(['development.alea-crusaders.pages.dev','71a69220.alea-crusaders.pages.dev','f8d7f320.alea-crusaders.pages.dev','codex-feature.alea-crusaders.pages.dev'])('%s uses DEV for authenticated reads and writes',hostname=>{
    const dev=configFor(hostname);
    expect(dev.name).toBe('development');
    expect(dev.sessionKey).toBe('alea_supabase_session_dev');
    expect(new URL(dev.endpoint('/rest/v1/characters')).hostname).toBe(new URL(dev.url).hostname);
    expect(dev.endpoint('/rest/v1/characters')).toContain('/rest/v1/characters');
    const authenticatedWrite={method:'POST',url:dev.endpoint('/rest/v1/characters'),headers:{apikey:dev.key,Authorization:'Bearer test-user-session'}};
    expect(new URL(authenticatedWrite.url).hostname).toBe(new URL(dev.url).hostname);
    expect(authenticatedWrite.method).toBe('POST');
  });
  it('routes app auth, REST, and Storage requests through the selected project',()=>{
    expect(appSource).toContain('fetch(ALEA_SUPABASE_CONFIG.endpoint(path)');
    expect(appSource).toContain("ALEA_SUPABASE_CONFIG.endpoint('/storage/v1/'+path)");
  });
  it('uses DEV by default for unknown or local hosts',()=>{
    expect(configFor('localhost').name).toBe('development');
  });
});
