import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../features/skills/admin-art.js',import.meta.url),'utf8');
const uuid='be3399dd-6543-4bfc-8c83-83c2327f1011';
function harness({width=1024,height=1024,alpha=0}={}){
 const row={id:'klattra',name:'Klättra',icon_path:null,illustration_path:null};
 const requests=[],patches=[],revoked=[];
 const context={
  window:{},ruleSkills:[row],activeUser:()=>({admin:true}),
  Image:class {naturalWidth=width;naturalHeight=height;set src(_){this.onload?.()}},
  URL:{createObjectURL:()=>('blob:example-'+revoked.length),revokeObjectURL:url=>revoked.push(url)},
  document:{
   querySelector:()=>null,
   createElement:tag=>tag==='canvas'?{getContext:()=>({drawImage(){},getImageData:()=>({data:[0,0,0,alpha]})})}:null
  },
  crypto:{randomUUID:()=>uuid},
  mapStorageFetch:async(path,options)=>{
   requests.push({path,...options});
   return options.method==='POST'?{ok:true}:{ok:true,blob:async()=>({size:200,type:'image/png'})};
  },
  dbJson:async(path,options)=>{patches.push({path,payload:JSON.parse(options.body)});return [{id:row.id}]},
  loadRuleSkills:async()=>[row],
  renderAdminSkills:()=>{},
  console,confirm:()=>true
 };
 runInNewContext(src,context);
 context.window.aleaSkillArt.hydrate(row.id);
 return {art:context.window.aleaSkillArt,row,requests,patches,revoked};
}
const file=(type='image/png')=>({type,size:1234});
describe('skill artwork upload behavior',()=>{
 it('saves only icon_path with the original transparent PNG file',async()=>{
  const t=harness();const input={files:[file()],value:'selected'};
  await t.art.upload({target:input},'klattra','icon');
  expect(input.value).toBe('');
  expect(t.requests[0].method).toBe('POST');
  expect(t.requests[0].path).toContain('/skill/klattra/icon/'+uuid+'.png');
  expect(t.requests[0].body).toBe(input.files[0]);
  expect(t.patches).toHaveLength(1);
  expect(Object.keys(t.patches[0].payload)).toEqual(['icon_path']);
  expect(t.row.illustration_path).toBeNull();
 });
 it('saves illustration independently, accepting photographic JPEG',async()=>{
  const t=harness();
  await t.art.upload({target:{files:[file('image/jpeg')],value:''}},'klattra','illustration');
  expect(t.requests[0].path).toContain('/skill/klattra/illustration/'+uuid+'.jpg');
  expect(Object.keys(t.patches[0].payload)).toEqual(['illustration_path']);
  expect(t.row.icon_path).toBeNull();
 });
 it('rejects opaque icons before uploading them',async()=>{
  const t=harness({alpha:255});
  await t.art.upload({target:{files:[file()],value:''}},'klattra','icon');
  expect(t.requests).toHaveLength(0);
  expect(t.patches).toHaveLength(0);
 });
 it('rejects nonsquare illustrations and oversized input',async()=>{
  const a=harness({width:1024,height:900});
  await a.art.upload({target:{files:[file()],value:''}},'klattra','illustration');
  expect(a.requests).toHaveLength(0);
  const b=harness();
  await b.art.upload({target:{files:[{type:'image/png',size:17*1024*1024}],value:''}},'klattra','illustration');
  expect(b.requests).toHaveLength(0);
 });
 it('removes a link without deleting immutable files from storage',async()=>{
  const t=harness();
  await t.art.upload({target:{files:[file()],value:''}},'klattra','icon');
  await t.art.remove('klattra','icon');
  expect(t.patches.at(-1).payload).toEqual({icon_path:null});
  expect(t.requests.filter(r=>r.method==='DELETE')).toHaveLength(0);
 });
});
