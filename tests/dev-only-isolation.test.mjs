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

  it('does not deploy the combined LIVE and DEV Pages artifact from development pushes',()=>{
    const trigger=deployment.slice(deployment.indexOf('on:'),deployment.indexOf('\npermissions:'));
    expect(trigger).toMatch(/branches:\s*\n\s*- main\b/);
    expect(trigger).not.toMatch(/- development\b/);
  });

  it('removes DEV-only bootstraps and OLYMPIA files while retaining the /dev copy',()=>{
    const root=mkdtempSync(join(tmpdir(),'alea-pages-'));
    try {
      writeFileSync(join(root,'index.html'),'<script src="./dev-storage-scope.js?v=test"></script><button data-dev-only-tool="olympia">OLYMPIA</button><section data-dev-only-tool="olympia"><iframe src="./olympia-v2/"></iframe></section>');
      for (const path of ['olympia','olympia-v2','olympia-mini','dev/olympia-v2']) {
        mkdirSync(join(root,path),{recursive:true});
        writeFileSync(join(root,path,'index.html'),'tool');
      }
      execFileSync(process.execPath,[new URL('../scripts/isolate-live-pages.mjs',import.meta.url).pathname,root]);
      const liveHtml=readFileSync(join(root,'index.html'),'utf8');
      expect(liveHtml).not.toMatch(/OLYMPIA|data-dev-only-tool|olympia-v2|dev-storage-scope\.js/i);
      expect(existsSync(join(root,'olympia-v2'))).toBe(false);
      expect(existsSync(join(root,'olympia-mini'))).toBe(false);
      expect(existsSync(join(root,'dev/olympia-v2/index.html'))).toBe(true);
    } finally {
      rmSync(root,{recursive:true,force:true});
    }
  });
});
