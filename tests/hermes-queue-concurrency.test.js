import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const drive=readFileSync(new URL('../.github/workflows/hermes-drive-intake.yml',import.meta.url),'utf8');
const ui=readFileSync(new URL('../.github/workflows/hermes-ui-intake.yml',import.meta.url),'utf8');
const intake=readFileSync(new URL('../scripts/hermes_drive_intake.py',import.meta.url),'utf8');
describe('HERMES queue concurrency safeguards',()=>{
 it('keys Drive jobs to their distinct push commit',()=>{
  expect(drive).toContain('group: hermes-drive-queue-${{ github.sha }}');
  expect(drive).toContain('cancel-in-progress: false');
 });
 it('keys UI publisher jobs to their immutable asset source',()=>{
  expect(ui).toContain('group: hermes-ui-publisher-${{ inputs.source_path }}');
  expect(ui).toContain('cancel-in-progress: false');
 });
 it('permits verified large original JSON read-back, not the old 1MiB truncation',()=>{
  expect(intake).toContain('result.read(MAX_BYTES * 2)');
  expect(intake).not.toContain('else 1024 * 1024');
 });
});
