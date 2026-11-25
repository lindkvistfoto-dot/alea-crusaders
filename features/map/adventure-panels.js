// Read the participants of the active encounter for this map and session.
// An exploration map can enter tactical mode before a combat encounter exists.
export async function readPanelTurn(view, figures) {
  const scope = 'campaign_id=eq.' + view.campaign + '&session_id=eq.' + view.session + '&map_id=eq.' + view.map.id;
  const encounters = await dbJson('combat_instances?' + scope + '&status=eq.active&select=id&limit=2');
  if (encounters.length !== 1 || !figures.length) return null;
  const sources = [...new Set(figures.map(f=>f.character_id || f.npc_character_id || f.npc_id || f.monster_id).filter(Boolean))];
  if (!sources.length) return null;
  const id = encounters[0].id;
  const visibility = view.gm ? '' : '&visible_to_players=eq.true';
  const participants = await dbJson('combatants?combat_id=eq.' + id + visibility +
    '&source_id=in.(' + sources.join(',') + ')&q=not.is.null&r=not.is.null&status=not.in.(dead,removed)' +
    '&or=(state->>in_reserve.is.null,state->>in_reserve.eq.false)&select=id,source_id,source_type&order=sort_order.asc,id.asc');
  if (!participants.length) return null;
  const turns = await dbJson('combat_instances?' + scope + '&id=eq.' + id + '&status=eq.active&active_actor_id=in.(' +
    participants.map(p=>p.id).join(',') + ')&select=active_actor_id');
  return {participants, active:turns[0]?.active_actor_id};
}

export function renderAdventurePanels(view) {
  const battle = Boolean(view?.ready && view.hexLoaded && view.hex.round);
  const left = document.getElementById('adventureRoundPanel');
  const right = document.getElementById('adventureOrderPanel');
  left.parentElement.classList.toggle('in-battle', battle);
  right.parentElement.classList.toggle('in-battle', battle);
  if (!battle) {
    left.replaceChildren();right.replaceChildren();
    return;
  }
  const turn = view.panelTurn;
  const actor = turn?.participants?.find(p=>p.id===turn.active);
  function figureFor(participant) {
    const figures = view.rows.filter(figure => {
      if (participant.source_type === 'monster') return figure.monster_id === participant.source_id;
      if (participant.source_type === 'npc') return figure.npc_id === participant.source_id || figure.npc_character_id === participant.source_id;
      return figure.character_id === participant.source_id || figure.npc_character_id === participant.source_id;
    });
    return figures.length === 1 ? figures[0] : null;
  }
  const current = actor && figureFor(actor);
  const budget = current && view.hex.budgets?.[current.id];
  left.innerHTML = '<h3>Runda '+Number(view.hex.round)+'</h3><p>'+ (current ? 'På tur · '+escAttr(current.name) : 'Ingen synlig aktör på tur') +
    '</p><h4>Handlingar</h4><p>'+(budget ? 'Förflyttning '+Math.max(0,budget.max-budget.spent)+' / '+Number(budget.max) : 'Taktisk förflyttning')+'</p>';
  const cards = turn?.participants?.flatMap(p=>{
    const figure=figureFor(p);
    if (!figure) return [];
    const roleClass = {character:'player-row',npc:'npc-row',monster:'enemy-row'}[p.source_type];
    const portrait = combatRowPortraitHtml({...p, name_snapshot:figure.name}, roleClass);
    return ['<li class="adventure-participant" data-combatant-id="'+escAttr(p.id)+'">'+portrait+' '+escAttr(figure.name)+(p.id===turn.active?' · På tur':'')+'</li>'];
  }) || [];
  const empty = turn?.unavailable ? 'Turordningen kunde inte läsas.' : 'Ingen synlig turordning för kartan.';
  right.innerHTML='<h3>Turordning</h3>'+(cards.length ? '<ol>'+cards.join('')+'</ol>' : '<p>'+empty+'</p>');
}
