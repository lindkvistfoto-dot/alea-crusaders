import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const html=read('index.html').toString('utf8');
const css=read('features/home/topbar.css').toString('utf8');
const controller=read('features/home/navigation-icons.js').toString('utf8');
const material=read('features/material/viewer.js').toString('utf8');
const destinations=[
  ['shopNavBtn','guild'],
  ['alchemyNavBtn','alkemi'],
  ['innNavBtn','inn'],
  ['academyNavBtn','academy'],
  ['materialNavBtn','material'],
  ['landingCharactersNavBtn','characters'],
  ['combatNavBtn','combat']
];

describe('v0.35.117 – sharp 104px navigation icons',()=>{
  it('uses separate 512×512 AVIF images for all sixteen home and destination states',()=>{
    for(const name of ['home',...destinations.map(x=>x[1])]){
      for(const state of ['normal','active']){
        const file=read('assets/navigation/'+name+'-'+state+'.avif');
        expect(file.toString('ascii',4,12),name+'/'+state).toBe('ftypavif');
        const ispe=file.indexOf(Buffer.from('ispe'));
        expect(ispe,name+'/'+state).toBeGreaterThan(0);
        expect(file.readUInt32BE(ispe+8),name+'/'+state).toBe(512);
        expect(file.readUInt32BE(ispe+12),name+'/'+state).toBe(512);
      }
    }
  });

  it('loads the real image pair into every navigation button, including dynamic Material',()=>{
    for(const [id,name] of destinations){
      const parent=(id==='materialNavBtn'?material:html);
      expect(parent).toContain(id);
      expect(parent).toContain('navigation/'+name+'-normal.avif');
      expect(parent).toContain('navigation/'+name+'-active.avif');
    }
    for(const name of ['home-normal','home-active']){
      expect(html).toContain('navigation/'+name+'.avif');
    }
    expect(html).toContain('id="alchemyNavBtn" class="btn alchemy-nav alea-nav-art"');
    expect(html).toContain('onclick="openAlchemyShop()"');
    expect(material).toContain("const target=el('landingCharactersNavBtn')");
  });

  it('uses matching 104px frames and a fixed home column, with wrapping only when needed',()=>{
    expect(css).toContain('min-height:104px');
    expect(css).toContain('width:104px!important');
    expect(css).toContain('height:104px!important');
    expect(css).toContain('padding-left:120px');
    expect(css).toContain('flex-wrap:wrap');
    expect(css).toContain('object-fit:contain');
    expect(css).toContain('max-width:100%');
    expect(css).not.toContain('v0.35.115 — match');
    expect(css).not.toContain('alea-nav-normal.avif');
    expect(css).not.toContain('600% 100%');
    expect(css).toContain('@media(max-width:700px)');
  });

  it('indicates active state correctly for Guild vs Alchemy and ordinary pages',()=>{
    expect(controller).toContain("shop.classList.contains('shop-alchemy')");
    expect(controller).toContain("shopNavBtn:()=>visible('shopPage')&&!alchemyOpen()");
    expect(controller).toContain("alchemyNavBtn:()=>alchemyOpen()");
    for(const [id] of destinations){
      expect(controller).toContain(id+':');
    }
    expect(css).toContain('.alea-nav-art[aria-current="page"] > .alea-nav-asset--active');
    expect(css).toContain('.alea-banner-home-link[aria-current="page"] .alea-banner-home-icon--active');
  });

  it('keeps normal mobile hub and native navigation callbacks',()=>{
    const topbar=read('features/home/topbar.js').toString('utf8');
    expect(topbar).toContain('original.click()');
    expect(css).toContain('button[data-mobile-target="alchemyNavBtn"]');
    expect(css).toContain('button[data-mobile-target="shopNavBtn"]');
    expect(html).toContain('onclick="openShop()"');
    expect(html).toContain('onclick="openCombat()"');
    expect(html).toContain('onclick="openCharacters()"');
    expect(html).toContain('features/home/navigation-icons.js?v=0.35.117');
  });
});
