import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const framing = 'Latest AI news and noteworthy updates';
const manifest = JSON.parse(await read('digests.json'));
const latest = manifest.digests.reduce((a, b) => a.date >= b.date ? a : b);

// Check the reusable source and the presentation selected by the front page.
// Historical editions retain their original wording; no story-age cutoff applies.
for (const path of ['templates/digest-template.html', latest.path]) {
  test(`${path}: honest framing and visible story timing`, async () => {
    const html = await read(path);
    const masthead = html.match(/<header\b[^>]*class="masthead"[^>]*>([\s\S]*?)<\/header>/)?.[1];
    assert.ok(masthead, 'Digest must have a masthead');
    assert.ok(masthead.includes(`<span>${framing}</span>`));
    assert.doesNotMatch(masthead, /Coverage:\s*last\s*24\s*hours/i);

    const stories = [...html.matchAll(/<article\b[^>]*class="story"[^>]*>([\s\S]*?)<\/article>/g)];
    assert.ok(stories.length, 'Digest must have story cards');
    for (const [, story] of stories) {
      const visible = story.split(/<details\b/)[0];
      assert.match(visible, /<span class="when">\s*[^<\s][^<]*<\/span>/,
        'Each story must show its date or continuing-story label before collapsed details');
    }
  });
}

test('Producer guides agree on the editorial framing', async () => {
  const agents = await read('AGENTS.md');
  assert.equal(agents, await read('CLAUDE.md'));
  assert.ok(agents.includes(framing));
  assert.ok(agents.includes('label older background explicitly when useful'));
  assert.doesNotMatch(agents, /Research\*\* the last ~24 hours/);
});
