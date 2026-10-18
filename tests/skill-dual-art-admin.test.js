import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const moduleSource=readFileSync(new URL('../features/skills/admin-art.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/skills/admin-art.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261017160000_skill_dual_art_admin.sql',import.meta.url),'utf8');

function helper(){const window={};runInNewContext(moduleSource,{window});return window.aleaSkillArt}
const skillId='klattra';
const guid='a3729cc1-a80d-48d3-b162-d8a196d78054';
const icon='skill/'+skillId+'/icon/'+guid+'.png';
const illustration='skill/'+skillId+'/illustration/'+guid+'.webp';
const wide='skill/'+skillId+'/illustration_wide/'+guid+'.jpg';

describe('FÄRDIGHET IKON, ILLUSTRATION and ILLUSTRATION WIDE admin',()=>{
 it('renders independent preview/upload/remove controls for a saved skill',()=>{
  const view=helper().editorHtml({id:skillId,name:'Klättra',icon_path:icon,illustration_path:illustration,illustration_wide_path:wide});
  expect(view).toContain('FÄRDIGHET IKON');
  expect(view).toContain('FÄRDIGHET ILLUSTRATION');
  expect(view).toContain('FÄRDIGHET ILLUSTRATION WIDE');
  expect(view).toContain('data-kind="icon"');
  expect(view).toContain('data-kind="illustration"');
  expect(view).toContain('data-kind="illustration_wide"');
  expect(view).toContain("aleaSkillArt.upload(event,'klattra','icon')");
  expect(view).toContain("aleaSkillArt.upload(event,'klattra','illustration')");
  expect(view).toContain("aleaSkillArt.upload(event,'klattra','illustration_wide')");
  expect(view).toContain("aleaSkillArt.remove('klattra','illustration_wide')");
  expect(view.match(/Byt bild/g)).toHaveLength(3);
 });
 it('requires saving a newly created skill before artwork can be uploaded',()=>{
  const view=helper().editorHtml(null);
  expect(view).toContain('Spara färdigheten först');
  expect(view).not.toContain('type="file"');
 });
 it('accepts only scoped immutable object paths and no jpeg icon',()=>{
  const art=helper();
  expect(art.validPath(icon,skillId,'icon')).toBe(true);
  expect(art.validPath(illustration,skillId,'illustration')).toBe(true);
  expect(art.validPath(wide,skillId,'illustration_wide')).toBe(true);
  expect(art.validPath(wide,skillId,'illustration')).toBe(false);
  expect(art.validPath('skill/'+skillId+'/icon/'+guid+'.jpg',skillId,'icon')).toBe(false);
  expect(art.validPath(icon,skillId,'illustration')).toBe(false);
  expect(art.validPath(icon,'smyga','icon')).toBe(false);
  expect(art.validPath('../'+icon,skillId,'icon')).toBe(false);
 });
 it('loads the art controller in index and embeds panes in the existing skills editor',()=>{
  expect(html).toContain('features/skills/admin-art.js');
  expect(html).toContain('features/skills/admin-art.css');
  expect(main).toContain('window.aleaSkillArt?.editorHtml(r)');
  expect(main).toContain("window.aleaSkillArt?.hydrate(r?.id||'')");
  expect(main).toContain('window.aleaSkillArt?.closeEditor()');
  expect(main).toContain('● Illustration');
  expect(main).toContain('● WIDE');
  expect(css).toContain('.skill-art-preview-illustration_wide');
  expect(css).toContain('skill-art-preview-icon');
 });
 it('retains original alpha and resolution, with isolated columns for each type',()=>{
  expect(moduleSource).toContain('file.size>MAX_BYTES');
  expect(moduleSource).toContain('w!==h');
  expect(moduleSource).toContain('ctx.getImageData(x,y,1,1).data[3]>24');
  expect(moduleSource).toContain('body:file');
  expect(moduleSource).not.toContain('canvas.toBlob');
  expect(moduleSource).toContain("icon_path");
  expect(moduleSource).toContain("illustration_path");
  expect(moduleSource).toContain("illustration_wide_path");
  expect(moduleSource).toContain('ratioError>0.003');
 });
 it('keeps the new bucket private, scoped and uploads admin-only',()=>{
  expect(migration).toContain("'alea-skill-art',false");
  expect(migration).toContain('add column if not exists icon_path text');
  expect(migration).toContain('add column if not exists illustration_path text');
  expect(migration).toContain('private.is_admin()');
  expect(migration).toContain("split_part(icon_path,'/',2) = id");
  expect(migration).toContain("split_part(illustration_path,'/',2) = id");
  expect(migration).not.toContain('for delete to authenticated');
 });
});
