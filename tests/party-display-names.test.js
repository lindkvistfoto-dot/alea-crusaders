import {describe, expect, it} from 'vitest';
import {partyFirstName, partyProfileName} from '../features/party/panel.js';

describe('party display names',()=>{
  it('keeps the first part of the character name, including hyphens',()=>{
    expect(partyFirstName('  Anna-Lisa från Caddo')).toBe('Anna-Lisa');
    expect(partyFirstName('Lyra Gråväv')).toBe('Lyra');
  });

  it.each([
    ['anna.svensson','Anna'],
    ['per_lind','Per'],
    ['eva+dev@example.test','Eva'],
    ['  åsa@example.test','Åsa'],
    ['Anna-Lisa Andersson','Anna-Lisa'],
    ['', 'Spelare'],
    [null, 'Spelare']
  ])('formats the profile fallback %s', (profile,expected)=>{
    expect(partyProfileName(profile,'Spelare')).toBe(expected);
  });
});
