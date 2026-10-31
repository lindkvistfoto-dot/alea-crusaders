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

  it('shows the verified Astrid pilot ready without claiming human approval',()=>{
    const queue=JSON.parse(read('olympia/work-items.json'));
    expect(queue.items.map(x=>x.id)).toEqual(['PILOT-001']);
    expect(queue.items[0].ready_for_human_acceptance).toBe(true);
    expect(queue.items[0].pr_number).toBe(385);
    expect(queue.items[0].dev_sha).toMatch(/^[a-f0-9]{40}$/);
    expect(queue.items[0].acceptance.decision).toBeNull();
  });

  it('shows the three human-facing views and gates decisions on a ready DEV version',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('ATT PROVA');
    expect(page).toContain('ATT PUBLICERA');
    expect(page).toContain('HISTORIK');
    expect(page).toContain('ready_for_human_acceptance');
    expect(page).toContain('testedSha===item.dev_sha');
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
  it('integrates OLYMPIA in ALEA admin and reuses the ALEA session',()=>{
    const app=read('index.html');
    const legacy=read('legacy/app.js');
    const page=read('olympia/zeus-control.html');
    expect(app).toContain("openAdminSection('olympia')");
    expect(app).toContain('data-admin-section="olympia"');
    expect(legacy).toContain("olympia:['OLYMPIA'");
    expect(page).toContain('localStorage.getItem("alea_supabase_session")');
    expect(page).toContain('supabase.auth.setSession');
    expect(page).not.toContain('signInWithPassword');
    expect(page).not.toContain('signInWithOAuth');
  });

  it('reads current branches and pull request counts from GitHub instead of the captured snapshot',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('api+"/branches/development"');
    expect(page).toContain('api+"/branches/main"');
    expect(page).toContain('is:pr is:open');
    expect(page).toContain('is:pr is:merged');
    expect(page).toContain('Aktuell GitHub-status OKÄND');
  });

});
