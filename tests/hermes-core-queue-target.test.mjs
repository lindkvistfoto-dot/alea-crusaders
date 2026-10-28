import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {normalizeCoreQueueTarget} from '../features/hermes-core/queue-target.js';
const uuid='6a67121d-67ee-4943-82a3-83a15334d815';
test('legacy schema 1 system requests stay supported',()=>{
 assert.deepEqual(normalizeCoreQueueTarget({schema:1,asset_key:'arcane-trophy-room-v2.2',label:'Room'}),{kind:'system',id:'arcane-trophy-room-v2.2',label:'Room'});
});
test('schema 2 supports honor definitions and reliefs',()=>{
 assert.equal(normalizeCoreQueueTarget({schema:2,target:{kind:'honor-definition',id:uuid}}).kind,'honor-definition');
 assert.equal(normalizeCoreQueueTarget({schema:2,target:{kind:'honor-relief',id:uuid,material:'enamel'}}).material,'enamel');
});
test('rejects unknown kind, unsafe ID, material and schema',()=>{
 for(const request of [
  {schema:3}, {schema:2,target:{kind:'anything',id:uuid}},
  {schema:2,target:{kind:'honor-relief',id:'../bad'}},
  {schema:2,target:{kind:'honor-relief',id:uuid,material:'unknown'}},
 ]) assert.throws(()=>normalizeCoreQueueTarget(request));
});
