import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('OLYMPIA ZEUS CONTROL baseline and acceptance queue',()=>{
  it('preserves a versioned baseline and the full captured PR history',()=>{
    const baseline=JSON.parse(read('olympia/baseline-001.json'));
    const inventory=JSON.parse(read('olympia/history/pr-inventory-001.json'));
    expect(baseline.baseline_id).toBe('OLYMPIA-BASELINE-001');
    expect(baseline.refs.development.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(baseline.refs.live.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(inventory.complete).toBe(true);
    expect(inventory.pull_requests).toHaveLength(baseline.pull_requests.total);
    expect(baseline.approvals.zeus_product_acceptances).toEqual([]);
  });

  it('starts a one-item queue without claiming the pilot is ready',()=>{
    const queue=JSON.parse(read('olympia/work-items.json'));
    expect(queue.items.map(x=>x.id)).toEqual(['PILOT-001']);
    expect(queue.items[0].ready_for_human_acceptance).toBe(false);
    expect(queue.items[0].acceptance.decision).toBeNull();
  });

  it('shows the three human-facing views and gates decisions on a ready DEV version',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('ATT PROVA');
    expect(page).toContain('ATT PUBLICERA');
    expect(page).toContain('HISTORIK');
    expect(page).toContain('ready_for_human_acceptance');
    expect(page).toContain('github.com/"+owner+"/"+repo+"/issues/new');
    const script=page.split('<script>')[1]?.split('</script>')[0]||'';
    expect(script.length).toBeGreaterThan(0);
    expect(()=>new Function(script)).not.toThrow();
  });

  it('does not represent unresolved database or deployment evidence as release-ready',()=>{
    const baseline=JSON.parse(read('olympia/baseline-001.json'));
    expect(baseline.database.reconciliation).toBe('BLOCKED_UNKNOWN');
    expect(baseline.deployments.verified_deployments).toBe(false);
    expect(baseline.completeness.commit_history).toContain('100');
  });
});
