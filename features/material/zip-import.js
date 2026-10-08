/* Alea Crusaders — private, memory-bounded, stored-ZIP transfer reader.
 * Purpose-built for exported images. No external ZIP/CDN dependencies.
 * Reads only central directory & each Blob slice; never inflates the whole ZIP.
 */
export async function readAleaImageZip(file){
 if(!file||file.size<22||file.size>600*1024*1024)
  throw Error('Välj en ZIP-fil på högst 600 MB.');
 const tailLength=Math.min(65557,file.size);
 const tail=new DataView(await file.slice(file.size-tailLength).arrayBuffer());
 let eocd=-1;
 for(let i=tail.byteLength-22;i>=0;i--){
  if(tail.getUint32(i,true)===0x06054b50&&
    i+22+tail.getUint16(i+20,true)===tail.byteLength){eocd=i;break}
 }
 if(eocd<0)throw Error('ZIP-filen är ofullständig.');
 const count=tail.getUint16(eocd+10,true),size=tail.getUint32(eocd+12,true),
  offset=tail.getUint32(eocd+16,true);
 if(!count||count>120||size>1024*1024||offset+size>file.size)
  throw Error('ZIP-paketets filindex är ogiltigt.');
 const central=new DataView(await file.slice(offset,offset+size).arrayBuffer());
 const decode=new TextDecoder('utf-8',{fatal:true});
 let pos=0,total=0,manifest=null;
 const entries=[];
 for(let i=0;i<count;i++){
  if(pos+46>central.byteLength||central.getUint32(pos,true)!==0x02014b50)
   throw Error('ZIP-indexet är skadat.');
  const flags=central.getUint16(pos+8,true),method=central.getUint16(pos+10,true),
   compressed=central.getUint32(pos+20,true),plain=central.getUint32(pos+24,true),
   nameLen=central.getUint16(pos+28,true),extra=central.getUint16(pos+30,true),
   comment=central.getUint16(pos+32,true),local=central.getUint32(pos+42,true);
  if(nameLen>230||pos+46+nameLen+extra+comment>central.byteLength)
   throw Error('ZIP-filnamnet är skadat.');
  const name=decode.decode(new Uint8Array(central.buffer,central.byteOffset+pos+46,nameLen));
  pos+=46+nameLen+extra+comment;
  if(!name||name.includes('/')||name.includes('\\')||name.includes('..')||
    /[\u0000-\u001f]/.test(name))throw Error('Ogiltigt ZIP-filnamn.');
  if(method!==0||(flags&1)!==0||compressed!==plain||plain>20*1024*1024)
   throw Error('Importen kräver okomprimerade filer under 20 MB: '+name);
  const header=new DataView(await file.slice(local,local+30).arrayBuffer());
  if(header.byteLength!==30||header.getUint32(0,true)!==0x04034b50)
   throw Error('Saknat lokalt filhuvud: '+name);
  const start=local+30+header.getUint16(26,true)+header.getUint16(28,true);
  if(start+plain>file.size)throw Error('Avklippt bild: '+name);
  const mime=/\.png$/i.test(name)?'image/png':/\.jpe?g$/i.test(name)?'image/jpeg':
   /\.webp$/i.test(name)?'image/webp':null;
  const blob=file.slice(start,start+plain,mime||'application/json');
  if(name==='manifest.json'){
   if(plain>1024*1024)throw Error('För stort importmanifest.');
   try{manifest=JSON.parse(await blob.text())}catch(_){throw Error('Ogiltigt importmanifest.')}
  }else if(mime){
   total+=plain;
   if(total>500*1024*1024)throw Error('För mycket bilddata i importpaketet.');
   entries.push({name,file:new File([blob],name,{type:mime})});
  }else throw Error('Okänd filtyp i ZIP: '+name);
 }
 if(!manifest||manifest.schema_version!==1||!Array.isArray(manifest.images)||
    manifest.images.length!==entries.length)
  throw Error('ZIP-paketet saknar korrekt Alea-importmanifest.');
 const metadata=new Map();
 for(const item of manifest.images){
  if(!item||typeof item.filename!=='string'||metadata.has(item.filename)||
    typeof item.title!=='string'||!item.title.trim()||item.title.length>160||
    item.category!=='location'||String(item.description||'').length>2000)
   throw Error('Ogiltigt importmanifest för en bild.');
  metadata.set(item.filename,item);
 }
 for(const entry of entries){
  const info=metadata.get(entry.name);
  if(!info||info.size_bytes!==entry.file.size)
   throw Error('Importmanifestet matchar inte '+entry.name);
  entry.title=info.title;
  entry.description=String(info.description||'');
 }
 return {campaignId:manifest.campaign_id,entries};
}
if(typeof window!=='undefined')window.aleaReadImageZip=readAleaImageZip;
