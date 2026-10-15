import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
describe('Published Alea version labels',()=>{
 it('keeps the visible title and all three app labels aligned with package.json',()=>{
  const html=read('index.html');
  const version=JSON.parse(read('package.json')).version;
  expect(html).toContain('<title>Alea Crusaders v'+version+'</title>');
  expect(html).toContain('id="appVersion">v'+version+'</span>');
  expect(html).toContain('id="mobileHomeVersion" class="mobile-home-version">Version v'+version+'</div>');
  expect(html).toContain('id="adminOverviewVersion" class="admin-overview-version">Version v'+version+'</div>');
 });
});
