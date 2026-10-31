import {describe,expect,it} from 'vitest';
import {resolveHermesPublicationEnvironment} from '../scripts/hermes_publication_environment.js';

const repository='lindkvistfoto-dot/alea-crusaders';
const dev={repository,ref:'refs/heads/development',targetEnv:'DEV',url:'https://wkiuyklzzroavclnsxna.supabase.co'};
const live={repository,ref:'refs/heads/main',targetEnv:'LIVE',url:'https://wbmosmkirsitkonejzpg.supabase.co'};

describe('HERMES CORE publication environment guard',()=>{
  it('selects DEV only for development with the exact DEV endpoint',()=>{
    expect(resolveHermesPublicationEnvironment(dev)).toBe('DEV');
  });
  it('keeps LIVE separate and explicit',()=>{
    expect(resolveHermesPublicationEnvironment(live)).toBe('LIVE');
  });
  it('rejects missing environment, URL drift, and untrusted refs without fallback',()=>{
    expect(()=>resolveHermesPublicationEnvironment({...dev,targetEnv:''})).toThrow('HERMES_TARGET_ENV_MISMATCH');
    expect(()=>resolveHermesPublicationEnvironment({...dev,url:live.url})).toThrow('HERMES_SUPABASE_URL_MISMATCH');
    expect(()=>resolveHermesPublicationEnvironment({...dev,ref:'refs/heads/feature'})).toThrow('UNTRUSTED_CORE_ACTION');
    expect(()=>resolveHermesPublicationEnvironment({...dev,repository:'attacker/alea-crusaders'})).toThrow('UNTRUSTED_CORE_ACTION');
  });
});
