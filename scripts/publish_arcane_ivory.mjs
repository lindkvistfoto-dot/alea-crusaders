/* Publish only generated ARCANE IVORY app WebPs and manifest through GitHub Git Data REST.
 * No git push, no overwrite of original PNGs. GitHub Actions token needs contents:write.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
if(!repo||!/^[-\w.]+\/[-\w.]+$/.test(repo)||!token)throw Error('Missing GITHUB_REPOSITORY or GITHUB_TOKEN');
const assets='assets/spells/arcane-ivory';
const sourceDir=join(process.cwd(),assets);
const sourceFiles=readdirSync(sourceDir).filter(name=>/^[a-z0-9-]+\.webp$/.test(name)).sort();
const paths=[...sourceFiles.map(name=>assets+'/'+name),assets+'/manifest.json'];
const contents=new Map(paths.map(path=>[path,readFileSync(join(process.cwd(),path))]));
const api=async(method,path,body)=>{
  const response=await fetch('https://api.github.com/repos/'+repo+path,{
    method,headers:{'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
      'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!response.ok)throw Error(method+' '+path+' returned '+response.status+': '+(await response.text()).slice(0,600));
  return response.json();
};
const gitBlobSha=data=>createHash('sha1')
  .update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');

let published=false;
for(let attempt=0;attempt<3;attempt++){
  const head=await api('GET','/git/ref/heads/main');
  const parent=head.object.sha;
  const commit=await api('GET','/git/commits/'+parent);
  const originalTree=await api('GET','/git/trees/'+commit.tree.sha+'?recursive=1');
  if(originalTree.truncated)throw Error('Repository tree was truncated');
  const remote=new Map(originalTree.tree.map(item=>[item.path,item.sha]));
  const stale=paths.filter(path=>remote.get(path)!==gitBlobSha(contents.get(path)));
  if(!stale.length){
    console.log('Optimized ARCANE IVORY assets already up-to-date');
    break;
  }
  console.log('Publishing optimized files: '+stale.join(', '));
  const treeElements=[];
  for(const path of stale){
    const blob=await api('POST','/git/blobs',{
      content:contents.get(path).toString('base64'),encoding:'base64'
    });
    if(blob.sha!==gitBlobSha(contents.get(path)))throw Error('SHA mismatch for '+path);
    treeElements.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree=await api('POST','/git/trees',{base_tree:commit.tree.sha,tree:treeElements});
  const revision=await api('POST','/git/commits',{
    message:'chore(arcane-ivory): regenerate optimized 640px WebP spell icons',
    tree:tree.sha,parents:[parent]
  });
  try{
    await api('PATCH','/git/refs/heads/main',{sha:revision.sha,force:false});
    console.log('Optimized app assets committed: '+revision.sha);
    published=true;
    break;
  }catch(error){
    if(attempt===2)throw error;
    console.warn('main advanced during publish, rebuilding on latest head');
  }
}
if(published){
  // Workflow-token commits do not trigger Pages builds by themselves.
  // Request a Pages build explicitly so the new WebPs reach the live site.
  try{
    const build=await api('POST','/pages/builds');
    console.log('Pages build requested: '+(build.status||'queued'));
  }catch(error){
    console.warn('PAGE_BUILD_REQUIRED: '+error.message);
    process.exitCode=2;
  }
}
