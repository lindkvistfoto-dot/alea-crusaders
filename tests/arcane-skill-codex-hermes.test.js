import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const intake=read('scripts/hermes_drive_intake.py');
const prepare=read('scripts/hermes_ui_prepare.py');
const publish=read('scripts/publish_hermes_ui.mjs');
const workflow=read('.github/workflows/hermes-ui-intake.yml');
const keys=['outer-frame','header','leather','dark-panel','parchment-fishing','parchment-neutral','stat-plate',
 'medallion','close-button','divider','illustration-frame','ornament'];
describe('HERMES ARCANE SKILL CODEX: scoped public UI art profile',()=>{
 it('preserves old HERMES UI keys while adding all Codex asset identities',()=>{
  for(const suffix of keys){
   const key='arcane-skill-codex-'+suffix;
   expect(intake).toContain(key);
   expect(prepare).toContain(key);
   expect(publish).toContain(key);
   expect(workflow).toContain('arcane-skill-codex-');
  }
  expect(intake).toContain('arcane-gallery-goose-seal');
  expect(prepare).toContain('arcane-mechanism-link');
 });
 it('requires real alpha and bounded sizes for decorative resources',()=>{
  expect(intake).toContain('CODEX_UI_REQUIRES_RGBA');
  expect(intake).toContain('CODEX_UI_REQUIRES_TRUE_ALPHA');
  expect(prepare).toContain('HERMES_CODEX_REQUIRES_ALPHA');
  expect(prepare).toContain('required_alpha = image.getchannel("A").tobytes()');
  expect(prepare).toContain('HERMES_UI_WEBP_SIZE_INVALID');
 });
 it('sends only statically named skill UI resources to GitHub pages, never DB writes',()=>{
  expect(prepare).toContain('features/skills/codex-assets');
  expect(publish).toContain('features/skills/codex-assets/');
  expect(publish).not.toContain('rule_skills.icon_path');
  expect(publish).not.toContain('dbJson(');
  expect(workflow).toContain('HERMES_SOURCE_PATH');
 });
 it('Python scripts compile (no runtime credentials needed)',()=>{
  const check=spawnSync('python3',['-c',
   "import ast,pathlib;[ast.parse(pathlib.Path(p).read_text()) for p in ['scripts/hermes_drive_intake.py','scripts/hermes_ui_prepare.py']]"],
   {cwd:new URL('..',root),encoding:'utf8'});
  expect(check.status,check.stderr).toBe(0);
 });
});
