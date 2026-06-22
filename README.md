# AI News Digest

A small static website that surfaces the **latest AI news digest** on the front
page, with a browsable archive of every past digest.

**Live site:** https://joseph-robert-f.github.io/ai-news-digest/
(after GitHub Pages is enabled — see [Setup](#one-time-setup) below)

## How it works

Each digest is a self-contained HTML file stored under
`YEAR/Month/Week range/…html`. A tiny build step scans those files and writes
`digests.json`, a manifest the website reads to decide what the latest digest is
and to render the archive.

| File | Purpose |
| --- | --- |
| `index.html` | Landing page — loads the **newest** digest in a frame. Supports `?date=YYYY-MM-DD` to deep-link a specific day. |
| `archive.html` | Browse every digest, grouped by month, newest first. |
| `digests.json` | Generated manifest (date, title, path, summary for each digest). |
| `scripts/build-manifest.mjs` | Regenerates `digests.json` from the digest HTML files. |
| `templates/digest-template.html` | Starting point for a new digest. |
| `.github/workflows/build.yml` | On every push to `main`: regenerate the manifest and deploy to GitHub Pages. |

The date for each digest is read from its `<title>` (`AI News Digest — D Month
YYYY`), **not** from the file name — so naming never breaks the site.

## Adding a new digest (no PR needed)

1. Copy `templates/digest-template.html` to the right folder, e.g.
   `2026/June/15 June - 21 June/16 June AI News Digest Report.html`.
   (Filenames may contain spaces; an ISO prefix like
   `2026-06-16 …` is welcome but not required.)
2. Fill in the content. **Make sure the `<title>` has the correct
   `D Month YYYY` date** — that is what the site sorts on.
3. Commit straight to `main` and push.

That's it. The GitHub Action regenerates `digests.json` and redeploys, so the
new digest becomes the front-page "latest" automatically.

## One-time setup

1. **Enable GitHub Pages:** repo **Settings → Pages → Build and deployment →
   Source: GitHub Actions**.
2. Push to `main` (or run the workflow manually from the **Actions** tab). The
   site deploys to https://joseph-robert-f.github.io/ai-news-digest/.

`main` has no branch protection, so direct commits work today — no PR workflow
required.

## Regenerating the manifest locally (optional)

```bash
node scripts/build-manifest.mjs
```

The committed `digests.json` is also rebuilt in CI on every deploy, so editing
it by hand is never necessary.
