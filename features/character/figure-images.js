/* v0.35.41 – separate full-figure images for character equipment views.
   Images are saved in the existing character JSON (including backup and Supabase sync).
   WebP is used to preserve transparent PNG alpha without sending huge source files. */
(function(){
  'use strict';
  const TYPES=[
    {key:'base',name:'Helfigur',detail:'Kläder / utan rustning'},
    {key:'armored',name:'Helfigur (rustning)',detail:'Med rustning'}
  ];
  const MAX_UPLOAD=12*1024*1024;
  const MAX_IMAGE_DATA=2400000;
  const ALLOWED_MIME=['image/png','image/jpeg','image/webp'];
  let picker=null,viewer=null;
  function validType(key){return TYPES.some(t=>t.key===key)}
  function getSource(character,key){
    const value=character?.figureImages?.[key];
    return typeof value==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)?value:'';
  }
  function ensurePicker(){
    if(picker)return picker;
    picker=document.createElement('input');
    picker.type='file';
    picker.id='characterFigureFile';
    picker.accept='.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
    picker.className='portrait-file';
    picker.setAttribute('aria-label','Ladda upp helfigur');
    picker.addEventListener('change',()=>{
      const file=picker.files?.[0],kind=picker.dataset.kind;
      picker.value='';
      if(file)uploadFigure(file,kind);
    });
    document.body.appendChild(picker);
    return picker;
  }
  function ensureGallery(){
    return document.getElementById('characterFigureGallery');
  }
  function renderGallery(){
    const host=ensureGallery();
    if(!host||!current){if(host)host.hidden=true;return}
    host.hidden=false; // Dedicated Bilder tab always shows upload placeholders.
    const allowEdit=editing&&canEditCharacter(current);
    host.innerHTML='<div class="character-figure-heading"><b>Rollperson · Bilder</b><span>Helfigurer för utrustningsvyn</span></div>'+
      '<div class="character-figure-grid">'+TYPES.map(type=>{
        const src=getSource(current,type.key);
        return '<article class="character-figure-item">'+
          '<button type="button" class="character-figure-preview" '+(src?'onclick="aleaFigureShow(\''+type.key+'\')" title="Visa större bild"':'disabled')+'>'+
            (src?'<img src="'+src+'" alt="'+type.name+'">':'<span class="character-figure-empty" aria-hidden="true">♙</span>')+
          '</button><div class="character-figure-description"><strong>'+type.name+'</strong><small>'+type.detail+'</small>'+
          (allowEdit?'<div class="character-figure-actions"><button class="smallbtn" type="button" onclick="aleaFigureChoose(\''+type.key+'\')">'+(src?'Byt bild':'Ladda upp')+'</button>'+
            (src?'<button class="smallbtn" type="button" onclick="aleaFigureRemove(\''+type.key+'\')">Ta bort</button>':'')+'</div>':
            (!src?'<span class="character-figure-missing">Ingen bild ännu</span>':''))+
          '</div></article>';
      }).join('')+'</div>';
  }
  function chooseFigure(key){
    if(!validType(key)||!current||!canEditCharacter(current))return;
    const input=ensurePicker();
    input.dataset.kind=key;
    input.click();
  }
  function uploadFigure(file,key){
    if(!validType(key)||!current||!canEditCharacter(current))return;
    if(!ALLOWED_MIME.includes(file.type)){alert('Välj PNG, JPG eller WebP.');return}
    if(file.size>MAX_UPLOAD){alert('Bilden är för stor. Max 12 MB före bearbetning.');return}
    const target=current;
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onerror=()=>{URL.revokeObjectURL(url);alert('Kunde inte läsa bilden.')};
    img.onload=()=>{
      URL.revokeObjectURL(url);
      try{
        if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>60000000){
          throw new Error('Bilden har ogiltiga eller för stora dimensioner.');
        }
        const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');
        if(!ctx)throw new Error('Bildbearbetning stöds inte.');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        let encoded=canvas.toDataURL('image/webp',.84);
        // Safari/older browsers may not support WebP canvas encoding. PNG keeps alpha.
        if(!encoded.startsWith('data:image/webp;'))encoded=canvas.toDataURL('image/png');
        if(encoded.length>MAX_IMAGE_DATA)throw new Error('Bilden blev för stor efter bearbetning. Prova en mindre bild.');
        if(!canEditCharacter(target))return;
        const original=target.figureImages;
        target.figureImages={...(original||{}),[key]:encoded};
        try{save()}catch(e){target.figureImages=original;throw e}
        if(current===target)renderGallery();
        if(typeof showBackupToast==='function')showBackupToast('✓ Helfigur sparad');
      }catch(e){alert('Kunde inte spara helfigur: '+(e?.message||e))}
    };
    img.src=url;
  }
  async function removeFigure(key){
    if(!validType(key)||!current||!canEditCharacter(current)||!getSource(current,key))return;
    const target=current;
    if(!await askConfirm('Ta bort helfigur','Vill du ta bort den valda helfigursbilden?','Ta bort',true))return;
    if(!canEditCharacter(target))return;
    const original=target.figureImages;
    target.figureImages={...(original||{})};
    delete target.figureImages[key];
    try{save()}catch(e){target.figureImages=original;alert('Kunde inte ta bort bilden: '+(e?.message||e));return}
    if(current===target)renderGallery();
  }
  function closeViewer(){
    viewer?.classList.add('hidden');
    if(viewer){const img=viewer.querySelector('img');if(img)img.removeAttribute('src')}
  }
  function showFigure(key){
    const src=validType(key)&&current&&getSource(current,key);
    if(!src)return;
    if(!viewer){
      viewer=document.createElement('div');
      viewer.id='characterFigureViewer';
      viewer.className='character-figure-viewer hidden';
      viewer.setAttribute('role','dialog');
      viewer.setAttribute('aria-modal','true');
      viewer.setAttribute('aria-label','Helfigur i större format');
      viewer.innerHTML='<div class="character-figure-viewer-card"><button type="button" aria-label="Stäng helfigur" onclick="aleaFigureClose()">×</button><img alt="Helfigur"></div>';
      viewer.addEventListener('click',e=>{if(e.target===viewer)closeViewer()});
      document.body.appendChild(viewer);
      document.addEventListener('keydown',e=>{if(e.key==='Escape')closeViewer()});
    }
    viewer.querySelector('img').src=src;
    viewer.classList.remove('hidden');
    viewer.querySelector('button')?.focus();
  }
  window.aleaRenderCharacterFigureGallery=renderGallery;
  window.aleaFigureChoose=chooseFigure;
  window.aleaFigureRemove=removeFigure;
  window.aleaFigureShow=showFigure;
  window.aleaFigureClose=closeViewer;
})();
