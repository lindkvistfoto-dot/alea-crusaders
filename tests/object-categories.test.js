import { expect, it } from 'vitest';
import { filterObjectLibrary, objectCategories } from '../features/map/object-categories.js';

it('combines collection, category and search without including another campaign', () => {
  const definitions = [
    { name: 'Träkista', library_category: 'Förvaring och gods' },
    { name: 'Kistan i kryptan', campaign_id: 'katakomber', library_category: 'Förvaring och gods' },
    { name: 'Relik', campaign_id: 'katakomber', library_category: 'Övrigt' },
    { name: 'Annan kista', campaign_id: 'dimön', library_category: 'Förvaring och gods' },
    { name: 'Utgången kista', active: false, library_category: 'Förvaring och gods' },
  ];
  const names = (collection = 'all', category = '', search = '') =>
    filterObjectLibrary(definitions, 'katakomber', collection, category, search).map(d => d.name);
  expect(names()).toEqual(['Träkista', 'Kistan i kryptan', 'Relik']);
  expect(names('shared')).toEqual(['Träkista']);
  expect(names('campaign', 'Förvaring och gods', ' KRYPTAN ')).toEqual(['Kistan i kryptan']);
  expect(names('campaign', 'Övrigt')).toEqual(['Relik']);
  expect(names('shared', 'Övrigt')).toEqual([]);
  expect(names('all', '', 'förvaring')).toEqual(['Träkista', 'Kistan i kryptan']);
  expect(new Set(objectCategories).size).toBe(9);
});
