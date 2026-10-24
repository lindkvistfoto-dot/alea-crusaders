// Character-side award showcase. The GM-only database bridge must not be used
// to expose hidden award definitions to players.
const root=document.getElementById('arcaneHonorsCharacterBody');
if(root){
  const render=()=>{
    const context=window.aleaHonorsContext?.();
    root.textContent='';
    const p=document.createElement('p');
    p.textContent='Hedersgalleri – medaljer visas här när den säkra rollpersonsfrågan är ansluten.';
    root.append(p);
    if(context?.isAdmin){
      const button=document.createElement('button');
      button.type='button';button.className='btn';button.textContent='Hantera utmärkelser';
      button.addEventListener('click',()=>{if(typeof window.openAdmin==='function')window.openAdmin();});
      root.append(button);
    }
  };
  render();
}
