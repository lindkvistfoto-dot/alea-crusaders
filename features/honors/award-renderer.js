// ARCANE AWARD SYSTEM V2.1 frames and fixed gem assets, shared by admin and Trophy Room.
(function (root) {
  'use strict';
  const AWARD_FRAME_KEYS = Object.freeze({
    bronze: 'arcane-award-frame-bronze',
    silver: 'arcane-award-frame-silver',
    gold: 'arcane-award-frame-gold'
  });
  const AWARD_TIERS = Object.freeze(['bronze', 'silver', 'gold']);
  const AWARD_ACCENTS = Object.freeze([
    'red','blue','green','yellow','orange','purple','pink','turquoise',
    'cyan','black','white','brown','light-gray','dark-gray','amber'
  ]);
  const GEM_POSITIONS = Object.freeze({
    top: Object.freeze({ x: 49.955223945159325, y: 7.3, s: 11.6, form: 'diamond' }),
    right: Object.freeze({ x: 91.6, y: 49.3, s: 9.8, form: 'diamond' }),
    bottom: Object.freeze({ x: 50.038125624977305, y: 94.0, s: 8.2, form: 'diamond' }),
    left: Object.freeze({ x: 8.245696851589353, y: 49.1, s: 9.4, form: 'diamond' }),
    crown: Object.freeze({ x: 50.4, y: 84.99007316678366, s: 18.4, form: 'round' })
  });
  const ACCENT_HEX = Object.freeze({
    red:'#b51232',blue:'#3189d6',green:'#398c53',yellow:'#edc634',orange:'#e88324',
    purple:'#8e57b7',pink:'#d96b9c',turquoise:'#36b8ae',cyan:'#39c6d3',
    black:'#202020',white:'#f4f0e7',brown:'#835532','light-gray':'#c7c9cc',
    'dark-gray':'#55585c',amber:'#d89a24'
  });
  function validTier(tier) { return AWARD_TIERS.includes(String(tier || '').toLowerCase()) ? String(tier).toLowerCase() : 'bronze'; }
  function accentKey(value) {
    const raw=String(value||'').trim().toLowerCase();
    if (AWARD_ACCENTS.includes(raw)) return raw;
    if (/^#[0-9a-f]{6}$/i.test(raw)) {
      const r=parseInt(raw.slice(1,3),16),g=parseInt(raw.slice(3,5),16),b=parseInt(raw.slice(5,7),16);
      const max=Math.max(r,g,b)/255,min=Math.min(r,g,b)/255,delta=max-min;
      if(delta<.12)return max<.22?'black':max>.88?'white':'dark-gray';
      let h=0;if(max===r/255)h=((g/255-b/255)/delta+6)%6;else if(max===g/255)h=(b/255-r/255)/delta+2;else h=(r/255-g/255)/delta+4;
      h*=60;
      if(h<15||h>=345)return 'red';if(h<35)return 'orange';if(h<70)return 'yellow';
      if(h<165)return 'green';if(h<195)return 'turquoise';if(h<225)return 'cyan';
      if(h<260)return 'blue';if(h<295)return 'purple';if(h<335)return 'pink';return 'red';
    }
    return 'red';
  }
  function awardFrameKey(tier) { return AWARD_FRAME_KEYS[validTier(tier)]; }
  function awardGemKey(position, accent) {
    return 'arcane-award-gem-'+(position==='crown'?'round':'diamond')+'-'+accentKey(accent);
  }
  function awardRenderLayers(imageAssetId, tier, accent) {
    const selectedAccent=accentKey(accent);
    return Object.freeze({
      imageAssetId:imageAssetId||null,
      frameAssetKey:awardFrameKey(tier),
      tier:validTier(tier),
      accent:selectedAccent,
      crownColor:ACCENT_HEX[selectedAccent],
      gemAssetKeys:Object.freeze(Object.fromEntries(Object.keys(GEM_POSITIONS).map(position=>[position,awardGemKey(position,selectedAccent)])))
    });
  }
  function mountAward(art, options={}) {
    if(!art||!art.ownerDocument)throw new TypeError('Award mount needs an element');
    const doc=art.ownerDocument,selected=awardRenderLayers(options.imageAssetId,options.tier,options.accent);
    const resolve=options.resolveAsset||(()=>''), image=options.motifUrl||'';
    art.classList.add('arcane-award-mount');art.replaceChildren();
    function addImage(role,src,z,alt=''){
      if(!src)return null;
      const node=doc.createElement('img');node.className='arcane-award-layer arcane-award-'+role;
      node.src=src;node.alt=alt;node.draggable=false;node.style.zIndex=String(z);
      node.setAttribute('data-award-layer',role);art.append(node);return node;
    }
    if(image)addImage('motif',image,1,options.motifAlt||'');
    else if(options.motifLabel){const label=doc.createElement('span');label.className='arcane-award-layer arcane-award-motif-label';label.textContent=options.motifLabel;label.style.zIndex='1';label.setAttribute('data-award-layer','motif');art.append(label);}
    const crown=doc.createElement('span');crown.className='arcane-award-layer arcane-award-crown-background';
    crown.style.setProperty?.('--award-accent',selected.crownColor);crown.setAttribute('aria-hidden','true');crown.setAttribute('data-award-layer','crown-background');art.append(crown);
    for(const position of Object.keys(GEM_POSITIONS)){
      const p=GEM_POSITIONS[position],key=selected.gemAssetKeys[position],src=options.gemUrls?.[key]||resolve(key);
      const gem=addImage('gem',src,position==='crown'?3:2);
      if(!gem)continue;
      gem.className+=' arcane-award-gem arcane-award-gem-'+position;
      gem.style.left=p.x+'%';gem.style.top=p.y+'%';gem.style.width=p.s+'%';gem.style.height=p.s+'%';
      gem.style.right='auto';gem.style.bottom='auto';gem.style.transform='translate(-50%, -50%)';
      gem.dataset.gemPosition=position;gem.dataset.gemAssetKey=key;
    }
    const frame=options.frameUrl||resolve(selected.frameAssetKey);addImage('frame',frame,4);
    art.dataset.awardMetal=selected.tier;art.dataset.awardAccent=selected.accent;
    return selected;
  }
  root.ArcaneAwardRenderer=Object.freeze({AWARD_FRAME_KEYS,AWARD_TIERS,AWARD_ACCENTS,GEM_POSITIONS,ACCENT_HEX,accentKey,awardFrameKey,awardGemKey,awardRenderLayers,mountAward});
})(typeof window !== 'undefined' ? window : globalThis);
