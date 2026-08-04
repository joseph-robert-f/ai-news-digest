const API = 'https://api.github.com';
const token = env('GITHUB_TOKEN');
const user = env('GITHUB_ACTOR_LOGIN');
const digestRepo = env('DIGEST_REPOSITORY');
const zone = process.env.TIME_ZONE || 'America/New_York';
const hours = Number(process.env.LOOKBACK_HOURS || 24);
const now = new Date();

if (!Number.isFinite(hours) || hours < 1 || hours > 168) throw new Error('LOOKBACK_HOURS must be between 1 and 168.');
if (process.env.GITHUB_EVENT_NAME === 'schedule' && localHour(now, zone) !== '09') {
  console.log(`Skipping the duplicate UTC schedule; local time is not 09:xx in ${zone}.`);
  process.exit(0);
}

const since = new Date(now.getTime() - hours * 3_600_000);
const date = localDate(now, zone);
const title = `GitHub activity digest — ${date}`;
const events = await recentPublicEvents(user, since);
const items = [];
for (const event of events) {
  try {
    const item = await summarize(event);
    if (item) items.push(item);
  } catch (error) {
    console.warn(`Skipping details for ${event.type} ${event.id}: ${error.message}`);
  }
}

const body = render(items, since, now);
const issue = await upsertIssue(title, body);
await closeOldDigests(issue.number, title);
await jobSummary(title, body, issue.html_url);
console.log(`${issue.created ? 'Created' : 'Updated'} ${issue.html_url}`);

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function gh(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'daily-public-repo-digest',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`${response.status}: ${data?.message || text || response.statusText}`);
  return data;
}

