// Sort by a session-specific score, then take distinct subjects before repeats.
function score(seed, id) {
  let hash = 2166136261;
  for (const char of seed + '/' + id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  return Math.imul(hash, 2246822507) >>> 0;
}

export function edition(stories, session) {
  const ranked = session ? [...stories].sort((a, b) =>
    score(session, a.id) - score(session, b.id) || a.id.localeCompare(b.id, 'sv')) : stories;
  const seen = new Set();
  const first = [], rest = [];
  for (const story of ranked) {
    (seen.has(story.category) ? rest : first).push(story);
    seen.add(story.category);
  }
  return first.concat(rest).slice(0, 5);
}
