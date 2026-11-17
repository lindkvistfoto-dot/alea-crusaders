import {describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('DEV-only OLYMPIA isolation',()=>{
  const html=read('index.html');
  const vite=read('vite.config.js');
  const deployment=read('.github/workflows/deploy-pages-live-dev.yml');
  const isolation=read('scripts/isolate-live-pages.mjs');

  it('marks both OLYMPIA entry points as DEV-only',()=>{
    expect(html).toMatch(/<button[^>]*data-dev-only-tool="olympia"[^>]*>[\s\S]*?OLYMPIA 2\.0[\s\S]*?<\/button>/);
    expect(html).toMatch(/<section[^>]*id="adminOlympia"[^>]*data-dev-only-tool="olympia"/);
  });

  it('copies OLYMPIA only for DEV builds and strips its LIVE markup',()=>{
    expect(vite).toContain('process.env.ALEA_BUILD_ENV === "development"');
    expect(vite).toContain('copyStaticTree("alea-copy-olympia-v2", "olympia-v2", "olympia-v2")');
    expect(vite).toContain('alea-remove-dev-only-admin-tools-from-live');
    expect(vite).toContain('data-dev-only-tool="olympia"');
  });

  it('deploys only the LIVE GitHub Pages artifact from main',()=>{
    const trigger=deployment.slice(deployment.indexOf('on:'),deployment.indexOf('\npermissions:'));
    expect(trigger).toMatch(/branches:\s*\n\s*- main\b/);
    expect(trigger).not.toMatch(/- development\b/);
    expect(deployment).toContain("if: github.ref == 'refs/heads/main'");
    expect(deployment).not.toMatch(/rsync[^\n]*development/);
    expect(deployment).not.toContain('EXPECTED_DEV_SHA');
  });

  it('builds the DEV-only OLYMPIA tree only from the Cloudflare development branch',()=>{
    expect(vite).toContain('process.env.CF_PAGES === "1" ? process.env.CF_PAGES_BRANCH');
    expect(vite).toContain('cloudflareBranch === "development"');
    expect(vite).toContain('CF_PAGES_COMMIT_SHA');
    expect(vite).toContain('source_sha: sourceSha');
  });

  it('removes top-level OLYMPIA files while retaining the /dev copy',()=>{
    const root=mkdtempSync(join(tmpdir(),'alea-pages-'));
    try {
      writeFileSync(join(root,'index.html'),'<button data-dev-only-tool="olympia">OLYMPIA</button><section data-dev-only-tool="olympia"><iframe src="./olympia-v2/"></iframe></section>');
      for (const path of ['olympia','olympia-v2','olympia-mini','dev/olympia-v2']) {
        mkdirSync(join(root,path),{recursive:true});
        writeFileSync(join(root,path,'index.html'),'tool');
      }
      execFileSync(process.execPath,[new URL('../scripts/isolate-live-pages.mjs',import.meta.url).pathname,root]);
      const liveHtml=readFileSync(join(root,'index.html'),'utf8');
      expect(liveHtml).not.toMatch(/OLYMPIA|data-dev-only-tool|olympia-v2/i);
      expect(existsSync(join(root,'olympia-v2'))).toBe(false);
      expect(existsSync(join(root,'olympia-mini'))).toBe(false);
      expect(existsSync(join(root,'dev/olympia-v2/index.html'))).toBe(true);
    } finally {
      rmSync(root,{recursive:true,force:true});
    }
  });
});
