/*
 * ARCANE SYSTEMBIBLIOTEK — versioned, shared UI art registry.
 * Campaign/user images belong in the existing image libraries. These assets are
 * immutable app-system graphics used by any UI module.
 */
(function(){
  'use strict';
  const VERSION='1.0.0';
  const BASE='./assets/arcane/system/v1/';
  const ATTRIBUTE_ATLAS='./assets/arcane/system/v2/attributes-atlas.png';
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
    ['icon-equipment','Utrustning','Ikoner','Utrustningsknapp'],
    // Individer i den AI-genererade, godkända ARCANE-atlasen.
    // Varje ruta är 64x64 px i ett 8x3-ark; ingen SVG eller symbolfont.
    ['attribute-fysik','Fysik','Grundegenskaper','Muskelsigill, bronshölje',0,0],
    ['attribute-styrka','Styrka','Grundegenskaper','Korsade svärd',1,0],
    ['attribute-karisma','Karisma','Grundegenskaper','Stjärnsigill',2,0],
    ['attribute-storlek','Storlek','Grundegenskaper','Heraldisk sköld',3,0],
    ['attribute-smidighet','Smidighet','Grundegenskaper','Förgylld vinge',4,0],
    ['attribute-intelligens','Intelligens','Grundegenskaper','Uppslagen bok',5,0],
    ['attribute-psykisk-kraft','Psykisk kraft','Grundegenskaper','Ockult öga',6,0],
    ['attribute-group-medallion','Gruppsigill','Grundegenskaper','Nummerfritt bronssigill för dynamiska gruppvärden',7,0],
    ['attribute-title-medallion','Attributkrön III','Grundegenskaper','Mittmedaljong för panelens rubrik',0,1],
    ['attribute-corner-tl','Övre vänstra ornament','Grundegenskaper','Infällt hörn',1,1],
    ['attribute-corner-tr','Övre högra ornament','Grundegenskaper','Infällt hörn',2,1],
    ['attribute-corner-bl','Nedre vänstra ornament','Grundegenskaper','Infällt hörn',3,1],
    ['attribute-corner-br','Nedre högra ornament','Grundegenskaper','Infällt hörn',4,1],
    ['attribute-header-jewel','Rubrikdiamant','Grundegenskaper','Grön ädelsten och metallinläggning',5,1]
  ];
  const CATALOG=Object.freeze(DEFINITIONS.map(function(def){
    const sprite=Number.isInteger(def[4])?Object.freeze({
      col:def[4],row:def[5],columns:8,rows:3
    }):null;
    return Object.freeze({id:def[0],name:def[1],category:def[2],
      description:def[3],version:sprite?'2.0.0':VERSION,
      src:sprite?ATTRIBUTE_ATLAS:BASE+def[0]+'.avif',sprite,
      format:sprite?'image/png':'image/avif',
      source:sprite?'ARCANE system/v2':'ARCANE system/v1'});
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
    // Attributgrafiken har egen readiness-grind. Gamla systemikonerna förblir
    // opåverkade om det nya grafikarket inte kan hämtas.
    imageStatus(BY_ID.get('attribute-fysik')).then(ok=>{
      document.documentElement.classList.toggle('arcane-attributes-ready',ok);
    });
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
      return '<article class="arcane-system-tile'+(asset.sprite?' is-loaded':'')+'" data-asset="'+asset.id+'">'+
       '<div class="arcane-system-preview">'+
       (asset.sprite
         ? '<span class="arcane-system-sprite" aria-hidden="true" style="background-image:url('+escape(asset.src)+');--arcane-col:'+asset.sprite.col+';--arcane-row:'+asset.sprite.row+'"></span>'
         : '<img loading="lazy" alt="" src="'+escape(asset.src)+'" '+
           'onload="this.closest(\'.arcane-system-tile\')?.classList.add(\'is-loaded\')" '+
           'onerror="this.closest(\'.arcane-system-tile\')?.classList.add(\'is-missing\')">')+
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