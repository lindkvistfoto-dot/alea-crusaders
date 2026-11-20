// The crypt uses the same Expert outcome, confirmation, initiative, hit table,
// damage and half-movement calculations as the campaign sheet and combat runtime.
// This adapter owns only the isolated encounter snapshot and its command boundary.
import '../combat/expert-rules.js';

const expert = globalThis.aleaExpertRules;

// Playable snapshots of the three DEV characters, 2026-11-20. A missing trained
// skill uses its rule's base group: INT for searching, PSY for sensing danger.
// The guard is the GM's fixture. Session wounds and equipment stay in the session.
const profiles = {
  astrid: {
    smi: 14, kp: 18, psy: 16, movement: 18, armor: 3, bonus: '1T4', search: 2, danger: 3,
    weapons: [
      {name: 'Dödsbringaren', fv: 13, damage: '2T8+4', length: 1},
      {name: 'Kortspjut', fv: 8, damage: '1T6+1', length: 2},
      {name: 'Kortbåge', fv: 7, damage: '1T6+1', reach: 90},
      {name: 'Stridshammare', fv: 7, damage: '1T6+2', length: 1},
    ],
  },
  lyra: {
    smi: 15, kp: 13, psy: 18, movement: 16, armor: 0, bonus: '0', search: 10, danger: 4,
    weapons: [{name: 'Stav', fv: 7, damage: '2T4', length: 3}],
  },
  evalin: {
    smi: 18, kp: 10, psy: 12, movement: 15, armor: 2, bonus: '0', search: 3, danger: 2,
    weapons: [{name: 'Kastspjut', fv: 12, damage: '1T6+1', reach: 12, thrown: true}],
  },
  guard: {
    smi: 10, kp: 10, psy: 8, movement: 8, armor: 2, bonus: '0',
    weapons: [{name: 'Vaktstav', fv: 8, damage: '1T6', length: 2}],
  },
};

const outcomeText = {
  success: 'Lyckat slag', special: 'Särskilt slag', perfect: 'Perfekt slag',
  fail: 'Misslyckat slag', fumble: 'Fummel',
};

function profile(id) {
  const data = Object.hasOwn(profiles, id) && profiles[id];
  if (!data) throw new Error('Rollpersonen finns inte i spelmötet.');
  return data;
}
function throwDie(die, sides) {
  const face = die(sides);
  if (!Number.isInteger(face) || face < 1 || face > sides) throw new Error('Ogiltigt tärningsslag.');
  return face;
}
function check(fv, die) {
  const sequence = expert.expertRoll(fv);
  let step = sequence.next();
  while (!step.done) step = sequence.next(throwDie(die, step.value.sides));
  const {roll, confirmation_roll: confirmationRoll, outcome, success} = step.value;
  return {fv, roll, confirmationRoll, outcome, success};
}
export function resolveAdventureSkill(actor, skill, die = expert.secureDie) {
  const person = profile(typeof actor === 'string' ? actor : actor.id);
  const label = {search: 'Finna dolda ting', danger: 'Upptäcka fara'}[skill];
  if (!label || !Number.isInteger(person[skill])) throw new Error('Färdigheten är inte tillgänglig.');
  return {skill: label, ...check(person[skill], die)};
}

function initiative(battle, die) {
  const rolled = battle.combatants.filter(row => row.hp > 0).map((row, index) => {
    const smi = profile(row.id).smi;
    const face = throwDie(die, 10);
    row.initiative = smi + face;
    row.movementRemaining = row.movementMax;
    row.actionAvailable = true;
    row.actionUsed = false;
    return {id: row.id, name: row.name, smi, total: row.initiative, original_sort: index};
  }).sort(expert.compareInitiative);
  battle.order = rolled.map(row => row.id);
  battle.activeActorId = battle.order[0] ?? null;
}

export function createEncounter(actors, die = expert.secureDie) {
  const battle = {
    round: 1, order: [], activeActorId: null,
    combatants: actors.map(actor => {
      const data = profile(actor.id);
      return {
        id: actor.id, name: actor.name, maxHp: data.kp,
        hp: Math.max(0, Math.min(data.kp, actor.hp ?? data.kp)),
        movementMax: data.movement, weaponIndex: actor.weaponIndex ?? 0, thrown: actor.thrown === true,
      };
    }),
  };
  initiative(battle, die);
  return battle;
}
function heldWeapon(row) {
  return profile(row.id).weapons[row.weaponIndex];
}

export function projectEncounter(battle, allowedActorIds) {
  if (!battle) return null;
  const known = new Set(allowedActorIds);
  return {
    round: battle.round,
    activeActorId: known.has(battle.activeActorId) ? battle.activeActorId : null,
    order: battle.order.filter(id => known.has(id)),
    combatants: battle.combatants.filter(row => known.has(row.id)).map(row => ({
      id: row.id, hp: row.hp, maxHp: row.maxHp, movementRemaining: row.movementRemaining,
      movementMax: row.movementMax, actionAvailable: row.actionAvailable, initiative: row.initiative,
      weapon: heldWeapon(row)?.name ?? 'Tom hand',
    })),
  };
}

