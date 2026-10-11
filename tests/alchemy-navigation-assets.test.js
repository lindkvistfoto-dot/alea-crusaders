import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

describe('Alkemi – fristående originalbaserade navigationsbilder (steg 1)',()=>{
  for(const state of ['normal','active']){
    it('har en separat högupplöst AVIF för '+state,()=>{
      const path=new URL('../assets/navigation/alkemi-'+state+'.avif',import.meta.url);
      const data=readFileSync(path);
      expect(data.toString('ascii',4,12)).toBe('ftypavif');
      expect(data.length).toBeGreaterThan(20000);
      const ispe=data.indexOf(Buffer.from('ispe'));
      expect(ispe).toBeGreaterThan(0);
      expect(data.readUInt32BE(ispe+8)).toBe(512);
      expect(data.readUInt32BE(ispe+12)).toBe(512);
    });
  }
  it('har ännu inte bytt ut Alkemi-knappen – bara förberett bildfilerna',()=>{
    const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
    expect(html).toContain('id="alchemyNavBtn"');
    expect(html).toContain('onclick="openAlchemyShop()"');
    expect(html).not.toContain('assets/navigation/alkemi-normal.avif');
  });
});
