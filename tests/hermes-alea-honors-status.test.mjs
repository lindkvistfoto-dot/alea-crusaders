import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const source=readFileSync(new URL('../features/honors/honors-entry.js',import.meta.url),'utf8');
it('passes upload progress callback through the Honors adapter',()=>{
 expect(source).toContain('const applyImageResult=async(kind,target,file,onStatus)=>');
 expect(source).toContain('onUploadImage:(kind,target,file,onStatus)=>applyImageResult(kind,target,file,onStatus)');
 expect(source).toContain('if(labels[stage]) onStatus?.(stage)');
});
