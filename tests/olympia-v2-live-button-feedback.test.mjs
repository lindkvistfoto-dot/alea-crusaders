import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('OLYMPIA LIVE mobile status',()=>{
 it('removes obsolete double-approval buttons',()=>{
  expect(html).not.toContain('data-live-accept');
  expect(html).not.toContain('data-live-pandora');
  expect(html).toContain('data-candidate-status');
 });
 it('keeps automatic status with Zeus verification',()=>{
  expect(js).toContain('window.olympiaV2CheckCandidateStatuses=async');
  expect(js).toContain('if(!verified)');
  expect(js).toContain('LIVE-status kunde inte hämtas');
 });
});
