import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const migrationsDir = resolve(root, 'supabase/migrations');
const manifestPath = resolve(root, 'supabase/legacy-migrations/live-history-recovery-manifest.json');

describe('LIVE migration history recovery', () => {
  it('represents every verified LIVE ledger version with an inert marker', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(manifest.live_project_id).toBe('wbmosmkirsitkonejzpg');
    expect(manifest.ledger_entry_count).toBe(178);
    expect(manifest.historical_migrations).toHaveLength(manifest.ledger_entry_count);

    for (const migration of manifest.historical_migrations) {
      const expectedName = `${migration.version}_${migration.name}.sql`;
      expect(migration.active_marker).toBe(`supabase/migrations/${expectedName}`);
      const sql = await readFile(resolve(root, migration.active_marker), 'utf8');
      expect(sql.replace(/--[^\n]*(?:\n|$)/g, '').trim()).toBe('');
      expect(createHash('sha256').update(sql).digest('hex')).toBe(migration.marker_sha256);
      if (migration.source_path) {
        const source = await readFile(resolve(root, migration.source_path));
        expect(createHash('sha256').update(source).digest('hex')).toBe(migration.source_sha256);
      }
    }
  });

  it('leaves only the explicitly approved forward migrations executable', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const activeFiles = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
    const historical = new Set(manifest.historical_migrations.map((migration) => migration.active_marker.split('/').at(-1)));
    const expected = [...historical, ...manifest.pending_candidate_migrations].sort();
    expect(activeFiles).toEqual(expected);
    expect(manifest.pending_candidate_migrations).toHaveLength(8);
  });
});
