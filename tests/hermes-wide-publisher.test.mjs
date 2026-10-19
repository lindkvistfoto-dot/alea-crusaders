import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=readFileSync(new URL('../scripts/hermes2_publish.ts',import.meta.url),'utf8');
const logic=source.slice(source.indexOf('function illustrationUuid'),source.indexOf('async function publish'));
const check=vm.runInNewContext(stripTypeScriptTypes(logic+'\ncheckAsset;'));
function asset(kind,width=640,height=640){
 const sha='a'.repeat(64);return {kind,target_key:'forsta-hjalpen',source_sha256:sha,app_sha256:sha,
 source_path:`assets/hermes/originals/${kind}/forsta-hjalpen/${sha}.png`,
 app_file:`${kind}/forsta-hjalpen/${sha}.webp`,width,height,
 alpha_preserved:!['skill-illustration','skill-illustration-wide'].includes(kind)};
}
describe('HERMES WIDE publisher routing',()=>{
 it('routes native WIDE to private skill path and only the WIDE field',()=>{
  const result=check(asset('skill-illustration-wide',1672,941));
  expect(result.table).toBe('rule_skills');expect(result.field).toBe('id');
  expect(result.assetField).toBe('illustration_wide_path');
  expect(result.appPath).toMatch(/^skill\/forsta_hjalpen\/illustration_wide\/[a-f0-9-]+\.webp$/);
 });
 it('retains older image field routing',()=>{
  for(const kind of ['spell','symbol','skill','skill-illustration']){
   expect(check(asset(kind)).assetField).toBe(kind==='skill-illustration'?'illustration_path':'icon_path');
  }
 });
 it('rejects square, portrait, oversized or nonintegral WIDE metadata',()=>{
  for(const [w,h] of [[640,640],[941,1672],[4096,2304],[1672.1,941]])
   expect(()=>check(asset('skill-illustration-wide',w,h))).toThrow();
 });
 it('does not accept WIDE using a legacy square profile',()=>{
  expect(()=>check(asset('skill-illustration',1672,941))).toThrow();
 });
});

describe('HERMES independent art activation',()=>{
 it('does not reject a successful slot activation because sibling art changed concurrently',()=>{
  expect(source).not.toContain('EXISTING_SPELL_ART_CHANGED_DURING_WIDE_ACTIVATION');
  expect(source).not.toContain('EXISTING_SPELL_ART_CHANGED_DURING_SQUARE_ACTIVATION');
  expect(source).not.toContain('EXISTING_ART_CHANGED_DURING_WIDE_ACTIVATION');
  expect(source).toContain('final?.[assetField]!==appPath');
  expect(source).toContain('q=previous===null?q.is(assetField,null):q.eq(assetField,previous)');
 });
});