function advanceTurn(battle, die) {
  const next = battle.order.slice(battle.order.indexOf(battle.activeActorId) + 1)
    .find(id => battle.combatants.some(row => row.id === id && row.hp > 0));
  if (next) battle.activeActorId = next;
  else {
    battle.round += 1;
    initiative(battle, die);
  }
  return {message: 'Initiativet har gått vidare.'};
}

function attack(battle, actor, command, {die, canSee, distanceHexes}) {
  const target = battle.combatants.find(row => row.id === command.targetId && row.hp > 0);
  if (!target || (actor.id === 'guard') === (target.id === 'guard') || !canSee(actor.id, target.id)) {
    throw new Error('Inget synligt mål för angreppet.');
  }
  const weapon = heldWeapon(actor);
  if (!weapon) throw new Error('Dra ett vapen före angreppet.');
  const distance = distanceHexes(actor.id, target.id);
  if (!Number.isFinite(distance) || distance < 1 || distance > (weapon.reach ?? expert.meleeReach(weapon.length))) throw new Error('Målet är utom räckhåll.');
  const result = check(weapon.fv, die);
  // The encounter fixture uses the undefended humanoid table. There is no
  // automatic reaction assigned to the demonstrator's guard.
  let impact = '';
  if (result.success) {
    const table = expert.hitTables.humanoid.A;
    const hitRoll = throwDie(die, table.die);
    const hit = table.rows.find(row => row.min <= hitRoll && hitRoll <= row.max);
    const {fullDamage, ignoreArmor} = expert.attackPolicy(result.outcome);
    const plan = expert.damageDice(expert.damageSpec(weapon.damage), expert.damageSpec(profile(actor.id).bonus), fullDamage);
    const faces = plan.dice.flatMap(({qty,sides}) => Array.from({length: qty}, () => throwDie(die,sides)));
    const before = target.hp;
    const damage = plan.resolve(faces, profile(target.id).armor, 0, ignoreArmor, before);
    target.hp = damage.after;
    Object.assign(result, {hitLocation: hit.label, hitRoll, damage: damage.net, hpBefore: before, hpAfter: target.hp});
    impact = ' · ' + hit.label + ' · ' + damage.net + ' KP skada';
  }
  // A thrown spear leaves the hand on a ranged attack.
  if (weapon.thrown && distance > 1) {
    actor.weaponIndex = -1;
    actor.thrown = true;
  }
  const confirmation = result.confirmationRoll == null ? '' : ' / kontroll ' + result.confirmationRoll;
  return {
    message: actor.name + ' · ' + weapon.name + ' · T20 ' + result.roll + confirmation +
      ' mot FV ' + result.fv + ' · ' + outcomeText[result.outcome] + impact,
    result, targetId: target.id, hp: target.hp, weaponIndex: actor.weaponIndex, thrown: actor.thrown,
  };
}

// Call on the world's transaction copy after authorization and geometry checks.
export function resolveEncounterCommand(battle, actors, command, options = {}) {
  const die = options.die ?? expert.secureDie;
  if (!battle) throw new Error('Ingen strid pågår.');
  if (command.type === 'nextTurn') return advanceTurn(battle, die);
  const actor = battle.combatants.find(row => row.id === command.actorId);
  if (!actor || actor.hp <= 0 || actor.id !== battle.activeActorId) throw new Error('Vänta tills rollpersonen har initiativet.');
  if (command.type === 'move') {
    const cost = command.cost;
    if (!Number.isInteger(cost) || cost < 1 || cost > actor.movementRemaining) throw new Error('Förflyttningen överskrider rörelsebudgeten.');
    const budget = expert.movementBudget(actor.movementMax, actor.movementRemaining, actor.actionUsed);
    if (cost > budget.allowance) throw new Error('Efter en handling återstår en halv förflyttning.');
    actor.movementRemaining -= cost;
    actor.actionAvailable = !actor.actionUsed && budget.keepsAction(cost);
    return {message: actor.name + ' går ' + cost + ' hex.'};
  }
  if (!actor.actionAvailable) throw new Error('Rollpersonen har förbrukat sin handling.');
  let response;
  if (command.type === 'attack') {
    response = attack(battle, actor, command, {...options, die});
  } else if (command.type === 'switchWeapon') {
    const choices = profile(actor.id).weapons;
    if (actor.thrown) throw new Error('Kastspjutet har lämnats på slagfältet.');
    actor.weaponIndex = actor.weaponIndex + 1 >= choices.length ? -1 : actor.weaponIndex + 1;
    response = {message: actor.name + ' · ' + (heldWeapon(actor)?.name ?? 'vapnet har lagts undan'),
      weaponIndex: actor.weaponIndex};
  } else if (command.type === 'skill') {
    response = {message: actor.name + ' använder en färdighet.'};
  } else throw new Error('Handlingen finns inte i striden.');
  actor.actionUsed = true;
  actor.actionAvailable = false;
  return response;
}
