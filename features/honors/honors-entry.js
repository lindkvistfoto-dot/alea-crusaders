import { renderHonorsAdmin } from './honors-admin.js';
let instance;
let openSequence=0;

const definitionFields='id,name,type,description,requirement_text,visibility,grant_mode,status,campaign_id,adventure_id,image_asset_id,created_by,created_at,updated_at';
const grantFields='id,honor_id,character_id,granted_by,granted_at,reason,source_event_id,revoked_at,revoked_by,revocation_reason';
const characterFields='id,name,campaign_id';
const assetFields='asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved';

function setNotice(mount,message){
  mount.replaceChildren();
  const notice=document.createElement('p');
  notice.className='honors-load-status';
  notice.setAttribute('role','status');
  notice.textContent=message;
  mount.append(notice);
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
  if(subtitle) subtitle.textContent='Medaljer, utmärkelser och mottagare';
  document.getElementById('adminOverviewBtn')?.classList.remove('hidden');

  const sequence=++openSequence;
  instance?.destroy();
  instance=null;

  const user=window.activeUser?.();
  if (!user?.admin) {
    setNotice(mount,'Du behöver administratörsbehörighet för att öppna medaljregistret.');
    return;
  }
  if (typeof window.dbJson!=='function') {
    setNotice(mount,'Databaskopplingen är inte tillgänglig. Ladda om sidan och försök igen.');
    return;
  }

  setNotice(mount,'Laddar medaljregistret…');
  try {
    const [definitions,grants,characters,imageAssets]=await Promise.all([
      window.dbJson('honor_definitions?select='+definitionFields+'&order=name.asc'),
      window.dbJson('honor_grants?select='+grantFields+'&order=granted_at.desc'),
      window.dbJson('characters?select='+characterFields+'&order=name.asc'),
      window.dbJson('arcane_system_assets?select='+assetFields+'&order=asset_key.asc')
    ]);
    if(sequence!==openSequence) return;

    const save=async data=>{
      const payload={...data};
      const id=payload.id;
      delete payload.id;
      for(const key of ['campaign_id','adventure_id','image_asset_id']){
        if(payload[key]==='') payload[key]=null;
      }
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

    const grant=async ({honorId,characterId,reason})=>{
      return window.dbJson('honor_grants',{
        method:'POST',
        body:JSON.stringify({
          honor_id:honorId,
          character_id:characterId,
          granted_by:user.id,
          reason:String(reason||'').trim()||null
        })
      });
    };

    instance=renderHonorsAdmin(mount,{
      definitions:Array.isArray(definitions)?definitions:[],
      grants:Array.isArray(grants)?grants:[],
      characters:Array.isArray(characters)?characters:[],
      imageAssets:Array.isArray(imageAssets)?imageAssets:[],
      onSave:save,
      onGrant:grant
    });
  } catch(error) {
    if(sequence!==openSequence) return;
    setNotice(mount,'Kunde inte läsa medaljregistret: '+(error?.message||'okänt databasfel'));
  }
};
