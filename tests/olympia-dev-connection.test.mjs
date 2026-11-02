import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
const v1 = readFileSync(new URL('../olympia/zeus-control.html', import.meta.url), 'utf8');
const v2 = readFileSync(new URL('../olympia-v2/dev-approval.js', import.meta.url), 'utf8');
describe('OLYMPIA DEV session and CORS contract', () => {
  it('allows only explicit ALEA origins, with origin-specific response header', () => {
    expect(edge).toContain('https://lindkvistfoto-dot.github.io');
    expect(edge).toContain('https://development.alea-crusaders.pages.dev');
    expect(edge).toContain('ALLOWED_ORIGINS.has(origin)');
    expect(edge).toContain('response.headers.set("Access-Control-Allow-Origin", origin)');
  });
  it('keeps server-side bearer verification and Zeus restriction', () => {
    expect(edge).toContain('client.auth.getUser(bearer)');
    expect(edge).toContain('OLYMPIA_ZEUS_EMAIL');
  });
  it('V1 and V2 use the existing ALEA DEV session key', () => {
    expect(v1).toContain('alea_supabase_session_dev');
    expect(v2).toContain('alea_supabase_session_dev');
  });
});
