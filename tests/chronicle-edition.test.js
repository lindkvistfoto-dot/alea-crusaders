import { expect, test } from 'vitest';
import { edition } from '../features/home/chronicle-selection.js';
import { stories } from '../features/home/chronicle-issue.js';

test('each issue has five illustrated stories from distinct desks', () => {
  for (const seed of [null, 'session-1', 'session-2']) {
    const issue = edition(stories, seed);
    expect(issue).toHaveLength(5);
    expect(new Set(issue.map(s => s.category)).size).toBe(5);
    for (const story of issue) {
      expect(story.asset_path).toMatch(/^hermes\/(skill|spell|system-asset)\/[\w.-]+\/[a-f0-9]{64}\.webp$/);
      expect(story.body.length).toBeGreaterThan(1);
    }
  }
});
test('a session is independent of input order and can change the lead desk', () => {
  expect(edition([...stories].reverse(), 'session-1')).toEqual(edition(stories, 'session-1'));
  const leads = Array.from({ length: 32 }, (_, i) => edition(stories, String(i))[0].category);
  expect(new Set(leads).size).toBeGreaterThan(3);
});
