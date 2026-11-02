import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
it('V2 is separate and read-only',()=>{expect(page).toMatch(/PILOT \/ ENDAST LÄSNING/);expect(page).toMatch(/button disabled>Godkänn DEV/);expect(page).not.toMatch(/approve_and_merge_dev|pandoras_ask|final_approval/);});
it('V2 reads GitHub PR, CI and preview without a duplicate status store',()=>{expect(page).toMatch(/\/pulls\?state=open&base=development/);expect(page).toMatch(/\/check-runs\?per_page=100/);expect(page).toMatch(/cloudflare pages/i);expect(page).toMatch(/Promise\.allSettled/);});
it('V2 escapes untrusted GitHub content',()=>{expect(page).toMatch(/const safe=/);expect(page).toMatch(/safe\(pr\.title\)/);expect(page).toMatch(/link\(pr\.html_url/);
    expect(page).toMatch(/safe\(url\)/);});

it('Cloudflare build includes the V2 route',()=>{
  const vite=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
  expect(vite).toContain('copyStaticTree("alea-copy-olympia-v2", "olympia-v2", "olympia-v2")');
});
