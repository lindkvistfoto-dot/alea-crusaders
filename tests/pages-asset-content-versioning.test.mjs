import {test,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Pages asset versioning uses content hashes separately for DEV and LIVE',()=>{
 const dir=mkdtempSync(join(tmpdir(),'alea-pages-version-'));
 try{
  for(const [prefix,css] of [['','red'],['dev','blue']]){
   const root=join(dir,prefix);
   mkdirSync(join(root,'features'),{recursive:true});
   writeFileSync(join(root,'features','map.css'),css);
   writeFileSync(join(root,'app.js'),'console.log(1)');
   writeFileSync(join(root,'index.html'),'<link rel="stylesheet" href="./features/map.css?v=old"><script src="./app.js?v=old&env=dev"></script><a href="https://example.org/a.js?v=old">external</a>');
  }
  const run=spawnSync('python3',['scripts/version-pages-assets.py',dir],{encoding:'utf8'});
  expect(run.status,run.stderr).toBe(0);
  const live=readFileSync(join(dir,'index.html'),'utf8');
  const dev=readFileSync(join(dir,'dev','index.html'),'utf8');
  expect(live).toMatch(/features\/map\.css\?v=[a-f0-9]{16}/);
  expect(dev).toMatch(/features\/map\.css\?v=[a-f0-9]{16}/);
  expect(live.match(/map\.css\?v=([a-f0-9]+)/)?.[1]).not.toBe(dev.match(/map\.css\?v=([a-f0-9]+)/)?.[1]);
  expect(live).toContain('env=dev');
  expect(live).toContain('https://example.org/a.js?v=old');
  expect(live).not.toContain('map.css?v=old');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
