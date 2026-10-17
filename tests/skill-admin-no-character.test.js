import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the actual admin save/delete handlers with no character selected.
// In admin mode, "current" is null, so character-only rendering is forbidden.
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const lines=app.split(/\r?\n/);
const handlers=[
  lines.find(line=>line.startsWith("async function saveRuleSkill(id=")),
  lines.find(line=>line.startsWith('async function deleteRuleSkill(id)'))
];
if(handlers.some(line=>!line))throw Error('Could not find skill admin handlers');

function harness(character=null){
  const requests=[],alerts=[],calls={closed:0,list:0,adminRender:0,characterRender:0};
  const ruleSkills=[{id:'spara',name:'Spåra',icon_path:'skill/spara/icon/test.png',illustration_path:'skill/spara/illustration/test.png'}];
  const inputs={rsName:'Spåra',rsType:'UPF',rsGrund:'INT',rsExpertCategory:'A',rsCost:'2',rsBc:'0',rsDesc:'Beskrivning'};
  const ctx={
    activeUser:()=>({admin:true}),
    document:{getElementById:id=>({value:inputs[id]})},
    $:id=>({value:inputs[id]}),
    ruleSkills,chars:[],current:character,
    alert:msg=>alerts.push(msg),
    dbJson:async(url,options)=>{requests.push({url,options});return []},
    closeAdminEditor:()=>{calls.closed++},
    loadRuleSkills:async()=>{calls.list++},
    renderAdminSkills:()=>{calls.adminRender++},
    renderSkills:()=>{calls.characterRender++;if(!ctx.current)throw Error("Cannot read properties of null (reading 'heroAbilities')")},
    askConfirm:async()=>true
  };
  runInNewContext(handlers.join('\n'),ctx);
  return {ctx,requests,alerts,calls};
}

describe('Master skill admin save/delete without an active character',()=>{
  it('saves an edited master skill and refreshes admin without accessing heroAbilities',async()=>{
    const {ctx,requests,alerts,calls}=harness();
    await ctx.saveRuleSkill('spara');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('rule_skills?id=eq.spara');
    expect(requests[0].options.method).toBe('PATCH');
    expect(JSON.parse(requests[0].options.body)).not.toHaveProperty('icon_path');
    expect(JSON.parse(requests[0].options.body)).not.toHaveProperty('illustration_path');
    expect(calls).toEqual({closed:1,list:1,adminRender:1,characterRender:0});
    expect(alerts).toEqual([]);
  });

  it('can create a master skill without a selected character',async()=>{
    const {ctx,requests,alerts,calls}=harness();
    await ctx.saveRuleSkill();
    expect(requests).toHaveLength(1);
    expect(requests[0].options.method).toBe('POST');
    expect(JSON.parse(requests[0].options.body).id).toBe('spara_2');
    expect(calls.characterRender).toBe(0);
    expect(alerts).toEqual([]);
  });

  it('can delete a master skill without a selected character',async()=>{
    const {ctx,requests,alerts,calls}=harness();
    await ctx.deleteRuleSkill('spara');
    expect(requests).toHaveLength(1);
    expect(requests[0].options.method).toBe('DELETE');
    expect(calls.adminRender).toBe(1);
    expect(calls.characterRender).toBe(0);
    expect(alerts).toEqual([]);
  });

  it('still redraws character skills when a character is active',async()=>{
    const {ctx,calls,alerts}=harness({id:'hero',heroAbilities:[]});
    await ctx.saveRuleSkill('spara');
    await ctx.deleteRuleSkill('spara');
    expect(calls.characterRender).toBe(2);
    expect(alerts).toEqual([]);
  });
});
