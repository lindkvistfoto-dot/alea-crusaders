/* HERMES UI publisher: immutable verified originals -> two small, public app assets.
 * A static UI asset needs no Supabase row. Never update rule_spells or rule_magic_symbols.
 * GitHub GITHUB_TOKEN commits do not trigger Pages, so request Pages build explicitly.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
const key=process.env.HERMES_UI_KEY;
const codexKeys=new Set(['arcane-skill-codex-outer-frame','arcane-skill-codex-header','arcane-skill-codex-leather','arcane-skill-codex-dark-panel','arcane-skill-codex-parchment-fishing','arcane-skill-codex-parchment-neutral','arcane-skill-codex-stat-plate','arcane-skill-codex-medallion','arcane-skill-codex-close-button','arcane-skill-codex-divider','arcane-skill-codex-illustration-frame','arcane-skill-codex-ornament']);
if(repo!=='lindkvistfoto-dot/alea-crusaders'||!token||
 !['arcane-mechanism-link','arcane-mechanism-chamber','arcane-gallery-overlay',
  'arcane-gallery-goose-left','arcane-gallery-goose-right','arcane-gallery-goose-seal'].includes(key) && !codexKeys.has(key))throw Error('Invalid HERMES UI context');
const goose=key.startsWith('arcane-gallery-goose-');
const dir=codexKeys.has(key)?'features/skills/codex-assets/':goose?'features/material/goose04/':key==='arcane-gallery-overlay'?'features/material/':'features/combat/';
const stem=codexKeys.has(key)?key.slice('arcane-skill-codex-'.length):goose?key.slice('arcane-gallery-goose-'.length):key;
const paths=[dir+stem+'.webp',dir+stem+'.json'];
const files=new Map(paths.map(path=>[path,readFileSync(path)]));
const metadata=JSON.parse(files.get(paths[1]).toString('utf8'));
if(metadata.kind!=='ui'||metadata.target_key!==key||metadata.app_path!==paths[0])throw Error('Invalid UI manifest');
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
if(metadata.app_sha256!==sha256(files.get(paths[0])))throw Error('UI WebP checksum differs from manifest');
const blobSha=data=>createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
const api=async(method,path,payload)=>{
 const res=await fetch('https://api.github.com/repos/'+repo+path,{
  method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
  ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 if(!res.ok)throw Error('HTTP '+res.status+' '+method+' '+path+' '+(await res.text()).slice(0,250));
 return res.status===204?{}:res.json();
};
let written=false;
for(let attempt=0;attempt<5;attempt++){
 const head=(await api('GET','/git/ref/heads/main')).object.sha;
 const parent=await api('GET','/git/commits/'+head);
 const current=await api('GET','/git/trees/'+parent.tree.sha+'?recursive=1');
 if(current.truncated)throw Error('Tree truncated');
 const old=new Map(current.tree.map(row=>[row.path,row.sha]));
 const changed=paths.filter(path=>old.get(path)!==blobSha(files.get(path)));
 if(!changed.length){console.log('HERMES_UI_ALREADY_PUBLISHED',key);break}
 const entries=[];
 for(const path of changed){
  const data=files.get(path);
  const response=await api('POST','/git/blobs',{content:data.toString('base64'),encoding:'base64'});
  if(response.sha!==blobSha(data))throw Error('HERMES_UI_BLOB_SHA_MISMATCH '+path);
  entries.push({path,mode:'100644',type:'blob',sha:response.sha});
 }
 const tree=await api('POST','/git/trees',{base_tree:parent.tree.sha,tree:entries});
 const commit=await api('POST','/git/commits',{
  message:'HERMES UI: publish optimized '+key+' WebP and manifest',tree:tree.sha,parents:[head]});
 try{
  await api('PATCH','/git/refs/heads/main',{sha:commit.sha,force:false});
  const check=await api('GET','/git/trees/'+tree.sha+'?recursive=1');
  for(const path of changed){
   if(check.tree.find(row=>row.path===path)?.sha!==blobSha(files.get(path)))throw Error('HERMES_UI_READBACK_FAIL '+path);
  }
  console.log('HERMES_UI_COMMITTED',key,commit.sha,paths.join(','));
  written=true;break;
 }catch(error){
  if(attempt===4||!/HTTP (409|422)/.test(error.message))throw error;
 }
}
if(written){
 const page=await api('POST','/pages/builds');
 console.log('HERMES_UI_PAGES_BUILD_REQUESTED',JSON.stringify(page).slice(0,120));
}
console.log('HERMES_UI_PUBLISHED',key, metadata.app_sha256);
