import {describe,expect,it} from 'vitest';
import {reconcileIndexAssetVersions} from '../scripts/olympia/reconcile-index-asset-versions.mjs';

const css='features/trophy-room/room.css';
const js='features/trophy-room/room.js';
const html=(cssVersion,jsVersion,jsEnvironment='')=>
  '<!doctype html><html><head><link rel="stylesheet" href="./'+css+'?v='+cssVersion+'"></head>'+
  '<body><script src="./'+js+'?v='+jsVersion+jsEnvironment+'" defer></script><p>page</p></body></html>';

describe('OLYMPIA LIVE cache-reference reconciliation',()=>{
  it('updates only approved asset versions and keeps LIVE query settings and unrelated markup',()=>{
    const base=html('old-css','old-js','&env=dev1');
    const source=html('new-css','new-js','&env=dev1');
    const live=html('live-css','live-js').replace('<p>page</p>','<p>LIVE-only markup</p>');
    const result=reconcileIndexAssetVersions(base,source,live,[css,js,'index.html']);
    expect(result.handled).toBe(true);
    expect(result.html).toContain('./'+css+'?v=new-css');
    expect(result.html).toContain('./'+js+'?v=new-js');
    expect(result.html).not.toContain('env=dev1');
    expect(result.html).toContain('LIVE-only markup');
  });

  it('preserves LIVE-specific query parameters while changing the cache version',()=>{
    const base=html('old-css','old-js','&env=dev1');
    const source=html('new-css','old-js','&env=dev1');
    const live=html('live-css','live-js','&env=live&mode=compact');
    const result=reconcileIndexAssetVersions(base,source,live,[css,js]);
    expect(result.handled).toBe(true);
    expect(result.html).toContain('./'+js+'?v=live-js&env=live&mode=compact');
    expect(result.html).toContain('./'+css+'?v=new-css');
  });

  it('leaves code or non-cache query changes for Git three-way merge',()=>{
    const base=html('old-css','old-js','&env=dev1');
    const source=html('new-css','old-js','&env=dev1').replace('<p>page</p>','<p>changed source</p>');
    const live=html('live-css','live-js');
    expect(reconcileIndexAssetVersions(base,source,live,[css,js]).handled).toBe(false);

    const sourceWithEnvChange=html('new-css','old-js','&env=preview');
    expect(reconcileIndexAssetVersions(base,sourceWithEnvChange,live,[css,js]).handled).toBe(false);
  });

  it('stops auto-reconciliation when an approved asset reference is ambiguous',()=>{
    const base=html('old-css','old-js','&env=dev1');
    const source=html('new-css','old-js','&env=dev1');
    const live=html('live-css','live-js')+'<link rel="stylesheet" href="./'+css+'?v=duplicate">';
    expect(reconcileIndexAssetVersions(base,source,live,[css,js]).handled).toBe(false);
  });
});
