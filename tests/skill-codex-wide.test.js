import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const admin=read('features/skills/admin-art.js');
const adminCss=read('features/skills/admin-art.css');
const player=read('features/skills/skill-codex.js');
const css=read('features/skills/skill-codex-wide.css');
const index=read('index.html');
const migration=read('supabase/migrations/20261018025000_skill_illustration_wide.sql');
const frame=read('features/skills/codex-assets/wide-frame.svg');
const paper=read('features/skills/codex-assets/parchment-paper.svg');
function controller(){const window={};runInNewContext(admin,{window});return window.aleaSkillArt}

describe('ARCANE SKILL CODEX WIDE',()=>{
 const id='fiska',guid='a3729cc1-a80d-48d3-b162-d8a196d78054';
 const image='skill/'+id+'/illustration_wide/'+guid+'.webp';
 it('renders the third, independent admin slot with change and remove buttons',()=>{
  const panel=controller().editorHtml({id,name:'Fiska',icon_path:null,illustration_path:'',illustration_wide_path:image});
  expect(panel.match(/class="skill-art-slot"/g)).toHaveLength(3);
  expect(panel).toContain('FÄRDIGHET ILLUSTRATION WIDE');
  expect(panel).toContain('data-kind="illustration_wide"');
  expect(panel).toContain("aleaSkillArt.upload(event,'fiska','illustration_wide')");
  expect(panel).toContain("aleaSkillArt.remove('fiska','illustration_wide')");
  expect(panel).toContain('Byt bild');
  expect(adminCss).toContain('.skill-art-preview-illustration_wide{aspect-ratio:16/9');
 });
 it('isolates each immutable art kind to its own record and storage path',()=>{
  const ctrl=controller();
  expect(ctrl.validPath(image,id,'illustration_wide')).toBe(true);
  expect(ctrl.validPath(image,id,'illustration')).toBe(false);
  expect(ctrl.validPath(image,id,'icon')).toBe(false);
  expect(ctrl.validPath(image,'smyga','illustration_wide')).toBe(false);
  expect(ctrl.validPath('../'+image,id,'illustration_wide')).toBe(false);
  expect(ctrl.validPath('skill/'+id+'/illustration_wide/'+guid+'.jpg',id,'illustration_wide')).toBe(true);
  expect(admin).toContain("w*9!==h*16");
  expect(admin).toContain("w<640||h<360");
  expect(admin).toContain("illustration_wide_path");
 });
 it('uses precisely the new field on the read-only character sheet',()=>{
  expect(player).toContain("illustration_wide_path");
  expect(player).toContain("validArt(skill,'illustration_wide')");
  expect(player).toContain("loadArt(skill,'illustration_wide'");
  expect(player).not.toContain("validArt(skill,'illustration')");
  expect(index).toContain('skill-codex-wide.css?v=0.35.260');
 });
 it('renders a full 16:9 scene with a transparent original frame and no crop',()=>{
  expect(css).toContain('aspect-ratio:16/9');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('url("./codex-assets/wide-frame.svg")');
  expect(frame).toContain('viewBox="0 0 1600 900"');
  expect(frame).toContain('fill="none"');
  expect(frame).not.toContain('<text');
 });
 it('lets parchment grow with any description and scrolls only the outer modal',()=>{
  expect(css).toContain('height:auto');
  expect(css).toContain('max-height:none');
  expect(css).toContain('overflow:visible');
  expect(css).toContain('white-space:pre-wrap');
  expect(css).toContain('overflow-y:auto');
  expect(css).toContain('max-height:calc(100dvh - 20px)');
  expect(css).toContain('grid-template-columns:1fr 1.43fr .86fr .84fr');
  expect(css).toContain('parchment-paper.svg');
  expect(paper).toContain('stitchTiles="stitch"');
  expect(css).not.toContain('overflow-y:scroll');
 });
 it('keeps wide art private and upload admin-only without any DELETE policy',()=>{
  expect(migration).toContain('add column if not exists illustration_wide_path text');
  expect(migration).toContain("split_part(illustration_wide_path, '/', 2) = id");
  expect(migration).toContain('private.is_admin()');
  expect(migration).toContain('(icon|illustration|illustration_wide)');
  expect(migration).not.toContain('for delete to authenticated');
 });
});
