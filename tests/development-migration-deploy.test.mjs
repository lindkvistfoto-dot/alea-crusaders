import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { prepareDevMigrations } from '../scripts/prepare-dev-migrations.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('DEV database migration deployment', () => {
  const workflow = read('../.github/workflows/deploy-development-migrations.yml');

  it('reruns the existing guarded DEV deployment when its workflow changes', () => {
    expect(workflow).toContain('      - supabase/migrations/**');
    expect(workflow).toContain('      - .github/workflows/deploy-development-migrations.yml');
    expect(workflow).toContain('direct = u.hostname == "db.wkiuyklzzroavclnsxna.supabase.co"');
    expect(workflow).toContain("grep -q 'development_schema_baseline' <<< \"$plan\"");
  });

  it('includes older local migrations explicitly during both plan and push', () => {
    expect(workflow).toContain('supabase db push --dry-run --include-all --db-url');
    expect(workflow).toContain('supabase db push --include-all --db-url');
  });

  it('accepts an auth trigger migration already recorded in DEV history', () => {
    expect(workflow).toContain("-name '*_restore_auth_user_profile_trigger.sql'");
    expect(workflow).toContain('auth_applied="$(psql');
    expect(workflow).toContain('if [[ "$auth_applied" != "t" ]] && ! grep -q');
    expect(workflow).not.toContain("grep -q 'restore_auth_user_profile_trigger' <<< \"$plan\" ||");
  });

  it('reports a missing storage table and a permission failure distinctly', () => {
    const edge = read('../supabase/functions/olympia-control/index.ts');
    expect(edge).toContain('databaseCode === "PGRST205"');
    expect(edge).toContain('UPPSLAG-tabellen saknas i DEV-databasen');
    expect(edge).toContain('databaseCode === "42501"');
    expect(edge).toContain('Zeus saknar administratörsbehörighet för UPPSLAG i DEV.');
  });
});

const migrations = new URL('../supabase/migrations/',import.meta.url);
const copyDirectories = [];
function tempMigrations() {
  const path = mkdtempSync(join(tmpdir(),'alea-dev-migrations-'));
  copyDirectories.push(path);
  cpSync(migrations,path,{recursive:true});
  return path;
}
afterEach(() => {
  for (const path of copyDirectories.splice(0)) rmSync(path,{recursive:true,force:true});
});

function recordedDevRows() {
  const entries = [
    ['public_api_grant_baseline','20261116142344','20261116143337'],
    ['hermes_core_target_grants','20261116150000','20261116150313'],
    ['arcane_kartakademin','20261117225000','20261118044459']
  ];
  return entries.map(([name,local,version])=>{
    let sql=readFileSync(new URL(local+'_'+name+'.sql',migrations),'utf8');
    if (name==='arcane_kartakademin'){
      // Historical member projection returned unadjusted direction and no beam metadata.
      sql=sql.replace(/    'beam',item->'beam',[\s\S]+?else item->'direction' end,/,
        "    'range',item->'range', 'height',item->'height', 'direction',item->'direction',");
    }
    return {version,name,statements:[sql]};
  });
}

it('plans the DEV timestamps without skipping the missing object schema or replaying academy DDL', async () => {
  const dir=tempMigrations(), rows=recordedDevRows();
  prepareDevMigrations(dir,rows);
  const files=readdirSync(dir);
  expect(files).toContain('20261117070000_arcane_object_library.sql');
  expect(files.filter(file=>file.endsWith('_public_api_grant_baseline.sql'))).toEqual(['20261116143337_public_api_grant_baseline.sql']);
  expect(files.filter(file=>file.endsWith('_hermes_core_target_grants.sql'))).toEqual(['20261116150313_hermes_core_target_grants.sql']);
  for (const row of rows) expect(files).toContain(row.version+'_'+row.name+'.sql');
  const planned = files.filter(file=>!rows.some(row=>file.startsWith(row.version))).sort();
  const rpcUpdate='20261117225000_arcane_kartakademin.sql';
  expect(planned.indexOf('20261117070000_arcane_object_library.sql')).toBeLessThan(planned.indexOf(rpcUpdate));
  const upgrade=readFileSync(join(dir,rpcUpdate),'utf8');
  expect(upgrade).not.toMatch(/create table|create policy/i);
  const pg=new PGlite();
  try{
    await pg.exec("create role anon; create role authenticated; create function read_campaign_map_academy_player(p_map_id uuid) returns jsonb language sql as 'select null::jsonb'");
    await pg.exec(upgrade);
    const functionSql=(await pg.query("select pg_get_functiondef('read_campaign_map_academy_player(uuid)'::regprocedure) as sql")).rows[0].sql;
    expect(functionSql).toContain("'beamWidth',item->'beamWidth'");
    expect(functionSql).toContain("(config->>'north')::numeric - 90");
    expect((await pg.query("select has_function_privilege('anon','read_campaign_map_academy_player(uuid)','EXECUTE') as ok")).rows).toEqual([{ok:false}]);
  }finally{await pg.close();}
});

it('leaves a fresh/canonical history alone, preserves already registered pairs and rejects unverified variants',()=>{
  const fresh=tempMigrations();
  prepareDevMigrations(fresh,[]);
  expect(readdirSync(fresh)).toEqual(readdirSync(migrations));
  const both=tempMigrations(), rows=recordedDevRows();
  prepareDevMigrations(both,[...rows,{version:'20261116142344'}]);
  expect(existsSync(join(both,'20261116142344_public_api_grant_baseline.sql'))).toBe(true);
  expect(existsSync(join(both,'20261116143337_public_api_grant_baseline.sql'))).toBe(true);
  const changed={...rows[2],statements:['select 42;']};
  expect(()=>prepareDevMigrations(tempMigrations(),[changed])).toThrow(/Oväntad migrationshistorik/);
});
