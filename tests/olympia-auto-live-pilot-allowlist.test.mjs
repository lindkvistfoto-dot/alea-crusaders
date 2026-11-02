import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function autoPrepareLiveCandidate(');
const end=source.indexOf('async function appBotLogin()',start);
const fnSource=stripTypeScriptTypes(source.slice(start,end),{mode:'strip'});
const create=(flag,pilot)=>new Function('Deno','workItem',fnSource+'\nreturn autoPrepareLiveCandidate;')({env:{get:key=>key==='OLYMPIA_AUTO_LIVE_CANDIDATE'?flag:pilot}},async()=>{throw Error('SHOULD_NOT_TOUCH_GITHUB')});
describe('OLYMPIA automatic LIVE candidate pilot allowlist',()=>{
 it('is disabled without explicit enable flag',async()=>expect((await create(null,'502')('token',502,'Zeus',{})).state).toBe('disabled'));
 it('rejects absent pilot PR even when enabled',async()=>expect((await create('enabled',null)('token',502,'Zeus',{})).state).toBe('not_selected'));
 it('rejects other PR numbers before any GitHub action',async()=>expect((await create('enabled','502')('token',506,'Zeus',{})).state).toBe('not_selected'));
 it('rejects malformed allowlist values',async()=>expect((await create('enabled','502,506')('token',502,'Zeus',{})).state).toBe('not_selected'));
});
