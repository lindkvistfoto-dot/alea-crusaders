import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync(new URL('../features/skills/admin-art.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/skills/admin-art.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function harness({width=1600,height=900,type='application/octet-stream',filename='fiska.webp',admin=true}={}){
 const status={textContent:'',dataset:{}};
 const uploadButton={firstChild:{textContent:''}};
 const remove={disabled:false};
 const preview={replaceChildren:vi.fn(),innerHTML:''};
 const pane={
  querySelector:selector=>({
   '.skill-art-status':status,
   '.skill-art-upload':uploadButton,
   'button':remove,
   '.skill-art-preview':preview
  }[selector]||null),
  querySelectorAll:()=>[]
 };
 let notice=null;
 const doc={
  body:{appendChild:el=>{notice=el}},
  getElementById:id=>id==='skillArtUploadNotice'?notice:null,
  querySelector:selector=>selector.includes('.skill-art-slot')?pane:null,
  createElement:()=>({
   dataset:{},className:'',textContent:'',setAttribute:vi.fn(),
   replaceChildren:vi.fn(),classList:{add:vi.fn(),remove:vi.fn()}
  })
 };
 const file={name:filename,type,size:2000};
 const input={files:[file],value:'Android content URI selected'};
 const storage=vi.fn(async(_path,options)=>{
  // Regression: Drive selection must remain intact until it has been read.
  if(options.method==='POST')expect(input.value).toBe('Android content URI selected');
  return {ok:true,blob:async()=>({size:100,type:'image/webp'})};
 });
 const ruleSkills=[{id:'fiska',name:'Fiska',illustration_wide_path:null}];
 const win={};
 const context={
  window:win,document:doc,ruleSkills,
  activeUser:()=>({admin}),URL:{createObjectURL:()=>('blob:mock'),revokeObjectURL:()=>{}},
  Image:class {naturalWidth=width;naturalHeight=height;set src(_value){this.onload?.()}},
  crypto:{randomUUID:()=>('a3729cc1-a80d-48d3-b162-d8a196d78054')},
  mapStorageFetch:storage,dbJson:vi.fn(async()=>[{}]),
  loadRuleSkills:vi.fn(async()=>ruleSkills),renderAdminSkills:vi.fn(),
  console:{warn:vi.fn()}
 };
 runInNewContext(js,context);
 win.aleaSkillArt.hydrate('fiska');
 return {win,input,status,storage,context,ruleSkills,getNotice:()=>notice,preview};
}

describe('Android DocumentsProvider skill-art upload',()=>{
 it('returns to the admin modal with prominent feedback on success',async()=>{
  const h=harness();
  await h.win.aleaSkillArt.upload({target:h.input},'fiska','illustration_wide');
  expect(h.getNotice().hidden).toBe(false);
  expect(h.getNotice().dataset.state).toBe('success');
  expect(h.getNotice().textContent).toContain('Sparad!');
  expect(h.ruleSkills[0].illustration_wide_path).toContain('/illustration_wide/');
  expect(h.storage.mock.calls.some(c=>c[0].includes('/illustration_wide/'))).toBe(true);
  expect(h.input.value).toBe('');
 });
 it('supports a generic MIME provided by Android Drive when actual image decodes',async()=>{
  const h=harness({filename:'fiska.jpg',type:'application/octet-stream'});
  await h.win.aleaSkillArt.upload({target:h.input},'fiska','illustration_wide');
  const call=h.storage.mock.calls.find(c=>c[1].method==='POST');
  expect(call[1].headers['Content-Type']).toBe('image/jpeg');
  expect(h.getNotice().dataset.state).toBe('success');
 });
 it('displays understandable errors for a non-16:9 image instead of silently returning',async()=>{
  const h=harness({width:1200,height:900});
  await h.win.aleaSkillArt.upload({target:h.input},'fiska','illustration_wide');
  expect(h.getNotice().dataset.state).toBe('error');
  expect(h.getNotice().textContent).toContain('16:9');
  expect(h.storage).not.toHaveBeenCalled();
 });
 it('never silently exits if user is no longer an administrator',async()=>{
  const h=harness({admin:false});
  await h.win.aleaSkillArt.upload({target:h.input},'fiska','illustration_wide');
  expect(h.getNotice().dataset.state).toBe('error');
  expect(h.getNotice().textContent).toContain('administratör');
 });
 it('shows uploaded file feedback atop the editor with cache-busted assets',()=>{
  expect(css).toContain('.skill-art-upload-notice');
  expect(css).toContain('position:fixed;z-index:11000');
  expect(js).toContain("if(input)input.value='';");
  expect(html).toContain('admin-art.js?v=0.35.261');
  expect(html).toContain('admin-art.css?v=0.35.261');
 });
});
