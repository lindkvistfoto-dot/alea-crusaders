import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, it} from 'vitest';
import {createEncounter, projectEncounter, resolveAdventureSkill, resolveEncounterCommand} from '../features/crypt/rules.js';

const heroes = ['astrid', 'lyra', 'evalin', 'guard'].map(id => ({id, name: id}));
const fixed = () => 5;
const faces = (...values) => () => values.shift();
const newBattle = () => createEncounter(heroes, fixed);
const command = (battle, input, extra = {}) => resolveEncounterCommand(battle, heroes, {
  actorId: battle.activeActorId, ...input,
}, {canSee: () => true, distanceHexes: () => 1, die: fixed, ...extra});

describe('Kryptans dörr uses the ALEA Expert rules', () => {
  it('runs the same check and confirmation sequence as the campaign attack with animated rolls', async () => {
    const source = readFileSync(new URL('../features/combat/runtime.js', import.meta.url), 'utf8');
    const fn = source.slice(source.indexOf('async function combatExpertRoll('), source.indexOf('function combatParseDamageFormula('));
    for (const [rolls, expected] of [[[1, 9], 'perfect'], [[4, 16], 'success'], [[3, 4], 'special'], [[20, 19], 'fumble'], [[14], 'fail']]) {
      const queue = [...rolls], requests = [];
      const ctx = {
        aleaExpertRules: globalThis.aleaExpertRules, setTimeout: fn => fn(),
        combatRollDice: async (spec, label) => {
          requests.push({sides: spec[0].sides, label});
          return {rolls: [{value: queue.shift()}]};
        },
      };
      const run = runInNewContext(fn + ';combatExpertRoll', ctx);
      const normal = await run('Finna dolda ting', 10);
      const pilot = resolveAdventureSkill('lyra', 'search', faces(...rolls));
      expect(pilot).toMatchObject({fv: 10, outcome: expected, success: normal.success,
        roll: normal.roll, confirmationRoll: normal.confirmation_roll});
      expect(normal.outcome).toBe(expected);
      expect(requests.every(request => request.sides === 20)).toBe(true);
      expect(requests.length).toBe(rolls.length);
      if (requests.length > 1) expect(requests[1].label).toContain('kontrollslag');
    }
    expect(resolveAdventureSkill('lyra', 'danger', faces(7))).toMatchObject({fv: 4, outcome: 'fail'});
  });
  it('orders living actors by SMI + T10 and filters the projected queue while preserving known turns', () => {
    const battle = createEncounter(heroes, faces(1, 9, 1, 10));
    expect(battle.order).toEqual(['lyra', 'guard', 'evalin', 'astrid']);
    command(battle, {type: 'nextTurn'});
    const player = projectEncounter(battle, ['lyra', 'evalin', 'astrid']);
    expect(player.activeActorId).toBeNull();
    expect(JSON.stringify(player)).not.toContain('guard');
    expect(projectEncounter(battle, ['guard']).activeActorId).toBe('guard');
    battle.combatants.find(row => row.id === 'evalin').hp = 0;
    command(battle, {type: 'nextTurn'});
    expect(battle.activeActorId).toBe('astrid');
    command(battle, {type: 'nextTurn'});
    expect(battle.round).toBe(2);
    expect(battle.order).not.toContain('evalin');
  });
  it('applies the round movement budget across commands and preserves a single action up to half movement', () => {
    const battle = newBattle();
    expect(battle.activeActorId).toBe('evalin');
    command(battle, {type: 'move', cost: 3});
    command(battle, {type: 'move', cost: 4});
    const evalin = battle.combatants.find(row => row.id === 'evalin');
    expect(evalin.actionAvailable).toBe(true);
    command(battle, {type: 'move', cost: 1});
    expect(evalin.actionAvailable).toBe(false);
    expect(() => command(battle, {type: 'switchWeapon'})).toThrow(/förbrukat/);
    command(battle, {type: 'move', cost: 7});
    expect(() => command(battle, {type: 'move', cost: 1})).toThrow(/rörelsebudgeten/);
    const fresh = newBattle();
    command(fresh, {type: 'switchWeapon'});
    command(fresh, {type: 'move', cost: 4});
    expect(() => command(fresh, {type: 'move', cost: 4})).toThrow(/halv/);
    command(fresh, {type: 'move', cost: 3});
    expect(() => command(fresh, {type: 'switchWeapon'})).toThrow(/förbrukat/);
  });
  it('requires the active actor, valid target, individual sight and valid reach, without spending rejected attacks', () => {
    const battle = newBattle();
    expect(() => command(battle, {type: 'attack', actorId: 'lyra', targetId: 'guard'})).toThrow(/initiativet/);
    for (const targetId of ['evalin', 'astrid', 'bogus']) {
      expect(() => command(battle, {type: 'attack', targetId})).toThrow(/synligt/);
    }
    expect(() => command(battle, {type: 'attack', targetId: 'guard'}, {canSee: () => false})).toThrow(/synligt/);
    expect(() => command(battle, {type: 'attack', targetId: 'guard'}, {distanceHexes: () => 13})).toThrow(/räckhåll/);
    const hit = command(battle, {type: 'attack', targetId: 'guard'}, {die: faces(1, 7, 4), distanceHexes: () => 1});
    expect(hit.result).toMatchObject({outcome: 'perfect', damage: 7, hpBefore: 10, hpAfter: 3, hitLocation: 'Bröstkorg'});
    expect(hit.thrown).toBe(false);
    expect(() => command(battle, {type: 'attack', targetId: 'guard'})).toThrow(/förbrukat/);
  });
  it('retains hit points and thrown equipment across return to exploration and a later encounter', () => {
    const battle = newBattle();
    const hit = command(battle, {type: 'attack', targetId: 'guard'}, {die: faces(8, 8, 6), distanceHexes: () => 6});
    expect(hit.result).toMatchObject({outcome: 'success', damage: 5, hpAfter: 5});
    expect(hit).toMatchObject({targetId: 'guard', hp: 5, weaponIndex: -1, thrown: true});
    const persistent = heroes.map(row => row.id === 'guard' ? {...row, hp: hit.hp} :
      row.id === 'evalin' ? {...row, weaponIndex: hit.weaponIndex, thrown: hit.thrown} : row);
    const later = createEncounter(persistent, fixed);
    expect(projectEncounter(later, ['guard']).combatants[0].hp).toBe(5);
    expect(projectEncounter(later, ['evalin']).combatants[0].weapon).toBe('Tom hand');
    expect(() => command(later, {type: 'switchWeapon'})).toThrow(/slagfältet/);
  });
});
