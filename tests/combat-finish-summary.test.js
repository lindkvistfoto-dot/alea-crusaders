import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const src = read('features/combat/summary.js');
const window = {};
runInNewContext(src, { window, console, Date });
const summarize = window.combatCreateSummarySnapshot;
const render = window.combatCompletedSummaryHtml;

const combat = {id:'battle-1',name:'Skelettpatrullen',round_number:3,started_at:'2026-10-11T17:00:00.000Z'};
const fighters = [
  {id:'hero',side:'heroes',name_snapshot:'Astrid',status:'active',current_kp:14,max_kp:20,current_psy:4,max_psy:8},
  {id:'enemy',side:'enemies',name_snapshot:'Skelettvakt',status:'dead',current_kp:0,max_kp:9,current_psy:0,max_psy:0}
];
const actions = [
  {status:'resolved',action_type:'attack',combatant_id:'hero',round_number:1,result:{success:true}},
  {status:'resolved',action_type:'spell',combatant_id:'hero',round_number:2,result:{success:true}},
  {status:'planned',action_type:'attack',combatant_id:'enemy',round_number:3}
];
const events = [
  {id:1,round_number:1,event_type:'damage',actor_id:'hero',target_id:'enemy',message:'Astrid skadar vakten',details:{net_damage:5}},
  {id:2,round_number:2,event_type:'spell_healing_applied',actor_id:'hero',target_id:'hero',message:'HELA på Astrid',details:{healing_restored:3}},
  {id:3,round_number:3,event_type:'defeated',actor_id:'hero',target_id:'enemy',message:'Vakten faller',details:{net_damage:4}},
  {id:4,round_number:3,event_type:'fumble',actor_id:'enemy',message:'Vakten fumlar',details:{}}
];

describe('Stop combat and after-action report', () => {
  test('the GM has a stop control in the battle header, not buried in ammunition settings', () => {
    const html = read('index.html');
    const runtime = read('features/combat/runtime.js');
    expect(runtime).toContain('id="combatStopBtn"');
    expect(runtime).toContain('onclick="combatFinishAndRecover()"');
    expect(runtime).toContain("activeCombat&&['active','paused'].includes(activeCombat.status)");
    expect(runtime).toContain("if(!combatCanManage()||!activeCombat||!['active','paused'].includes(activeCombat.status)||combatStopBusy)return");
    expect(runtime).toContain("await dbJson('rpc/combat_finish_and_recover'");
    expect(runtime).toContain("await window.combatPersistFinishedSummary(combatId,result)");
    expect(runtime).toContain("if(activeCombat.status==='completed')");
  });
  test('uses full history and records accurate damage, spells, rounds, status and ammunition', () => {
    const ammo = [{recovered:true},{recovered:false}];
    const r = summarize(combat,fighters,actions,events,ammo,{allowed:true});
    expect(r.name).toBe('Skelettpatrullen');
    expect(r.rounds).toBe(3);
    expect(r.winner).toBe('heroes');
    expect(r.totals).toMatchObject({participants:2,fallen:1,attacks:1,spells:1,damage:9,healing:3,projectiles:2,recovered:1,lost:1});
    expect(r.groups[0].participants[0]).toMatchObject({name:'Astrid',status:'active',damage:9,attacks:1,spells:1});
    expect(r.groups[1].participants[0]).toMatchObject({name:'Skelettvakt',status:'dead',fallen:true});
    expect(r.highlights.some(e=>e.message==='Vakten faller')).toBe(true);
  });
  test('does not manufacture a winner when both sides still stand', () => {
    const both = fighters.map(row=>({...row,status:'active',current_kp:5}));
    const r = summarize(combat,both,[],[],[],null);
    expect(r.winner).toBeNull();
    expect(render({settings:{end_summary:r}})).toContain('ingen segrare fastställd');
  });
  test('escapes names and event descriptions in the report', () => {
    const r = summarize(combat,
      [{...fighters[0],name_snapshot:'<script>alert(1)</script>'}],
      [],[{event_type:'fumble',message:'<img src=x onerror=alert(1)>',round_number:1}],[]);
    const html = render({settings:{end_summary:r}});
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });
  test('completed reports remain accessible and are not deleted by a new scene', () => {
    const runtime = read('features/combat/runtime.js');
    expect(runtime).toContain("const previousCombatCompleted=activeCombat?.status==='completed'");
    expect(runtime).toContain("&&!previousCombatCompleted)await combatDeleteRuntime(previousCombatId)");
    expect(runtime).toContain("status=eq.completed&select=*&order=updated_at.desc&limit=1");
    expect(read('index.html')).toContain('features/combat/summary.js');
  });
});
