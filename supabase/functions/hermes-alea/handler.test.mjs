import {describe,expect,it} from 'vitest';
import {createVerifyHandler} from './handler.mjs';

const DEV_URL='https://wkiuyklzzroavclnsxna.supabase.co';
const envFor=(values={})=>key=>values[key]??(key==='SUPABASE_URL'?DEV_URL:'');

describe('HERMES ALEA CORS preflight',()=>{
  it.each([
    'https://alea-crusaders.pages.dev',
    'https://commit.alea-crusaders.pages.dev',
    'https://branch.commit.alea-crusaders.pages.dev',
  ])('accepts the DEV Pages project origin %s',async origin=>{
    const handler=createVerifyHandler({env:envFor(),decode:async()=>new Uint8Array()});
    const response=await handler(new Request('https://supabase.test/functions/v1/hermes-alea',{
      method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'},
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
  });

  it('rejects lookalike Pages tenants and unrelated sites',async()=>{
    const handler=createVerifyHandler({env:envFor(),decode:async()=>new Uint8Array()});
    for(const origin of [
      'https://alea-crusaders.pages.dev.attacker.example',
      'https://another-project.pages.dev',
      'http://branch.alea-crusaders.pages.dev',
    ]){
      const response=await handler(new Request('https://supabase.test/functions/v1/hermes-alea',{
        method:'OPTIONS',headers:{Origin:origin},
      }));
      expect(response.status,origin).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Origin'),origin).toBe('null');
    }
  });

  it('does not grant the DEV Pages exception to another Supabase project',async()=>{
    const handler=createVerifyHandler({
      env:envFor({SUPABASE_URL:'https://production-project.supabase.co'}),
      decode:async()=>new Uint8Array(),
    });
    const response=await handler(new Request('https://supabase.test/functions/v1/hermes-alea',{
      method:'OPTIONS',headers:{Origin:'https://branch.alea-crusaders.pages.dev'},
    }));
    expect(response.status).toBe(403);
  });

  it('allows an explicitly configured canonical origin',async()=>{
    const origin='https://alea.example.org';
    const handler=createVerifyHandler({
      env:envFor({HERMES_ALEA_ALLOWED_ORIGINS:origin}),
      decode:async()=>new Uint8Array(),
    });
    const response=await handler(new Request('https://supabase.test/functions/v1/hermes-alea',{
      method:'OPTIONS',headers:{Origin:origin},
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  });
});
