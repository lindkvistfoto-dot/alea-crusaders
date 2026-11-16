import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const selectorSource=read('legacy/supabase-environment.js');
const appSource=read('legacy/app.js');
const selectForHost=hostname=>{
  const window={location:{hostname}};
  runInNewContext(selectorSource,{window});
  return window.ALEA_SUPABASE_CONFIG;
};

describe('Supabase environment selection',()=>{
  it('routes Pages preview hosts to DEV with a separate session key',()=>{
    const config=selectForHost('abc123.alea-crusaders.pages.dev');
    expect(config.name).toBe('development');
    expect(config.url).toBe('https://wkiuyklzzroavclnsxna.supabase.co');
    expect(config.sessionKey).toBe('alea_supabase_session_dev');
    expect(config.endpoint('/rest/v1/example')).toBe(config.url+'/rest/v1/example');
  });

  it('keeps the canonical Pages production host on LIVE',()=>{
    const config=selectForHost('alea-crusaders.pages.dev');
    expect(config.name).toBe('live');
    expect(config.url).toBe('https://wbmosmkirsitkonejzpg.supabase.co');
    expect(config.sessionKey).toBe('alea_supabase_session');
  });

  it('keeps the actual GitHub Pages production host on LIVE',()=>{
    const config=selectForHost('lindkvistfoto-dot.github.io');
    expect(config.name).toBe('live');
    expect(config.url).toBe('https://wbmosmkirsitkonejzpg.supabase.co');
    expect(config.sessionKey).toBe('alea_supabase_session');
  });

  it('uses one selected endpoint for Auth, REST, and Storage',()=>{
    const config=selectForHost('abc123.alea-crusaders.pages.dev');
    expect(config.endpoint('/auth/v1/token?grant_type=password')).toBe(config.url+'/auth/v1/token?grant_type=password');
    expect(config.endpoint('/rest/v1/example')).toBe(config.url+'/rest/v1/example');
    expect(config.endpoint('/storage/v1/object/example/file.webp')).toBe(config.url+'/storage/v1/object/example/file.webp');
    expect(appSource.split('ALEA_SUPABASE_CONFIG.endpoint(path)').length-1).toBe(2);
    expect(appSource.split("ALEA_SUPABASE_CONFIG.endpoint('/storage/v1/'+path)").length-1).toBe(2);
  });

  it('sends an authenticated write from a preview host to DEV',async()=>{
    const config=selectForHost('abc123.alea-crusaders.pages.dev');
    const begin=appSource.indexOf('/* v0.35.69 — keep the JWT fresh');
    const end=appSource.indexOf('async function loadProfile()',begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const code=appSource.slice(begin,end);
    const calls=[];
    const expiry=Math.floor(Date.now()/1000)+3600;
    const token='header.'+Buffer.from(JSON.stringify({exp:expiry})).toString('base64url')+'.signature';
    const scope={
      ALEA_SUPABASE_CONFIG:config,
      SUPABASE_KEY:config.key,
      supabaseSession:{access_token:token,refresh_token:'refresh',expires_at:expiry,user:{id:'user1'}},
      fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200};},
      atob:value=>Buffer.from(value,'base64').toString('utf8'),
    };
    scope.storeSession=value=>{scope.supabaseSession=value;};
    runInNewContext(code+';globalThis.api={authFetch};',scope);
    await scope.api.authFetch('/auth/v1/token?grant_type=password',{method:'POST',body:'{}'});
    await scope.api.authFetch('/rest/v1/example',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'});
    expect(calls.map(call=>call.url)).toEqual([
      config.url+'/auth/v1/token?grant_type=password',
      config.url+'/rest/v1/example'
    ]);
    expect(calls.every(call=>call.options.method==='POST')).toBe(true);
  });
});
