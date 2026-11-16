import { describe, expect, it } from 'vitest';
import { createCoreSystemReservation } from '../features/hermes-core/system-reservation.js';

describe('HERMES CORE system asset reservation', () => {
  const reserve = createCoreSystemReservation();
  const digest = 'a'.repeat(64);

  it.each([
    'ARCANE_MAP_ICON_ENEMY',
    'ARCANE_MAP_ICON_HIDDEN',
    'ARCANE_MAP_ICON_ITEM',
    'ARCANE_MAP_ICON_NPC',
    'ARCANE_MAP_ICON_TRAP',
    'ARCANE_MAP_ICON_EVENT',
  ])('reserves the immutable path for %s', async id => {
    const metadata = { sha256: digest };
    await expect(reserve({ target: { kind: 'system', id }, metadata })).resolves.toEqual({
      key: `hermes/system-asset/${id}/${digest}.webp`,
      path: `hermes/system-asset/${id}/${digest}.webp`,
      metadata,
    });
  });

  it('continues to accept existing lowercase system keys', async () => {
    const metadata = { sha256: digest };
    await expect(reserve({
      target: { kind: 'system', id: 'arcane-example-icon' },
      metadata,
    })).resolves.toMatchObject({ path: `hermes/system-asset/arcane-example-icon/${digest}.webp` });
  });

  it('rejects malformed uppercase system keys', async () => {
    await expect(reserve({
      target: { kind: 'system', id: 'ARCANE-MAP-ICON' },
      metadata: { sha256: digest },
    })).rejects.toThrow('System image target required');
  });
});
