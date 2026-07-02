# AI News Digest — repository guide

This repo is a small static website (GitHub Pages) that publishes a daily
**AI executive brief**. The front page always shows the latest digest; every
push to `main` auto-rebuilds `digests.json` and redeploys the site.

Live site: https://joseph-robert-f.github.io/ai-news-digest/

## Publishing rule (read this first)

**Commit new digests directly to `main`. Do NOT open a pull request.**

Push straight to `main`. The GitHub Action (`.github/workflows/build.yml`)
regenerates the manifest and deploys — no PR, no manual steps. Aim to have each
day's digest committed **by 06:30 US Eastern (ET)** so the site is fresh each
morning.

## How to produce the daily digest

1. **Research** the last ~24 hours of AI news (models, agents, funding/markets,
   policy, developer platforms, notable research). Prefer primary sources.
2. **Start from** `templates/digest-template.html`. Keep it fully self-contained
   (inline `<style>`, no external assets).
3. **Write for a ≤5-minute executive skim.** Structure, in order:
   - `<title>AI News Digest — D Month YYYY</title>` — the site reads the date
     from here, so the `D Month YYYY` format is required.
   - `<meta name="description" content="…">` — one crisp sentence; it becomes
     the archive preview.
   - **At a glance** — up to **five** one-line numbered bullets (the whole day
     in ~30 seconds). Keep the `data-summary` attribute on the `<ol>`.
   - **Story cards** — aim for **6–10**. Each: a `tag`, a sharp headline, and a
     single **"Why it matters:"** lead line (the decision/implication, not the
     play-by-play). Put deeper context and **all source links** inside the
     collapsible `<details>` block.
   - Keep the reading-time `<script>` at the bottom; it auto-computes the badge.
4. **Save** to `YEAR/Month/<Week range>/D Month AI News Digest Report.html`,
   e.g. `2026/July/6 July - 12 July/6 July AI News Digest Report.html`. Create
   the week-range folder if it doesn't exist. Preserve any relative cross-links
   to prior digests.
5. **Commit to `main` and push.** Optionally run `node scripts/build-manifest.mjs`
   first (the Action also does this on deploy).

## Quality bar

- Every claim carries a source link (inside `Detail & sources`).
- Lead with "so what," not chronology. One takeaway line per story.
- Five glance bullets max; if the day is quiet, fewer is better.
- Keep the whole thing under a five-minute read (the badge should show ≤5 min).

## Repo map

- `index.html` — front page; frames the latest digest (`?date=YYYY-MM-DD` deep links).
- `archive.html` — browse all digests, grouped by month.
- `digests.json` — generated manifest (date/title/path/summary).
- `scripts/build-manifest.mjs` — regenerates the manifest from digest `<title>`s.
- `templates/digest-template.html` — the executive-brief template for new digests.
- `.github/workflows/build.yml` — rebuild manifest + deploy Pages on push to `main`.
