import {describe,expect,it} from 'vitest';
import {mergeTextThreeWay} from '../scripts/olympia/reconcile-index-asset-versions.mjs';

describe('OLYMPIA generic HTML reconciliation',()=>{
  it('merges independent edits in a single-line HTML file and preserves the target baseline',()=>{
    const base='<html><head><title>Base</title></head><body><button>Keep</button><button id="debug">Debug</button></body></html>';
    const approved=base.replace('<button id="debug">Debug</button>','');
    const live=base.replace('<title>Base</title>','<title>LIVE setting</title>');
    const result=mergeTextThreeWay(base,approved,live);
    expect(result.handled).toBe(true);
    expect(result.text).toBe('<html><head><title>LIVE setting</title></head><body><button>Keep</button></body></html>');
  });

  it('transfers a small approved HTML change without copying unrelated target content',()=>{
    const base='<html><head></head><body><nav>old</nav><main>live-only</main></body></html>';
    const approved=base.replace('<nav>old</nav>','<nav>new</nav>');
    const live=base.replace('<main>live-only</main>','<main>changed in LIVE</main>');
    const result=mergeTextThreeWay(base,approved,live);
    expect(result.handled).toBe(true);
    expect(result.text).toContain('<nav>new</nav>');
    expect(result.text).toContain('<main>changed in LIVE</main>');
    expect(result.text).not.toContain('live-only');
  });

  it('stops when both sides edit the same HTML text',()=>{
    const base='<html><body><h1>Welcome</h1></body></html>';
    const result=mergeTextThreeWay(base,base.replace('Welcome','Welcome DEV'),base.replace('Welcome','Welcome LIVE'));
    expect(result.handled).toBe(false);
    expect(result.reason).toBe('overlapping-edits');
  });

  it('allows identical edits already present in LIVE',()=>{
    const base='<html><body><button>Old</button></body></html>';
    const changed=base.replace('Old','New');
    expect(mergeTextThreeWay(base,changed,changed)).toEqual({handled:true,text:changed});
  });
});
