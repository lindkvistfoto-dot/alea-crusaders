/*
 * ARCANE SYSTEMBIBLIOTEK — versioned, shared UI art registry.
 * Campaign/user images belong in the existing image libraries. These assets are
 * immutable app-system graphics used by any UI module.
 */
(function(){
  'use strict';
  const VERSION='1.0.0';
  const BASE='./assets/arcane/system/v1/';
  const DEFINITIONS=[
    ['portrait-frame','Porträttram','Ramar','Genomskinlig mitt för rollpersonsporträtt'],
    ['nameplate','Namnskylt','Ramar','Text läggs ovanpå, aldrig inbakad'],
    ['stat-panel','Informationspanel','Paneler','Återanvändbart fält med bronskant'],
    ['combat-medallion','Stridsmedaljong','Ramar','Öppet hexagonfönster för stridsikon'],
    ['equipment-button','Utrustningsknapp','Knappar','Primär grön läderknapp'],
    ['tab-active','Flik · aktiv','Knappar','Aktivt tillstånd'],
    ['tab-inactive','Flik · inaktiv','Knappar','Inaktivt tillstånd'],
    ['nav-active','Navigeringsruta · aktiv','Knappar','Ikon läggs ovanpå'],
    ['nav-inactive','Navigeringsruta · inaktiv','Knappar','Ikon läggs ovanpå'],
    ['icon-compass','Kompass','Ikoner','Navigeringssymbol'],
    ['icon-laurel','Lagerkrans','Ikoner','Rollperson'],
    ['icon-swords','Korsade svärd','Ikoner','Strid'],
    ['icon-magic','Magisigill','Ikoner','Magi'],
    ['icon-map','Karta','Ikoner','Platser'],
    ['icon-die','Tärning','Ikoner','Tärning'],
    ['icon-gear','Kugghjul','Ikoner','Inställningar'],
    ['icon-person','Person','Ikoner','Stridsikonsymbol'],
    ['icon-female','Kvinnosymbol','Ikoner','Kön'],
    ['icon-hourglass','Timglas','Ikoner','Ålder'],
    ['icon-height','Längd','Ikoner','Längd'],
    ['icon-weight','Vikt','Ikoner','Vikt'],
    ['icon-heart','Hjärta','Ikoner','Stånd'],
    ['icon-equipment','Utrustning','Ikoner','Utrustningsknapp']
  ];
  const CATALOG=Object.freeze(DEFINITIONS.map(function(def){
    return Object.freeze({id:def[0],name:def[1],category:def[2],
      description:def[3],version:VERSION,src:BASE+def[0]+'.avif',
      format:'image/avif',source:'ARCANE system/v1'});
  }));
  const BY_ID=new Map(CATALOG.map(entry=>[entry.id,entry]));
  const CRITICAL=['portrait-frame','nameplate','stat-panel','combat-medallion',
    'equipment-button','tab-active','tab-inactive','icon-person',
    'icon-female','icon-hourglass','icon-height','icon-weight',
    'icon-heart','icon-equipment'];
  let preloadPromise=null;
  const loaded=new Map();
  const escape=str=>String(str??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  function imageStatus(asset){
    if(loaded.has(asset.id))return Promise.resolve(loaded.get(asset.id));
    return new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>{
        const okay=!!(image.naturalWidth&&image.naturalHeight);
        loaded.set(asset.id,okay);
        resolve(okay);
      };
      image.onerror=()=>{loaded.set(asset.id,false);resolve(false)};
      image.src=asset.src;
    });
  }
  function preload(){
    if(preloadPromise)return preloadPromise;
    preloadPromise=Promise.all(CRITICAL.map(id=>imageStatus(BY_ID.get(id)))).then(results=>{
      const ready=results.every(Boolean);
      document.documentElement.classList.toggle('arcane-system-images-ready',ready);
      document.documentElement.dataset.arcaneSystemLibrary=ready?'ready':'waiting-for-assets';
      return ready;
    });
    return preloadPromise;
  }
  function renderAdmin(){
    const host=document.getElementById('arcaneSystemLibraryGallery');
    if(!host)return;
    const term=(document.getElementById('arcaneSystemLibrarySearch')?.value||'')
      .trim().toLocaleLowerCase('sv');
    const selected=document.getElementById('arcaneSystemLibraryCategory')?.value||'all';
    const showing=CATALOG.filter(asset=>{
      return (selected==='all'||asset.category===selected)&&
        (!term||(asset.name+' '+asset.id+' '+asset.description).toLocaleLowerCase('sv').includes(term));
    });
    host.innerHTML=showing.map(asset=>{
      const status=loaded.get(asset.id);
      return '<article class="arcane-system-tile" data-asset="'+asset.id+'">'+
       '<div class="arcane-system-preview">'+
       '<img loading="lazy" alt="" src="'+escape(asset.src)+'" '+
         'onload="this.closest(\'.arcane-system-tile\')?.classList.add(\'is-loaded\')" '+
         'onerror="this.closest(\'.arcane-system-tile\')?.classList.add(\'is-missing\')">'+
       '<span class="arcane-system-missing">Bildfil saknas i appens assets-mapp</span></div>'+
       '<h3>'+escape(asset.name)+'</h3>'+
       '<p>'+escape(asset.description)+'</p>'+
       '<code>'+escape(asset.id)+'</code>'+
       '<button class="smallbtn" type="button" data-copy-arcane="'+escape(asset.id)+'">Kopiera sökväg</button>'+
       '</article>';
    }).join('')||'<p>Inga grafikdelar matchar din sökning.</p>';
    const status=document.getElementById('arcaneSystemLibraryStatus');
    if(status)status.textContent='ARCANE '+VERSION+' · '+showing.length+' av '+CATALOG.length+
      ' grafikdelar · systemfiler, inte kampanjbilder';
  }
  function openAdmin(){
    if(typeof openAdminSection==='function')return openAdminSection('arcaneSystem');
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-copy-arcane]');
    if(!button)return;
    const asset=BY_ID.get(button.dataset.copyArcane);
    if(!asset)return;
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(asset.src).then(()=>{
      button.textContent='Kopierad';
    }).catch(()=>{button.textContent=asset.src});
    else button.textContent=asset.src;
  });
  window.aleaArcaneSystem=Object.freeze({
    version:VERSION,
    list:(category)=>CATALOG.filter(asset=>!category||asset.category===category),
    get:(id)=>BY_ID.get(String(id))||null,
    resolve:(id)=>BY_ID.get(String(id))?.src||'',
    preload,renderAdmin,openAdmin
  });
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',preload,{once:true});
  else preload();
})();