#!/usr/bin/env node
// Scans <year>/<month>/<week>/ folders for digest HTML files and writes
// digests.json at the repo root.
//
// The date for each digest is read from the file's <title> (e.g.
// "AI News Digest — 15 June 2026"), NOT from the folder/file name. This means
// the manifest keeps working regardless of how the folders/files are named, so
// you can add a new digest just by dropping an HTML file in and committing.
//
// Zero dependencies — runs on the Node already present on GitHub's runners.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Recursively collect .html files under a top-level year folder.
async function findHtml(dir, rel) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...await findHtml(abs, r));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) out.push(r);
  }
  return out;
}

function decodeEntities(s) {
  return s
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

// "15 June 2026" -> "2026-06-15"
function parseDate(text) {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
}

async function main() {
  const top = await readdir(ROOT, { withFileTypes: true });
  const files = [];
  for (const e of top) {
    if (e.isDirectory() && /^\d{4}$/.test(e.name)) {
      files.push(...await findHtml(join(ROOT, e.name), e.name));
    }
  }

  const digests = [];
  for (const path of files) {
    const html = await readFile(join(ROOT, path), 'utf8');
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;
    const date = parseDate(rawTitle || path);
    if (!date) {
      console.warn(`Skipping (no parseable date): ${path}`);
      continue;
    }

    const ledeMatch = html.match(/<div class="lede">([\s\S]*?)<\/div>/i);
    let summary = ledeMatch ? stripTags(ledeMatch[1]).replace(/^Top-line:\s*/i, '') : '';
    if (summary.length > 280) summary = summary.slice(0, 277).trimEnd() + '…';

    const segs = path.split('/');
    digests.push({
      date,
      title: rawTitle || `AI News Digest — ${date}`,
      path,
      year: /^\d{4}$/.test(segs[0]) ? +segs[0] : null,
      month: segs[1] || null,
      week: segs[2] || null,
      summary,
    });
  }

  // Newest first.
  digests.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const output = { generated: new Date().toISOString(), count: digests.length, digests };
  await writeFile(join(ROOT, 'digests.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote digests.json with ${digests.length} digest(s).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
