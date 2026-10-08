import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const library=read('features/material/library.js');
const legolas=read('features/material/viewer.js');

describe('v0.34.95 – GitHub Pages native material bootstrap',()=>{
 it('loads material independently of the dice-box module entry',()=>{
  expect(html).toMatch(/<script type="module" src="\.\/features\/material\/library\.js\?v=0\.34\.95"><\/script>/);
  expect(html).toMatch(/<script type="module" src="\.\/src\/main\.js\?v=0\.34\.95"><\/script>/);
  expect(read('src/main.js')).not.toMatch(/^import [^;\n]*material\/library\.js/gm);
  expect(html.indexOf('features/material/library.js?v=0.34.95'))
   .toBeLessThan(html.indexOf('src/main.js?v=0.34.95'));
 });
 it('uses native HTML stylesheets, never bare CSS imports in JS modules',()=>{
  for(const name of ['viewer','frodo-ui','player-folder','realtime']){
   const css=name+'.css';
   expect(html).toContain('href="./features/material/'+css+'?v=0.34.95"');
  }
  for(const name of ['viewer.js','frodo-ui.js','player-folder-ui.js','galadriel-ui.js']){
   expect(read('features/material/'+name)).not.toMatch(/^\s*import\s+['"][^'"]+\.css['"]\s*;?/gm);
  }
 });
 it('boots the top navigation icon in native mobile and desktop DOM',()=>{
  expect(legolas).toContain("nav.id='materialNavBtn'");
  expect(legolas).toContain("insertAdjacentElement('beforebegin',nav)");
  expect(legolas).toContain("legolasPanel");
  expect(html).toContain('id="mapNavBtn"');
  expect(read('features/material/viewer.css')).toContain('#materialNavBtn .material-nav-label{display:none}');
 });
 it('initializes both Bilbo and Gimli administration areas and retries on admin open',()=>{
  const legacy=read('legacy/app.js');
  expect(library).toContain('window.gimliMountAdmin?.();');
  expect(library).toContain('bilboMountLibrary();');
  expect(legacy).toContain('window.gimliMountAdmin?.();window.bilboMountLibrary?.();');
  expect(library).toContain("section.dataset.adminSection='library'");
  expect(read('features/material/storage.js')).toContain("section.dataset.adminSection='materials'");
 });
 it('actually mounts the library and the top panel under a normal parsed HTML document',()=>{
  const calls=[];
  const anchor={insertAdjacentElement:(where,element)=>calls.push('nav:'+where+':'+element.innerHTML)};
  const detail={insertAdjacentElement:(where,element)=>calls.push('detail:'+where+':'+element.dataset.adminSection)};
  const document={
   readyState:'complete',
   querySelector:q=>
    q==='.admin-nav-card[onclick*="places"]'?anchor:
    q==='#admin .admin-detail'?detail:null,
   createElement:tag=>({tagName:tag,className:'',dataset:{},insertAdjacentElement(){},append(){}}),
   querySelectorAll:()=>[],
   getElementById:()=>null
  };
  const window={gimliMaterialApi:{canManage:()=>true,categories:{}},
   gimliMountAdmin:()=>calls.push('gimli:mounted')};
  const source=library.replace(/^import .*?;\s*$/gm,'');
  runInNewContext(source,{
   window,document,
   createLegolas:()=>({mount:()=>calls.push('legolas:mounted'),state:{},openPanel(){},
    closePanel(){},reset(){},previewMaterial(){},getStagedIds:()=>[]}),
   mountFrodo:()=>({mount:()=>calls.push('frodo:mounted'),showRow:async()=>null}),
   mountSam:()=>({mount:()=>calls.push('sam:mounted'),share:async()=>null}),
   mountGaladriel:()=>({mount:()=>calls.push('galadriel:mounted'),connected:()=>false}),
   createAragorn:()=>({clear(){},sync(){},setType(){},searchTargets(){},
    link(){},unlink(){},html:()=>'',loadDetails:async()=>{}}),
   SUPABASE_URL:'https://example.supabase.co',
   SUPABASE_KEY:'anon-public-test',
   centralCampaignId:'123e4567-e89b-42d3-a456-426614174000',
   activeUser:()=>({admin:true}),
   centralCampaignRole:'gm',
   dbJson:async()=>[],
   Blob,console,
   escAttr:x=>x
  });
  expect(calls).toContain('legolas:mounted');
  expect(calls).toContain('frodo:mounted');
  expect(calls).toContain('sam:mounted');
  expect(calls).toContain('galadriel:mounted');
  expect(calls).toContain('gimli:mounted');
  expect(calls.some(x=>x.startsWith('nav:beforebegin:')&&x.includes('Bildbibliotek'))).toBe(true);
  expect(calls).toContain('detail:beforebegin:library');
  expect(typeof window.bilboMountLibrary).toBe('function');
 });
});
