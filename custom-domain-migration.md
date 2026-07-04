# Custom Domain Migration — `ai-news-digest` → `cup-of-joe.net`

**Repo:** `joseph-robert-f/ai-news-digest`
**Change:** Point the GitHub Pages site at the custom apex domain **`cup-of-joe.net`** (DNS managed in Cloudflare), replacing the default `https://joseph-robert-f.github.io/ai-news-digest/` URL.

**Bottom line for review:** No functional code changes are required. The site is built entirely on relative paths, so it serves unchanged from the domain root. Only three optional, cosmetic URL references remain in the repo. Everything else is infrastructure config (Cloudflare DNS + GitHub Pages settings) done outside the codebase.

---

## 1. What was done (infrastructure — outside the repo)

### 1.1 Cloudflare DNS records for `cup-of-joe.net`

Created five records (domain previously had none):

| Type  | Name  | Content / Target             | Proxy status | TTL  |
|-------|-------|------------------------------|--------------|------|
| A     | `@`   | `185.199.108.153`            | **DNS only** | Auto |
| A     | `@`   | `185.199.109.153`            | **DNS only** | Auto |
| A     | `@`   | `185.199.110.153`            | **DNS only** | Auto |
| A     | `@`   | `185.199.111.153`            | **DNS only** | Auto |
| CNAME | `www` | `joseph-robert-f.github.io`  | **DNS only** | Auto |

- The four A records point the apex domain at GitHub Pages' server IPs; the `www` CNAME makes `www.cup-of-joe.net` resolve.
- **Critical gotcha:** every record is set to **DNS only** (grey cloud), *not* Proxied (orange cloud). Cloudflare's proxy hides the real DNS records from GitHub, which blocks Let's Encrypt certificate issuance. Keeping proxy off is also the reliable long-term choice — proxied setups are known to break GitHub's automatic cert **renewals** months later.
- CNAME target is the bare `joseph-robert-f.github.io` domain — not the `/ai-news-digest/` path (CNAMEs point to hosts, never paths).

### 1.2 GitHub Pages setting

- **Settings → Pages → Custom domain** = `cup-of-joe.net` → Save.
- Deploy source is **GitHub Actions**, so **no `CNAME` file is written to the repo, and none is required.** The custom domain lives in the Pages *setting*, independent of the deployed artifact. (Confirmed: no `CNAME` file exists in the repo, which is correct.)
- Once DNS propagates and the TLS cert provisions, enable **Enforce HTTPS**.

### 1.3 Redirect behavior

- After the custom domain is active, `https://joseph-robert-f.github.io/ai-news-digest/` **301-redirects** to `https://cup-of-joe.net/`, so existing links/bookmarks keep working.
- With both apex and `www` records set, GitHub auto-redirects `www.cup-of-joe.net` → `cup-of-joe.net`.

---

## 2. Codebase audit — why no functional changes are needed

The site now serves from the **domain root** (`cup-of-joe.net/`) rather than a subpath (`/ai-news-digest/`). The two things that normally break on that move are (a) a build-time base-path config, and (b) absolute `/…` links or asset references. **Neither exists in this repo.**

Checked and clear:

- **`index.html` / `archive.html`** — all internal links are relative: `./`, `./archive.html`, `fetch('./digests.json')`.
- **`digests.json`** — `path` values are relative (e.g. `2026/July/29 June - 5 July/4 July AI News Digest Report.html`). Both pages resolve them against the current page — the homepage `<iframe src>` and the archive anchor `href`s — so they map to `cup-of-joe.net/2026/...` automatically.
- **No absolute paths** — no `href="/…"` / `src="/…"` (double- or single-quoted), no CSS `url(/…)`.
- **No hardcoded host/canonical** — no `<base>` tag, no `rel="canonical"`, no `og:url` / `twitter:` meta, and no `joseph-robert-f.github.io/ai-news-digest` anywhere in page content or the report files under `2026/`.
- **No external `<link>` stylesheets** with absolute paths; styles are inline.
- **Static site** — `.nojekyll` present, raw HTML, no bundler → there is no base-path config (Vite `base`, `homepage`, Jekyll `baseurl`, etc.) to update.

**Result:** the site renders identically at the root. No edits are required to ship the migration.

---

## 3. Suggested changes (optional, cosmetic — safe to skip)

These are stale references to the old URL. Nothing breaks if left as-is (they redirect), but updating keeps deploy metadata and docs accurate. Reasonable as a single commit, e.g. `docs: update live URL to custom domain`.

### 3.1 `.github/workflows/build.yml` (line 49)

Sets only the "View deployment" link shown in the Actions / Environments panel — no effect on the build or where the site serves.

```diff
     environment:
       name: github-pages
-      url: https://joseph-robert-f.github.io/ai-news-digest/
+      url: https://cup-of-joe.net/
```

### 3.2 `README.md` (2 references)

- **Line 6:** `**Live site:** https://joseph-robert-f.github.io/ai-news-digest/`
- **Line 60:** deploy note referencing the same URL.

Replace both occurrences of `https://joseph-robert-f.github.io/ai-news-digest/` → `https://cup-of-joe.net/`.

### 3.3 `CLAUDE.md` (1 reference)

- **Line 7:** `Live site: https://joseph-robert-f.github.io/ai-news-digest/`

Replace → `https://cup-of-joe.net/`.

---

## 4. Verification checklist (after DNS propagation — up to a few hours)

- [ ] `dig cup-of-joe.net +noall +answer -t A` returns the four GitHub IPs (`185.199.108–111.153`).
- [ ] `dig www.cup-of-joe.net +noall +answer` resolves via CNAME to `joseph-robert-f.github.io`.
- [ ] `https://cup-of-joe.net/` loads the latest digest; `https://www.cup-of-joe.net/` redirects to it.
- [ ] Old `https://joseph-robert-f.github.io/ai-news-digest/` redirects to the custom domain.
- [ ] Settings → Pages shows the certificate issued and **Enforce HTTPS** is enabled.
- [ ] Archive page loads and a couple of report links open correctly under the new domain (confirms relative paths resolve at root).

---

*Scope note: the DNS records and Pages setting are configured in Cloudflare and GitHub respectively — not in this repo. The only repo-side items are the three optional documentation/metadata edits in section 3.*
