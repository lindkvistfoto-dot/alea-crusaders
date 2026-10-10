import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const artSource=read('features/equipment/art.js');
const app=read('legacy/app.js');
const css=read('features/equipment/art.css');
const migration=read('supabase/migrations/20261010212500_projectile_type_art.sql');
const key='arrow';
const uuid='f53b9568-81ec-4623-ac6d-dd452177a769';
const imagePath='projectile/'+key+'/'+uuid+'.webp';

function setup(fetch=async()=>({ok:true,status:200})){
 let imageCounter=0;
 const window={};
 const ImageStub=class{
  constructor(){this.naturalWidth=500;this.naturalHeight=250}
  set src(url){Promise.resolve().then(()=>this.onload())}
 };
 const scope={
  window,fetch,crypto:{randomUUID:()=>uuid},
  URL:{createObjectURL:()=>('blob:projectile-'+(++imageCounter)),revokeObjectURL(){}},
  Image:ImageStub,
  document:{
   getElementById:()=>null,
   createElement:()=>({
    getContext:()=>({clearRect(){},drawImage(){}}),
    toBlob:(cb,mime)=>cb({type:mime,size:5000})
   })
  },
  alert:message=>{throw Error(message)}
 };
 runInNewContext(artSource,scope);
 const art=window.aleaEquipmentArt;
 art.configure('https://example.supabase.co');
 return art;
}

describe('Projektilbilder i Admin',()=>{
 it('adds an optional image field scoped to the projectile type key',()=>{
  expect(migration).toContain('alter table public.rule_projectile_types');
  expect(migration).toContain('add column if not exists image_path text');
  expect(migration).toContain('split_part(image_path,\'/\',2)=projectile_key');
  expect(migration).toContain('private.is_admin()');
  expect(migration).toContain('alea-equipment-art');
  expect(migration).toContain('projectile/[a-z][a-z0-9_]{1,50}');
 });
 it('shows existing projectile artwork, or allows removal without changing other types',async()=>{
  const art=setup();
  expect(art.src(imagePath)).toContain('/alea-equipment-art/'+imagePath);
  expect(art.src('projectile/../../private.webp')).toBe('');
  expect(art.src('projectile/arrow/not-a-uuid.webp')).toBe('');
  expect(art.start('projectile',{image_path:imagePath})).toContain('itemArtPreview');
  expect(art.thumbnail(imagePath,'—','Pilar')).toContain('Pilar');
  const unchanged=await art.prepare('projectile',key,{});
  expect(unchanged.path).toBe(imagePath);
  art.remove();
  const removed=await art.prepare('projectile',key,{});
  expect(removed.path).toBeNull();
  expect(removed.old).toBe(imagePath);
 });
 it('uploads only one selected image, with path tied to the projectile key',async()=>{
  const uploads=[];
  const art=setup(async(url,options)=>{
   uploads.push({url,options});
   return {ok:true,status:200};
  });
  art.start('projectile',{});
  await art.choose({type:'image/png',size:15000});
  const ctx={token:'some-token',key:'publishable-test'};
  const uploaded=await art.prepare('projectile',key,ctx);
  expect(uploaded.path).toBe(imagePath);
  expect(uploaded.uploaded).toBe(imagePath);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].url).toContain('/storage/v1/object/alea-equipment-art/projectile/arrow/');
  expect(uploads[0].options.headers.Authorization).toBe('Bearer some-token');
  expect(uploads[0].options.headers['Content-Type']).toBe('image/webp');
  await expect(art.prepare('projectile','../invalid',ctx)).rejects.toThrow('Ogiltigt föremåls-ID');
 });
 it('retains the projectile edit draft when upload fails so a retry can succeed',async()=>{
  let attempts=0;
  const art=setup(async()=>{
   attempts++;
   return attempts===1?
    {ok:false,status:403,json:async()=>({message:'Insufficient permissions'})}:
    {ok:true,status:200};
  });
  art.start('projectile',{});
  await art.choose({type:'image/png',size:15000});
  const ctx={token:'test',key:'test'};
  await expect(art.prepare('projectile',key,ctx)).rejects.toThrow('Insufficient permissions');
  expect((await art.prepare('projectile',key,ctx)).uploaded).toBe(imagePath);
  expect(attempts).toBe(2);
 });
 it('wires uploader, thumbnails, safe saved paths and inventory previews to master types',()=>{
  expect(app).toContain("aleaEquipmentArt?.start('projectile',p)");
  expect(app).toContain("aleaEquipmentArt.prepare('projectile',key,artContext)");
  expect(app).toContain('image_path:artChange.path');
  expect(app).toContain('aleaEquipmentArt?.thumbnail(p.image_path');
  expect(app).toContain('function projectileImageHtml(key,name)');
  expect(app).toContain('projectileImageHtml(characterProjectileKey(x),x.name)');
  expect(app).toContain('loadRuleProjectileTypes(true);renderAdminProjectiles()');
  expect(app).toContain('if(artChange?.uploaded)await window.aleaEquipmentArt.removeStored');
  expect(css).toContain('.projectile-inventory-art');
  expect(css).toContain('.projectile-art-name');
  expect(css).toContain('@media(max-width:620px)');
 });
});
