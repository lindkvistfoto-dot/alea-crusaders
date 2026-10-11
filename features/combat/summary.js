/* v0.35.112 – persistent, read-only after-combat report. No new database schema. */
(function () {
  'use strict';
  const safe = value => typeof escAttr === 'function'
    ? escAttr(String(value ?? ''))
    : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fallen = new Set(['dead', 'defeated', 'unconscious']);
  const statusLabels = {active:'Stridsduglig', unconscious:'Medvetslös', defeated:'Utslagen', dead:'Död', removed:'Reserv / lämnat striden'};
  const sideLabels = {heroes:'Hjältar', enemies:'Fiender', neutral:'Neutrala'};
  const labels = {attack:'Anfall', spell:'Besvärjelse', parry:'Parering'};

  function winnerFromCombatants(rows) {
    const relevant = rows.filter(row => row.side === 'heroes' || row.side === 'enemies');
    if (!relevant.some(row => row.side === 'heroes') || !relevant.some(row => row.side === 'enemies')) return null;
    const defeatedSide = side => relevant.filter(row => row.side === side).every(row =>
      fallen.has(row.status) || (row.current_kp != null && Number(row.current_kp) <= 0));
    const standing = side => relevant.some(row => row.side === side && row.status === 'active' && Number(row.current_kp ?? 1) > 0);
    if (defeatedSide('enemies') && standing('heroes')) return 'heroes';
    if (defeatedSide('heroes') && standing('enemies')) return 'enemies';
    return null;
  }

  function buildCombatSummary(instance, participants, actions, events, ammoRows, recovery = null) {
    const people = Array.isArray(participants) ? participants : [];
    const acts = (Array.isArray(actions) ? actions : []).filter(a => a.status === 'resolved');
    const logs = (Array.isArray(events) ? events : []).filter(e => e.event_type !== 'combat_completed');
    const ammo = Array.isArray(ammoRows) ? ammoRows : [];
    const damage = new Map(), heals = new Map(), attacks = new Map(), hits = new Map(), spells = new Map();
    const count = (map, id, n = 1) => { if (id != null) map.set(String(id), (map.get(String(id)) || 0) + n); };
    for (const event of logs) {
      if (['damage', 'defeated'].includes(event.event_type))
        count(damage, event.actor_id, Math.max(0, finite(event.details?.net_damage)));
      if (event.event_type === 'spell_healing_applied')
        count(heals, event.target_id, Math.max(0, finite(event.details?.healing_restored)));
    }
    for (const action of acts) {
      if (action.action_type === 'attack') {
        count(attacks, action.combatant_id);
        if (action.result?.success && !action.result?.parried && !action.result?.parry?.success)
          count(hits, action.combatant_id);
      } else if (action.action_type === 'spell') {
        count(spells, action.combatant_id);
      }
    }
    const groups = ['heroes', 'enemies', 'neutral'].map(side => ({
      side, label:sideLabels[side],
      participants:people.filter(p => p.side === side).map(p => ({
        id:String(p.id), name:String(p.name_snapshot || 'Okänd'),
        status:p.status || 'active', statusLabel:statusLabels[p.status] || String(p.status || 'Okänd'),
        kp:p.current_kp, maxKp:p.max_kp, psy:p.current_psy, maxPsy:p.max_psy,
        damage:damage.get(String(p.id)) || 0, healing:heals.get(String(p.id)) || 0,
        attacks:attacks.get(String(p.id)) || 0, hits:hits.get(String(p.id)) || 0,
        spells:spells.get(String(p.id)) || 0,
        fallen:fallen.has(p.status) || (p.current_kp != null && Number(p.current_kp) <= 0)
      }))
    })).filter(group => group.participants.length);
    const nominated = ['heroes', 'enemies', 'neutral'].includes(instance?.winning_side) ? instance.winning_side : null;
    const winner = nominated || winnerFromCombatants(people);
    const maxRound = Math.max(1, finite(instance?.round_number),
      ...logs.map(l => finite(l.round_number)), ...acts.map(a => finite(a.round_number)));
    const notableTypes = new Set([
      'defeated','fumble','parry','summon_elemental','spell','spell_area',
      'spell_manual','spell_heal','spell_healing_applied','spell_after_antimagic',
      'antimagic','spell_status','spell_damage'
    ]);
    const highlights = logs.filter(e => notableTypes.has(e.event_type) || String(e.event_type).startsWith('spell_'))
      .slice(-12).map(e => ({ round:finite(e.round_number), type:String(e.event_type), message:String(e.message || '') }));
    const recovered = ammo.filter(a => a.recovered === true).length;
    return {
      format:1, combatId:String(instance?.id || ''), name:String(instance?.name || 'Strid'),
      startedAt:instance?.started_at || null, completedAt:instance?.completed_at || new Date().toISOString(),
      rounds:maxRound, winner, groups,
      totals:{
        participants:people.length, fallen:people.filter(p => fallen.has(p.status) || (p.current_kp != null && Number(p.current_kp) <= 0)).length,
        attacks:acts.filter(a => a.action_type === 'attack').length,
        spells:acts.filter(a => a.action_type === 'spell').length,
        parries:acts.filter(a => a.action_type === 'parry').length,
        damage:[...damage.values()].reduce((sum,n) => sum+n, 0),
        healing:[...heals.values()].reduce((sum,n) => sum+n, 0),
        projectiles:ammo.length, recovered, lost:ammo.length-recovered
      },
      recoveryAllowed:recovery?.allowed ?? null,
      highlights
    };
  }

  async function fetchAllRows(table, combatId, columns, order) {
    const result = [], pageSize = 500, encoded = encodeURIComponent(combatId);
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const rows = await dbJson(table+'?combat_id=eq.'+encoded+'&select='+columns+
        '&order='+order+'&limit='+pageSize+'&offset='+offset);
      if (!Array.isArray(rows)) throw new Error('Ofullständig inläsning av stridsloggen.');
      result.push(...rows);
      if (rows.length < pageSize) return result;
    }
    throw new Error('Stridsloggen är för lång för att sammanfattas fullständigt.');
  }

  async function persistCombatSummary(combatId, recovery = null) {
    if (!combatCanManage() || !activeCombat || String(activeCombat.id) !== String(combatId) ||
      activeCombat.status !== 'completed') throw new Error('Striden är inte avslutad.');
    const [acts, logs] = await Promise.all([
      fetchAllRows('combat_actions', combatId,
        'combatant_id,round_number,action_type,status,result', 'round_number.asc,sequence.asc,created_at.asc'),
      fetchAllRows('combat_log', combatId,
        'id,round_number,event_type,message,actor_id,target_id,details', 'id.asc')
    ]);
    const completedAt = activeCombat.completed_at || new Date().toISOString();
    const report = buildCombatSummary({...activeCombat, completed_at:completedAt},
      combatants, acts, logs, combatAmmoSpends, recovery);
    const settings = {...(activeCombat.settings || {}), end_summary:report};
    await dbJson('combat_instances?id=eq.'+encodeURIComponent(combatId)+
      '&campaign_id=eq.'+encodeURIComponent(centralCampaignId), {
      method:'PATCH', headers:{'Prefer':'return=minimal'},
      body:JSON.stringify({settings,completed_at:completedAt,
        winning_side:report.winner,updated_at:new Date().toISOString()})
    });
    activeCombat.settings = settings;
    activeCombat.completed_at = completedAt;
    activeCombat.winning_side = report.winner;
    return report;
  }

  function dateLabel(value) {
    if (!value) return '–';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '–' : date.toLocaleString('sv-SE', {dateStyle:'medium',timeStyle:'short'});
  }
  function valuePair(current, maximum) {
    return (current == null ? '–' : safe(current))+'/'+(maximum == null ? '–' : safe(maximum));
  }
  function renderCombatReport(instance) {
    const report = instance?.settings?.end_summary;
    if (!report || report.format !== 1) {
      return '<div class="combat-finish-report"><h3>Striden är avslutad</h3>'+
        '<p>Resultatet är sparat. En detaljerad sammanfattning har ännu inte skapats.</p>'+
        (combatCanManage()?'<button type="button" class="btn" onclick="combatRegenerateFinishedSummary()">Skapa sammanfattning</button>':'')+
        '</div>';
    }
    const winner = report.winner === 'heroes' ? 'Hjältarna segrade' :
      report.winner === 'enemies' ? 'Fienderna segrade' :
      report.winner === 'neutral' ? 'Neutralt utfall' :
      'Striden avslutades – ingen segrare fastställd';
    const t = report.totals || {};
    const groups = (report.groups || []).map(group =>
      '<section class="combat-report-side"><h4>'+safe(group.label)+' <small>('+group.participants.length+')</small></h4>'+
      '<div class="combat-report-table-wrap"><table><thead><tr><th>Deltagare</th><th>Slutstatus</th><th>KP</th><th>PSY</th><th>Skada</th><th>Magi</th></tr></thead><tbody>'+
      group.participants.map(p => '<tr class="'+(p.fallen?'is-fallen':'')+'"><td><strong>'+safe(p.name)+'</strong></td><td>'+
      safe(p.statusLabel)+'</td><td>'+valuePair(p.kp,p.maxKp)+'</td><td>'+valuePair(p.psy,p.maxPsy)+'</td><td>'+
      safe(p.damage)+'</td><td>'+safe(p.spells)+'</td></tr>').join('')+
      '</tbody></table></div></section>').join('');
    const highlights = (report.highlights || []).length
      ? '<ol class="combat-report-events">'+report.highlights.map(e =>
        '<li><span>SR '+safe(e.round)+'</span>'+safe(e.message)+'</li>').join('')+'</ol>'
      : '<p>Inga särskilda händelser har registrerats i stridsloggen.</p>';
    return '<div class="combat-finish-report" aria-label="Sammanfattning av avslutad strid">'+
      '<div class="combat-report-intro"><span class="combat-report-eyebrow">STRIDEN AVSLUTAD</span><h3>'+safe(report.name)+'</h3>'+
      '<p class="combat-report-winner">'+safe(winner)+'</p>'+
      '<p class="combat-report-dates">Start: '+safe(dateLabel(report.startedAt))+' · Slut: '+safe(dateLabel(report.completedAt))+'</p></div>'+
      '<div class="combat-report-metrics">'+
      [['Stridsrundor',report.rounds],['Kombatanter',t.participants],['Utslagna / döda',t.fallen],['Anfall',t.attacks],['Besvärjelser',t.spells],['Skada (KP)',t.damage],['Läkning (KP)',t.healing]]
      .map(([label,value])=>'<div><span>'+safe(label)+'</span><strong>'+safe(value ?? 0)+'</strong></div>').join('')+'</div>'+
      '<h4>Deltagare och slutstatus</h4><div class="combat-report-sides">'+groups+'</div>'+
      '<div class="combat-report-bottom"><section><h4>Viktiga händelser</h4>'+highlights+'</section>'+
      '<section><h4>Projektiler</h4><p>Avfyrade: <b>'+safe(t.projectiles||0)+'</b> · Återvunna: <b>'+safe(t.recovered||0)+
      '</b> · Förlorade: <b>'+safe(t.lost||0)+'</b></p></section></div>'+
      '<p class="combat-report-footnote">Sammanfattningen bygger på sparade stridsresultat och kombatanternas status vid avslut. Händelserna ovan är ett urval.</p>'+
      '</div>';
  }

  async function regenerateCombatReport() {
    if (!combatCanManage() || !activeCombat || activeCombat.status !== 'completed') return;
    try {
      await persistCombatSummary(activeCombat.id);
      renderCombat();
    } catch(error) {
      alert('Kunde inte skapa sammanfattningen: '+(error?.message || error));
    }
  }
  window.combatCreateSummarySnapshot = buildCombatSummary;
  window.combatPersistFinishedSummary = persistCombatSummary;
  window.combatCompletedSummaryHtml = renderCombatReport;
  window.combatRegenerateFinishedSummary = regenerateCombatReport;
})();
