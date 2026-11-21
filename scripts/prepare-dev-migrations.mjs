// DEV has three previously applied migrations recorded under different timestamps.
// Work on a disposable copy. Never change the database's migration ledger.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const aliases = [
  ['public_api_grant_baseline','20261116142344','20261116143337',
    'bbabc8484dc26de85f7ab22bc6486df3e5ad2d563bc4677db29852a97f82e1ab'],
  ['hermes_core_target_grants','20261116150000','20261116150313',
    '52fc7a2423644bb779f9ac4bd54ab9058bf1a102868d43ae55e713d2e5272065'],
  ['arcane_kartakademin','20261117225000','20261118044459',
    '9b5d76e1a72c8e3cc1a48858431e7a701124c1607d31e0a61ce20b737b879d7f',
    'af947204424eb164e5b685832a42299ffae511b8d59db3b60f99e43f28491250']
];
const digest = sql => createHash('sha256').update(sql.replace(/\n+$/, '')+'\n').digest('hex');

export function prepareDevMigrations(directory, rows) {
  const history = new Map(rows.map(row => [row.version,row]));
  for (const [name,sourceVersion,appliedVersion,oldHash,newHash=oldHash] of aliases) {
    const record = history.get(appliedVersion);
    if (!record) continue;
    const sourcePath = join(directory, sourceVersion+'_'+name+'.sql');
    const appliedPath = join(directory, appliedVersion+'_'+name+'.sql');
    const source = readFileSync(sourcePath, 'utf8');
    const applied = record.statements?.length === 1 ? record.statements[0] : null;
    if (record.name!==name || typeof applied!=='string' || digest(applied)!==oldHash || digest(source)!==newHash)
      throw Error('Oväntad migrationshistorik eller källfil för '+name+'. Granska före DEV-publicering.');
    if (existsSync(appliedPath)) throw Error('Två lokala migrationer har samma DEV-version '+appliedVersion+'.');
    if (oldHash===newHash && !history.has(sourceVersion)) {
      renameSync(sourcePath, appliedPath);
      continue;
    }
    writeFileSync(appliedPath, applied);
    if (oldHash!==newHash) {
      // Its tables and policies were already installed. Apply only the known
      // change to the existing player RPC, including the original EXECUTE ACL.
      const definition = 'create function public.read_campaign_map_academy_player(';
      const playerFunction = source.slice(source.indexOf(definition));
      const update = playerFunction.replace(/^create function/, 'create or replace function');
      writeFileSync(sourcePath, update);
    }
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  prepareDevMigrations(process.argv[2], JSON.parse(readFileSync(0,'utf8')));
