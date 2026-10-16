/* HERMES 3.0 · fail-closed intake policy. No Google credentials or publication. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const ident=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha=/^[0-9a-f]{64}$/;
const driveId=/^[A-Za-z0-9_-]{10,160}$/;
const sameKeys=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)
 &&Object.keys(obj).length===keys.length &&keys.every(k=>own(obj,k));
const fail=(reason)=>{throw new Error('HERMES3_POLICY_'+reason)};
export function validateHermes3Job(job, registry){
 if(!registry||registry.schema!==3||!sameKeys(job,['schema','job_id','profile','source','target','intent']))
  fail('SCHEMA');
 if(job.schema!==3||job.intent!=='verify-only'||!ident.test(job.job_id||'')||job.job_id.length>90)
  fail('INTENT_OR_ID');
 const profile=registry.profiles?.[job.profile];
 if(!profile||profile.stage!=='verify')fail('PROFILE_NOT_ENABLED');
 const src=job.source;
 if(!sameKeys(src,['provider','file_id','sha256','mime_type','visibility','public_release_approved']))
  fail('SOURCE_FIELDS');
 if(src.provider!=='google-drive'||!driveId.test(src.file_id||'')||!sha.test(src.sha256||'')
  ||!profile.mimes.includes(src.mime_type)||src.visibility!=='public'
  ||src.public_release_approved!==true)fail('UNTRUSTED_SOURCE');
 const target=job.target;
 if(!sameKeys(target,['category','key'])||target.category!==profile.media||
  !ident.test(target.key||'')||target.key.length>100)fail('TARGET');
 return {job_id:job.job_id,profile:job.profile,sha256:src.sha256,
  media:profile.media,bytes_limit:profile.max_bytes,visibility:src.visibility};
}
function fileInRequests(root,arg){
 if(typeof arg!=='string'|| !/^hermes3\/requests\/[a-z0-9-]+\.json$/.test(arg))
  fail('REQUEST_PATH');
 const base=fs.realpathSync(path.join(root,'hermes3/requests'));
 const full=fs.realpathSync(path.join(root,arg));
 if(path.dirname(full)!==base)fail('OUTSIDE_REQUESTS');
 return full;
}
export function validateHermes3Files(root,args){
 const registry=JSON.parse(fs.readFileSync(path.join(root,'config/hermes3-profiles.json'),'utf8'));
 const files=args.length===1&&args[0]==='--all'
 ?fs.readdirSync(path.join(root,'hermes3/requests')).filter(f=>f.endsWith('.json')).map(f=>'hermes3/requests/'+f)
 :args;
 if(!files.length&&args.length===1&&args[0]==='--all')return [];
 if(!files.length)fail('MISSING_FILES');
 return files.map(name=>{
  const full=fileInRequests(root,name);
  const result=validateHermes3Job(JSON.parse(fs.readFileSync(full,'utf8')),registry);
  return {name,...result};
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  const rows=validateHermes3Files(process.cwd(),process.argv.slice(2));
  if(!rows.length)console.log('HERMES3_NO_ACTIVE_REQUESTS');
  rows.forEach(row=>console.log('HERMES3_POLICY_OK',row.name,row.profile,row.sha256));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