async function recentPublicEvents(login, cutoff) {
  const found = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await gh(`/users/${encodeURIComponent(login)}/events/public?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || !batch.length) break;
    found.push(...batch.filter((e) => new Date(e.created_at) >= cutoff));
    if (batch.length < 100 || new Date(batch.at(-1).created_at) < cutoff) break;
  }
  return found
    .filter((e) => e.actor?.login?.toLowerCase() === login.toLowerCase())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function summarize(event) {
  const repo = event.repo?.name;
  const p = event.payload || {};
  if (!repo) return null;

  if (event.type === 'PushEvent') {
    const commits = Array.isArray(p.commits) ? p.commits : [];
    const branch = String(p.ref || '').replace(/^refs\/heads\//, '') || 'unknown branch';
    let files = [], additions = 0, deletions = 0, count = p.size || commits.length || 1;
    if (p.before && p.head && !/^0+$/.test(p.before)) {
      try {
        const comparison = await gh(`/repos/${repo}/compare/${p.before}...${p.head}`);
        files = Array.isArray(comparison.files) ? comparison.files : [];
        additions = files.reduce((n, f) => n + Number(f.additions || 0), 0);
        deletions = files.reduce((n, f) => n + Number(f.deletions || 0), 0);
        count = comparison.total_commits || count;
      } catch (error) {
        console.warn(`Comparison unavailable for ${repo}: ${error.message}`);
      }
    }
    const names = files.map((f) => f.filename);
    const messages = commits.map((c) => first(c.message)).join(' ');
    const lines = additions + deletions;
    const code = names.some((n) => /(^|\/)(src|app|lib|server|client|api|db|migrations?|\.github\/workflows)(\/|$)|\.(js|jsx|ts|tsx|mjs|py|go|rs|java|kt|swift|cs|c|cpp|h|rb|php|sql|sh|ya?ml|toml|json|lock)$/i.test(n));
    const impact = /\b(feat|feature|fix|bug|refactor|perf|security|release|deploy|migration|breaking|implement|upgrade|remove|replace|redesign)\b/i.test(messages);
    const docsOnly = names.length && names.every((n) => /(^|\/)(docs?|examples?)(\/|$)|\.(md|mdx|txt|rst)$/i.test(n));
    const score = (count >= 2 ? 2 : 0) + (files.length >= 3 ? 2 : 0) + (lines >= 50 ? 2 : 0) + (code ? 2 : 0) + (impact ? 2 : 0) - (docsOnly && lines < 100 ? 2 : 0);
    const link = p.before && p.head && !/^0+$/.test(p.before)
      ? `https://github.com/${repo}/compare/${p.before}...${p.head}`
      : p.head ? `https://github.com/${repo}/commit/${p.head}` : `https://github.com/${repo}`;
    return {
      repo, type: 'push', significant: score >= 2, score, link,
      summary: `Pushed ${count} commit${s(count)} to \`${branch}\``,
      detail: `${files.length} file${s(files.length)}, +${additions}/−${deletions}`,
      commits: commits.slice(0, 5).map((c) => ({ sha: c.sha, message: first(c.message), url: `https://github.com/${repo}/commit/${c.sha}` })),
      files: names.slice(0, 8), metrics: { commits: count, files: files.length, additions, deletions },
    };
  }

  if (event.type === 'PullRequestEvent') {
    const pr = p.pull_request || {};
    const merged = Boolean(pr.merged || pr.merged_at);
    const trackedActions = ['opened', 'closed', 'reopened', 'ready_for_review', 'converted_to_draft'];
    if (!merged && !trackedActions.includes(p.action)) return null;
    const action = merged && p.action === 'closed' ? 'Merged' : cap(String(p.action || 'updated').replaceAll('_', ' '));
    return {
      repo, type: 'pull request', significant: true, score: merged ? 100 : 80,
      summary: `${action} PR #${pr.number || p.number || '?'} — ${pr.title || 'Untitled pull request'}`,
      detail: pr.changed_files == null ? '' : `${pr.changed_files} file${s(pr.changed_files)}, +${pr.additions || 0}/−${pr.deletions || 0}`,
      link: pr.html_url || `https://github.com/${repo}/pull/${pr.number || p.number || ''}`,
      metrics: { pullRequests: 1, mergedPullRequests: merged ? 1 : 0 },
    };
  }

  if (event.type === 'PullRequestReviewEvent') {
    const review = p.review || {}, pr = p.pull_request || {};
    const state = String(review.state || '').toLowerCase();
    if (!['approved', 'changes_requested'].includes(state)) return null;
    return {
      repo, type: 'review', significant: true, score: state === 'changes_requested' ? 75 : 60,
      summary: `${cap(state.replaceAll('_', ' '))} PR #${pr.number || '?'} — ${pr.title || 'Untitled pull request'}`,
      detail: '', link: review.html_url || pr.html_url || `https://github.com/${repo}`,
      metrics: { reviews: 1 },
    };
  }

  if (event.type === 'IssuesEvent') {
    if (!['opened', 'closed', 'reopened'].includes(p.action)) return null;
    const issue = p.issue || {};
    return {
      repo, type: 'issue', significant: true, score: 55,
      summary: `${cap(p.action)} issue #${issue.number || '?'} — ${issue.title || 'Untitled issue'}`,
      detail: '', link: issue.html_url || `https://github.com/${repo}/issues/${issue.number || ''}`,
      metrics: { issues: 1 },
    };
  }

  if (event.type === 'ReleaseEvent') {
    const release = p.release || {};
    return {
      repo, type: 'release', significant: true, score: 110,
      summary: `${cap(p.action || 'published')} release ${release.name || release.tag_name || ''}`.trim(),
      detail: release.prerelease ? 'Pre-release' : 'Release',
      link: release.html_url || `https://github.com/${repo}/releases`, metrics: { releases: 1 },
    };
  }

  if (event.type === 'CreateEvent' && ['tag', 'repository'].includes(p.ref_type)) {
    return {
      repo, type: 'create', significant: true, score: p.ref_type === 'repository' ? 90 : 70,
      summary: p.ref_type === 'repository' ? 'Created public repository' : `Created tag \`${p.ref || ''}\``,
      detail: p.description || '', link: `https://github.com/${repo}`, metrics: {},
    };
  }
  return null;
}

