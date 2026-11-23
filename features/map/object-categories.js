export const objectCategories = [
  'Möbler', 'Förvaring och gods', 'Byggnadsdelar', 'Inredning och bruksföremål',
  'Eld och belysning', 'Hinder och försvar', 'Natur och terräng',
  'Monument och ritualföremål', 'Övrigt',
];

export function filterObjectLibrary(definitions, campaignId, collection, category, search) {
  const query = search.trim().toLocaleLowerCase('sv');
  return definitions.filter(definition => {
    const owner = definition.campaign_id;
    if (definition.active === false || (owner && owner !== campaignId)) return false;
    if ((collection === 'campaign' && !owner) || (collection === 'shared' && owner)) return false;
    if (category && category !== definition.library_category) return false;
    return [definition.name, definition.library_category, definition.object_type]
      .some(value => String(value ?? '').toLocaleLowerCase('sv').includes(query));
  });
}
