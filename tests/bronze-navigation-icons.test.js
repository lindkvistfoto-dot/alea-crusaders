import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url));

describe('Illustrated bronze navigation v0.35.114',()=>{
  const html=read('index.html').toString('utf8');
  const js=read('features/home/navigation-icons.js').toString('utf8');
  const css=read('features/home/topbar.css').toString('utf8');
  const home=read('features/home/home.js').toString('utf8');

  it('has both authentic compact AVIF sprites, 6 pictures in each row',()=>{
    for(const style of ['normal','active']){
      const buffer=read('assets/navigation/alea-nav-'+style+'.avif');
      expect(buffer.length).toBeGreaterThan(2000);
      expect(buffer.toString('ascii',4,12)).toBe('ftypavif');
      const pos=buffer.indexOf(Buffer.from('ispe'));
      expect(pos).toBeGreaterThan(0);
      expect(buffer.readUInt32BE(pos+8)).toBe(288);
      expect(buffer.readUInt32BE(pos+12)).toBe(48);
    }
  });

  it('connects the icon controller without removing existing click handlers',()=>{
    expect(html).toContain('features/home/navigation-icons.js?v=0.35.114');
    for(const label of ['openShop()','openInn()','openAcademy()','openCombat()','openCharacters()']){
      expect(html).toContain(label);
    }
    expect(js).toContain("nav.insertBefore(characters, combat)");
    expect(js).toContain("['shopNavBtn', 'shopPage', 0]");
    expect(js).toContain("['innNavBtn', 'innPage', 1]");
    expect(js).toContain("['academyNavBtn', 'academyPage', 2]");
    expect(js).toContain("['materialNavBtn', 'legolasPanel', 3]");
    expect(js).toContain("['landingCharactersNavBtn', 'home', 4]");
    expect(js).toContain("['combatNavBtn', 'combatPage', 5]");
  });

  it('draws the six pictures as real desktop menu buttons without waiting for JS',()=>{
    const expected=[
      ['shopNavBtn','0%'],['innNavBtn','20%'],['academyNavBtn','40%'],
      ['landingCharactersNavBtn','80%'],['combatNavBtn','100%']
    ];
    for(const [id,position] of expected) {
      const button=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'))?.[0];
      expect(button).toContain('alea-bronze-nav');
      expect(button).toContain('--alea-nav-pos:'+position);
    }
    expect(html.indexOf('id="landingCharactersNavBtn"')).toBeLessThan(html.indexOf('id="combatNavBtn"'));
    expect(read('features/material/viewer.js').toString('utf8'))
      .toContain("nav.className='btn legolas-nav alea-bronze-nav'");
    expect(css).toContain('@media (min-width:901px)');
    expect(css).toContain('width:62px!important');
  });

  it('uses dark frames by default and glowing frames only for active destinations',()=>{
    expect(css).toContain('assets/navigation/alea-nav-normal.avif');
    expect(css).toContain('assets/navigation/alea-nav-active.avif');
    expect(css).toContain('background-size:600% 100%');
    expect(css).toContain('.alea-bronze-nav[aria-current="page"]::before');
    expect(js).toContain("button.setAttribute('aria-current', current)");
    expect(home).toContain("!el('view')?.classList.contains('hidden')");
  });

  it('preserves compact mobile menu and synchronizes the corresponding icon states',()=>{
    expect(css).toContain('button[data-mobile-target="shopNavBtn"]::before');
    expect(css).toContain('button[data-mobile-target="academyNavBtn"]::before');
    expect(js).toContain("item.dataset.navActive = String(isActive(id))");
    expect(read('features/home/topbar.js').toString('utf8')).toContain('original.click()');
  });
});
