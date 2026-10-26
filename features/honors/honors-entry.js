import { createHermesAleaClient } from '../hermes-alea/client.js';
import { renderHonorsAdmin } from './honors-admin.js';
import { createHonorImageResolver, verifiedHonorImageUrl } from './honors-image-resolver.js';
function browserImageClient(){
  return createHermesAleaClient({
    rpc:(name,args)=>window.dbJson('rpc/'+name,{method:'POST',body:JSON.stringify(args)}),
    request:(path,options={})=>window.authFetch(path,{...options,headers:{Authorization:'Bearer session',...(options.headers||{})}})
  });
}
window.aleaHermesAleaImages={
  resolve:verifiedHonorImageUrl,
  loadAssets:async()=>{
    const client=browserImageClient();
    try{await client.capabilities();}catch{return [];}
    return client.loadAssets(window.dbJson);
  }
};
let instance;
let openSequence=0;

const definitionFields='id,name,type,category,description,requirement_text,tier_criteria,badge_frame_assets,frame_family,preview_variant_id,published_variant_id,visibility,grant_mode,status,campaign_id,adventure_id,image_asset_id,created_by,created_at,updated_at';
const grantFields='id,honor_id,character_id,granted_by,granted_at,reason,source_event_id,revoked_at,revoked_by,revocation_reason';
const variantFields='id,honor_id,name,material,image_asset_id,status,allow_overhang,created_by,created_at,updated_at';
const characterFields='id,name,campaign_id';
const assetFields='asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved';

function canManage(user) {
  return Boolean(user && (user.admin || user.gm || user.isGM || user.role === 'gm'));
}
function setNotice(mount,message){
  mount.replaceChildren();
  const notice=document.createElement('p');
  notice.className='honors-load-status';
  notice.setAttribute('role','status');
  notice.textContent=message;
  mount.append(notice);
}
async function patchDefinition(id, fields) {
  return window.dbJson('honor_definitions?id=eq.'+encodeURIComponent(id),{
    method:'PATCH',body:JSON.stringify({...fields,updated_at:new Date().toISOString()})
  });
}

