/* Gimli: private campaign material storage. Classic Alea script. */
const GIMLI_BUCKET='campaign-materials', GIMLI_MAX_BYTES=20*1024*1024;
const GIMLI_FORMATS={'image/png':['png','image'],'image/jpeg':['jpg','image'],'image/webp':['webp','image'],'application/pdf':['pdf','document'],'text/plain':['txt','text']};
const GIMLI_CATEGORIES={location:'Platser',npc:'SLP',monster:'Monster',item:'Föremål',map:'Kartor',document:'Dokument',other:'Övrigt'};
let gimliRows=[],gimliPreviewUrl='',gimliUploading=false;
function gimliMime(file){
 const name=String(file?.name||'').toLowerCase();
 const exts={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.txt':'text/plain'};
 const ext=Object.keys(exts).find(x=>name.endsWith(x)),mime=exts[ext];
 if(!mime||file.type&&file.type!==mime)throw Error('Tillåtna filer är PNG, JPG, WebP, PDF och TXT.');
 return mime
}
function gimliSignature(mime,bytes){
 const a=[...bytes],str=(pos,n)=>String.fromCharCode(...a.slice(pos,pos+n));
 if(mime==='image/png')return a.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
 if(mime==='image/jpeg')return a[0]===255&&a[1]===216&&a[2]===255;
 if(mime==='image/webp')return str(0,4)==='RIFF'&&str(8,4)==='WEBP';
 if(mime==='application/pdf')return str(0,5)==='%PDF-';
 if(mime==='text/plain')return !a.some(x=>x===0||x<9||x>13&&x<32||x===127);
 return false
}
async function gimliValidate(file){
 if(!file||!Number.isSafeInteger(file.size)||file.size<1||file.size>GIMLI_MAX_BYTES)throw Error('Filen måste vara mellan 1 byte och 20 MB.');
 const mime=gimliMime(file),head=new Uint8Array(await file.slice(0,mime==='text/plain'?Math.min(file.size,4096):16).arrayBuffer());
 if(!gimliSignature(mime,head))throw Error('Filens innehåll stämmer inte med filtypen.');
 return {mime,ext:GIMLI_FORMATS[mime][0],kind:GIMLI_FORMATS[mime][1]}
}
function gimliPath(campaign,id,filename){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 if(!uuid.test(campaign)||!uuid.test(id)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(filename)||filename.includes('..'))throw Error('Ogiltig lagringsadress.');
 return campaign+'/'+id+'/'+filename
}
function gimliFilename(name,ext){
 const n=String(name||'material').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]/g,'-').replace(/\.[^.]+$/,'').replace(/\.+/g,'-').slice(0,75);
 return (n||'material')+'.'+ext
}
function gimliCanUpload(){return !!activeUser()?.admin||centralCampaignRole==='gm'}
async function gimliStorage(path,options={}){
 const res=await mapStorageFetch('object/'+GIMLI_BUCKET+'/'+encodeStoragePath(path),options);
 if(!res.ok){const json=await res.json().catch(()=>null);throw Error(json?.message||json?.error||'Storage HTTP '+res.status)}
 return res
}
async function gimliThumbnail(file,mime){
 if(!mime.startsWith('image/')||typeof createImageBitmap!=='function')return null;
 let img;
 try{
  img=await createImageBitmap(file);
  if(!img.width||!img.height||img.width*img.height>60000000)return null;
  const c=document.createElement('canvas'),scale=Math.min(1,420/Math.max(img.width,img.height));
  c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  c.getContext('2d')?.drawImage(img,0,0,c.width,c.height);
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',0.78));
  return blob?.type==='image/webp'&&blob.size>0?blob:null
 }catch(e){console.warn('Miniatyr saknas',e);return null}
 finally{img?.close?.()}
}
