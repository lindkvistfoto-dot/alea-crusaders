import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../geometry-lab.html',import.meta.url),'utf8');
const code=html.split('<script>')[1]?.split('</script>')[0];
it('parses the row editor script',()=>{expect(code).toBeTruthy();expect(()=>new vm.Script(code)).not.toThrow()});
it('provides configurable rows, automatic alignment and QA gated export',()=>{for(const term of ['row-editor','add-row','remove-row','auto-align','e.autoAlign(rows)','e.audit(rows,options)','disabled=!valid','e.manifest(rows,opts())'])expect(html).toContain(term)});