window.openArcaneHonorsAdmin = async () => {
  const admin=document.getElementById('admin');
  const panel=document.getElementById('adminHonors');
  const mount=document.getElementById('arcaneHonorsMount');
  if (!admin || !panel || !mount) return;

  admin.querySelectorAll('.admin-detail').forEach(el=>el.classList.add('hidden'));
  document.getElementById('adminOverview')?.classList.add('hidden');
  panel.classList.remove('hidden');
  const title=document.getElementById('adminPageTitle');
  if(title) title.textContent='ARCANE HONORS';
  const subtitle=document.getElementById('adminPageSubtitle');
  if(subtitle) subtitle.textContent='Medaljer, utmärkelser, badges och mottagare';
  document.getElementById('adminOverviewBtn')?.classList.remove('hidden');

  const sequence=++openSequence;
  instance?.destroy();
  instance=null;

  const user=window.activeUser?.();
  if (!canManage(user)) {
    setNotice(mount,'Du behöver administratörs- eller SL-behörighet för att öppna Honors-registret.');
    return;
  }
  if (typeof window.dbJson!=='function') {
    setNotice(mount,'Databaskopplingen är inte tillgänglig. Ladda om sidan och försök igen.');
    return;
  }

  setNotice(mount,'Laddar Honors-registret…');
  try {
    const [definitions,grants,characters,imageAssets,variants]=await Promise.all([
      window.dbJson('honor_definitions?select='+definitionFields+'&order=name.asc'),
      window.dbJson('honor_grants?select='+grantFields+'&order=granted_at.desc'),
      window.dbJson('characters?select='+characterFields+'&order=name.asc'),
      window.dbJson('arcane_system_assets?select='+assetFields+'&order=asset_key.asc'),
      window.dbJson('honor_relief_variants?select='+variantFields+'&order=created_at.asc')
    ]);
    if(sequence!==openSequence) return;
    const client=browserImageClient();
    let pilotEnabled=false, pilotInstalled=false;
    try{const cap=await client.capabilities();pilotInstalled=true;pilotEnabled=Boolean(cap?.enabled);}catch{/* Not installed or disabled: existing interface remains available. */}
    const assetRows=Array.isArray(imageAssets)?imageAssets:[];
    if(pilotInstalled){
      const [defs,reliefs,managed]=await Promise.all([
        window.dbJson('honor_definitions?select=id,image_revision'),
        window.dbJson('honor_relief_variants?select=id,image_revision'),
        client.loadAssets(window.dbJson)
      ]);
      for(const row of [...(definitions||[]),...(variants||[])]){
        const revision=[...defs,...reliefs].find(r=>r.id===row.id);row.image_revision=revision?.image_revision||0;
      }
      assetRows.push(...managed);
    }
    const applyImageResult=async(kind,target,file)=>{
      const result=file?await client.upload({targetKind:kind,target,file}):await client.remove({targetKind:kind,target});
      // Apply the committed pointer first. A signing/readback failure must not pretend activation failed.
      target.image_asset_id=result.state==='removed'?null:'hermes-alea:'+result.id;
      target.image_revision=result.result_revision;
      delete target.image_preview_pending;
      let managed=[];
      try{managed=await client.loadAssets(window.dbJson);}catch{target.image_preview_pending=true;}
      for(const row of managed){const index=assetRows.findIndex(a=>a.asset_key===row.asset_key);if(index<0)assetRows.push(row);else assetRows[index]=row;}
      window.dispatchEvent(new CustomEvent('hermes-alea:image-change'));
      return target;
    };
    const imageResolver=definition=>createHonorImageResolver(assetRows)(definition);

    const save=async data=>{
      const payload={...data};
      const id=payload.id;
      delete payload.id;
      if(pilotEnabled && id)delete payload.image_asset_id;
      for(const key of ['campaign_id','adventure_id','image_asset_id']){
        if(payload[key]==='') payload[key]=null;
      }
      if(payload.status==='draft') payload.grant_mode='manual';
      payload.updated_at=new Date().toISOString();
      if(id){
        return window.dbJson('honor_definitions?id=eq.'+encodeURIComponent(id),{
          method:'PATCH',body:JSON.stringify(payload)
        });
      }
      payload.created_by=user.id;
      return window.dbJson('honor_definitions',{
        method:'POST',body:JSON.stringify(payload)
      });
    };
    const removeDraft=async definition=>{
      if(definition.status!=='draft') throw Error('Endast utkast får tas bort.');
      if(grants.some(g=>String(g.honor_id)===String(definition.id))) throw Error('Utkast med tilldelningar får inte tas bort.');
      if(variants.some(v=>String(v.honor_id)===String(definition.id))) throw Error('Utkast med reliefvarianter får inte tas bort.');
      return window.dbJson('honor_definitions?id=eq.'+encodeURIComponent(definition.id)+'&status=eq.draft',{method:'DELETE'});
    };
    const saveVariant=async data=>{
      const payload={...data,image_asset_id:String(data.image_asset_id||'').trim()||null,created_by:user.id};
      return window.dbJson('honor_relief_variants',{method:'POST',body:JSON.stringify(payload)});
    };
    const previewVariant=async (definition,variantId)=>{
      const variant=variants.find(v=>String(v.id)===String(variantId));
      if(!variant||String(variant.honor_id)!==String(definition.id)||variant.status==='archived') throw Error('Ogiltig förhandsvisningsvariant.');
      return patchDefinition(definition.id,{preview_variant_id:variant.id});
    };
    const publishVariant=async (definition,variant)=>{
      if(String(variant.honor_id)!==String(definition.id)) throw Error('Reliefvarianten tillhör en annan utmärkelse.');
      const asset=assetRows.find(row=>row.asset_key===variant.image_asset_id&&row.asset_path&&row.alpha_preserved===true);
      if(!asset) throw Error('Bilden saknar publicerad transparensverifiering.');
      const updated=await window.dbJson('honor_relief_variants?id=eq.'+encodeURIComponent(variant.id),{
        method:'PATCH',body:JSON.stringify({status:'published',updated_at:new Date().toISOString()})
      });
      await patchDefinition(definition.id,{published_variant_id:variant.id});
      return updated;
    };
    const archiveVariant=async (definition,variant)=>{
      if(!variant||variant.status==='archived') return;
      const pointers={};
      if(String(definition.preview_variant_id)===String(variant.id)) pointers.preview_variant_id=null;
      if(String(definition.published_variant_id)===String(variant.id)) pointers.published_variant_id=null;
      if(Object.keys(pointers).length) await patchDefinition(definition.id,pointers);
      return window.dbJson('honor_relief_variants?id=eq.'+encodeURIComponent(variant.id),{
        method:'PATCH',body:JSON.stringify({status:'archived',updated_at:new Date().toISOString()})
      });
    };
    const grant=async ({honorId,characterId,reason})=>{
      const definition=(Array.isArray(definitions)?definitions:[]).find(d=>String(d.id)===String(honorId));
      if(!definition) throw Error('Utmärkelsen finns inte i ditt behörighetsområde.');
      if(definition.status!=='active') throw Error('Endast aktiva utmärkelser kan tilldelas.');
      if(definition.grant_mode==='automatic') throw Error('Automatiska utmärkelser kan inte tilldelas manuellt.');
      return window.dbJson('honor_grants',{
        method:'POST',body:JSON.stringify({
          honor_id:honorId,character_id:characterId,granted_by:user.id,
          reason:String(reason||'').trim()||null
        })
      });
    };

    instance=renderHonorsAdmin(mount,{
      definitions:Array.isArray(definitions)?definitions:[],
      grants:Array.isArray(grants)?grants:[],
      characters:Array.isArray(characters)?characters:[],
      imageAssets:assetRows,
      variants:Array.isArray(variants)?variants:[],
      resolveImage:imageResolver,
      imagePilotEnabled:pilotEnabled,
      onUploadImage:(kind,target,file)=>applyImageResult(kind,target,file),
      onRemoveImage:(kind,target)=>applyImageResult(kind,target,null),
      onSave:save,
      onDelete:removeDraft,
      onSaveVariant:saveVariant,
      onPreviewVariant:previewVariant,
      onPublishVariant:publishVariant,
      onArchiveVariant:archiveVariant,
      onGrant:grant
    });
  } catch(error) {
    if(sequence!==openSequence) return;
    setNotice(mount,'Kunde inte läsa Honors-registret: '+(error?.message||'okänt databasfel'));
  }
};
