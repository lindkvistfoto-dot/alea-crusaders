import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

const source = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
const ghStart = source.indexOf('async function gh(');
const retryStart = source.indexOf('async function ghReadWithRetry(', ghStart);
const retryEnd = source.indexOf('\nfunction isTransientCandidateReadError(', retryStart);
const ghCode = source.slice(ghStart, retryStart)
  .replace('async function gh(token: string, path: string, init: RequestInit = {})', 'async function gh(token, path, init = {})')
  .replace('let res: Response;', 'let res;');
const retryCode = source.slice(retryStart, retryEnd)
  .replace('async function ghReadWithRetry(token: string, path: string, maxRetries = 2)', 'async function ghReadWithRetry(token, path, maxRetries = 2)');
if (!ghCode || !retryCode) throw new Error('GitHub read helpers not found');

function helpers(fetchMock, waits = []) {
  const gh = new Function('fetch', 'console', `${ghCode}; return gh;`)(fetchMock, { error: vi.fn() });
  const ghReadWithRetry = new Function('gh', 'Date', 'setTimeout', `${retryCode}; return ghReadWithRetry;`)(
    gh, Date, (callback, ms) => { waits.push(ms); callback(); return 0; },
  );
  return { gh, ghReadWithRetry };
}

function response(status, message, headers = {}) {
  return new Response(JSON.stringify({ message }), { status, headers });
}

describe('OLYMPIA authenticated GitHub CI read recovery', () => {
  it.each([403, 422])('does not retry permanent HTTP %i responses', async (status) => {
    const fetchMock = vi.fn(async () => response(status, 'denied'));
    const waits = [];
    const { ghReadWithRetry } = helpers(fetchMock, waits);
    await expect(ghReadWithRetry('app-token', '/repos/o/r/commits/sha/check-runs')).rejects.toThrow(`GITHUB_REQUEST_FAILED_${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('fails closed on a rate-limited 403 without retrying before reset', async () => {
    const fetchMock = vi.fn(async () => response(403, 'API rate limit exceeded', {
      'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
    }));
    const waits = [];
    const { ghReadWithRetry } = helpers(fetchMock, waits);
    await expect(ghReadWithRetry('app-token', '/repos/o/r/commits/sha/status')).rejects.toThrow(/^GITHUB_RATE_LIMITED_/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it.each([429, 502, 503, 504])('retries safe HTTP %i reads a bounded number of times', async (status) => {
    const fetchMock = vi.fn(async () => response(status, 'temporary'));
    const waits = [];
    const { ghReadWithRetry } = helpers(fetchMock, waits);
    await expect(ghReadWithRetry('app-token', '/repos/o/r/commits/sha/check-runs')).rejects.toThrow(`GITHUB_REQUEST_FAILED_${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([250, 500]);
  });

  it('retries a transient network failure and then returns the successful response', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('temporary network error'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 0 }), { status: 200 }));
    const waits = [];
    const { ghReadWithRetry } = helpers(fetchMock, waits);
    await expect(ghReadWithRetry('app-token', '/repos/o/r/commits/sha/check-runs')).resolves.toEqual({ total_count: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([250]);
  });
});
