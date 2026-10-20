import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {validateHermes3Job,validateHermes3Files} from '../scripts/hermes3_policy.mjs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const profiles=JSON.parse(read('config/hermes3-profiles.json'));
const approved=()=>({
 schema:3,job_id:'arcane-gallery-kit-v02',profile:'ui-sprite-package',
 source:{provider:'google-drive',file_id:'1nuNe0qhqFpER0FOB0qQt2Dn4U-KAJ-7W',
  sha256:'4878fe146bcaaf301e535b34fc9402ecaa5eff33e9caa0adfb2910984c314178',
  mime_type:'application/zip',visibility:'public',public_release_approved:true},
 target:{category:'ui-components',key:'arcane-gallery'},intent:'verify-only'
});

describe('HERMES 3: security, publication and staging boundary',()=>{
 it('accepts only a declared public source from the established Drive inbox',()=>{
  expect(validateHermes3Job(approved(),profiles)).toMatchObject({
   job_id:'arcane-gallery-kit-v02',media:'ui-components',bytes_limit:8388608
  });
 });
 it('rejects private media even if a source checksum exists',()=>{
  for(const bad of [
   {source:{...approved().source,visibility:'private'}},
   {source:{...approved().source,public_release_approved:false}},
   {source:{...approved().source,provider:'github'}},
   {source:{...approved().source,mime_type:'application/javascript'}},
   {profile:'private-campaign-material'}, {profile:'video'}
  ])expect(()=>validateHermes3Job({...approved(),...bad},profiles)).toThrow(/HERMES3_POLICY/);
 });
 it('rejects path traversal, attempts to control destination and unknown profiles',()=>{
  for(const bad of [
   {job_id:'../main'},
   {intent:'publish'},
   {target:{category:'ui-components',key:'../../secret'}},
   {target:{category:'public-scene',key:'arcane-gallery'}},
   {source:{...approved().source,extra_destination:'supabase'}},
   {unexpected:'deploy'}
  ])expect(()=>validateHermes3Job({...approved(),...bad},profiles)).toThrow(/HERMES3_POLICY/);
 });
 it('requires real provider-owned IDs and strong SHA-256 fingerprints',()=>{
  for(const bad of [
   {source:{...approved().source,file_id:'not a file ID'}},
   {source:{...approved().source,sha256:'aaaa'}},
   {source:{...approved().source,sha256:'A'.repeat(64)}}
  ])expect(()=>validateHermes3Job({...approved(),...bad},profiles)).toThrow(/HERMES3_POLICY/);
 });
 it('allows no staging job to point outside hermes3/requests',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes3-'));
  try{
   fs.mkdirSync(path.join(root,'config'));fs.mkdirSync(path.join(root,'hermes3/requests'),{recursive:true});
   fs.writeFileSync(path.join(root,'config/hermes3-profiles.json'),JSON.stringify(profiles));
   fs.writeFileSync(path.join(root,'hermes3/requests/test-job.json'),JSON.stringify(approved()));
   expect(validateHermes3Files(root,['hermes3/requests/test-job.json'])).toHaveLength(1);
   expect(()=>validateHermes3Files(root,['../../etc/passwd'])).toThrow(/REQUEST_PATH/);
   expect(()=>validateHermes3Files(root,['hermes3/requests/../escape.json'])).toThrow(/REQUEST_PATH/);
   expect(validateHermes3Files(root,['--all'])).toHaveLength(1);
   fs.unlinkSync(path.join(root,'hermes3/requests/test-job.json'));
   expect(validateHermes3Files(root,['--all'])).toEqual([]);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 it('never grants PR workflow Google credentials or write access',()=>{
  const staging=read('.github/workflows/hermes3-staging.yml');
  const trusted=read('.github/workflows/hermes3-trusted-verify.yml');
  expect(staging).toContain('pull_request:');
  expect(staging).toContain('contents: read');
  expect(staging).not.toContain('id-token: write');
  expect(staging).not.toContain('google-github-actions/auth');
  expect(staging).not.toContain('pull_request_target:');
  expect(trusted).toContain('workflow_dispatch:');
  expect(trusted).toContain("github.ref == 'refs/heads/main'");
  expect(trusted).toContain('id-token: write');
  expect(trusted).toContain('access_token_scopes: https://www.googleapis.com/auth/drive.readonly');
  expect(trusted).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(trusted).not.toContain('contents: write');
 });
});