function render(items, start, end) {
  const significant = items.filter((i) => i.significant).sort((a, b) => b.score - a.score).slice(0, 30);
  const other = items.filter((i) => !i.significant).slice(0, 20);
  const repos = new Set(items.map((i) => i.repo));
  const totals = total(items);
  const out = [
    `@${user}, here is your public GitHub activity digest for the previous ${hours} hours.`, '',
    `**Window:** ${stamp(start)} → ${stamp(end)} (${zone})`, '', '## At a glance',
  ];
  if (!items.length) out.push('- No public repository activity was detected in this window.');
  else {
    out.push(`- **${repos.size}** public repositor${repos.size === 1 ? 'y' : 'ies'} with tracked activity`);
    if (totals.commits) out.push(`- **${totals.commits}** commit${s(totals.commits)} across **${totals.files}** changed file${s(totals.files)} (+${totals.additions}/−${totals.deletions})`);
    if (totals.pullRequests) out.push(`- **${totals.pullRequests}** pull-request event${s(totals.pullRequests)}${totals.mergedPullRequests ? `, including **${totals.mergedPullRequests}** merged` : ''}`);
    if (totals.issues) out.push(`- **${totals.issues}** issue change${s(totals.issues)}`);
    if (totals.releases) out.push(`- **${totals.releases}** release${s(totals.releases)}`);
    if (totals.reviews) out.push(`- **${totals.reviews}** substantive review${s(totals.reviews)}`);
  }
  out.push('', '## Significant changes');
  if (!significant.length) out.push('No changes crossed the significance threshold today. Small documentation, formatting, and single-file maintenance updates are intentionally filtered out.');
  else for (const [repo, group] of grouped(significant)) {
    out.push('', `### [${repo}](https://github.com/${repo})`);
    for (const item of group) renderItem(out, item);
  }
  if (other.length) {
    out.push('', '<details>', `<summary>Other public activity (${items.filter((i) => !i.significant).length})</summary>`, '');
    for (const [repo, group] of grouped(other)) {
      out.push(`**${repo}**`);
      for (const item of group) renderItem(out, item, true);
      out.push('');
    }
    out.push('</details>');
  }
  out.push('', '---', '**Significance filter:** PR lifecycle changes, releases, issue open/close events, tags, substantive reviews, and pushes involving multiple commits, several files, meaningful code/configuration, impactful commit messages, or at least 50 changed lines.', '', '_Generated automatically from GitHub’s public events feed. Private-repository activity is excluded._');
  return out.join('\n');
}

function renderItem(out, item, compact = false) {
  out.push(`- **[${escapeMd(item.summary)}](${item.link})**${item.detail ? ` — ${item.detail}` : ''}`);
  if (compact) return;
  for (const c of item.commits || []) out.push(`  - [\`${c.sha.slice(0, 7)}\`](${c.url}) ${escapeMd(c.message)}`);
  if (item.files?.length) out.push(`  - Key files: ${item.files.map((f) => `\`${f}\``).join(', ')}`);
}

function total(items) {
  const t = { commits: 0, files: 0, additions: 0, deletions: 0, pullRequests: 0, mergedPullRequests: 0, issues: 0, releases: 0, reviews: 0 };
  for (const item of items) for (const key of Object.keys(t)) t[key] += Number(item.metrics?.[key] || 0);
  return t;
}

function grouped(items) {
  const map = new Map();
  for (const item of items) (map.get(item.repo) || (map.set(item.repo, []), map.get(item.repo))).push(item);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

async function upsertIssue(issueTitle, issueBody) {
  const issues = await gh(`/repos/${digestRepo}/issues?state=all&per_page=100&sort=created&direction=desc`);
  const existing = issues.find((i) => !i.pull_request && i.title === issueTitle);
  if (existing) {
    const updated = await gh(`/repos/${digestRepo}/issues/${existing.number}`, { method: 'PATCH', body: { body: issueBody, state: 'open' } });
    return { ...updated, created: false };
  }
  const created = await gh(`/repos/${digestRepo}/issues`, { method: 'POST', body: { title: issueTitle, body: issueBody } });
  return { ...created, created: true };
}

async function closeOldDigests(current, currentTitle) {
  const open = await gh(`/repos/${digestRepo}/issues?state=open&per_page=100&sort=created&direction=desc`);
  for (const issue of open.filter((i) => !i.pull_request && i.number !== current && i.title.startsWith('GitHub activity digest — ') && i.title !== currentTitle)) {
    await gh(`/repos/${digestRepo}/issues/${issue.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } });
  }
}

async function jobSummary(issueTitle, issueBody, url) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const { appendFile } = await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `# ${issueTitle}\n\n${issueBody}\n\n[Open digest issue](${url})\n`);
}

function localDate(d, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function localHour(d, timeZone) { return new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).find((p) => p.type === 'hour')?.value; }
function stamp(d) { return new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d); }
function first(v) { return String(v || '').split(/\r?\n/, 1)[0].trim(); }
function cap(v) { return v ? v[0].toUpperCase() + v.slice(1) : v; }
function s(n) { return Number(n) === 1 ? '' : 's'; }
function escapeMd(v) { return String(v).replace(/([\\`*_[\]<>])/g, '\\$1'); }
