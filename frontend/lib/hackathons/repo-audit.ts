/**
 * Phase J1 — Automated evidence pack for hackathon judging.
 *
 * Facts about each submitted GitHub repo, NO LLM judgments (that's J2+).
 * All free: public GitHub REST API (no token needed, 60 req/hr
 * unauthenticated) + existing secret-scanner + dependency-scanner libs.
 *
 * Server-only: uses Buffer + unbounded fetch. Never import from client code.
 *
 * ponytail: reuses scanSecrets/scanDependencies as-is; no new deps; every
 * step is independently try/caught so one failure never kills the pack.
 */

import { scanSecrets } from '../secret-scanner'
import { scanDependencies } from '../dependency-scanner'

export interface AuditOpts {
  repoUrl: string
  eventStartISO: string
  eventEndISO: string
  teamSize: number
  teamMemberLogins?: string[]
  githubToken?: string
}

export interface EvidenceSecretTop {
  rule: string
  file: string
  line: number
}

export interface EvidenceVulnTop {
  package: string
  version: string
  severity: string
  cve?: string
}

export interface EvidencePack {
  repo: {
    owner: string
    name: string
    url: string
    stars: number
    forks: number
    createdAt: string | null
    pushedAt: string | null
    defaultBranch: string
    sizeKb: number
    license: string | null
    language: string | null
    topics: string[]
    isPrivate: boolean
    isFork: boolean
  } | null
  commits: {
    total: number
    eventCommits: number
    pctDuringEvent: number
    authors: number
    singleCommit: boolean
    firstCommitAt: string | null
  } | null
  files: {
    count: number
    bytesFetched: number
    truncatedFiles: number
    fetchedFiles: string[]
  } | null
  docs: {
    readme: boolean
    readmeBytes: number
    license: boolean
    tests: boolean
    testCount: number
    ci: boolean
    ciFiles: string[]
    docsCount: number
    manifests: string[]
  } | null
  secrets: {
    critical: number
    high: number
    medium: number
    top: EvidenceSecretTop[]
  } | null
  vulns: {
    count: number
    top: EvidenceVulnTop[]
  } | null
  freshness: {
    firstCommitAt: string | null
    pctDuringEvent: number | null
    singleCommit: boolean
    likelyPreexisting: boolean
    reason: string
  }
  effort: {
    totalCommits: number | null
    eventCommits: number | null
    filesTouched: number | null
    contributors: number | null
    teamSize: number
    teamSizeOk: boolean
  }
  repoAccessible: boolean
  privateUnreachable: boolean
  limitations: string[]
  auditedAt: string
}

// ── URL parsing ─────────────────────────────────────────────────────────────

export function parseRepoUrl(url: string): { owner: string; repo: string } | { error: string } {
  const raw = (url || '').trim()
  if (!raw) return { error: 'empty repo URL' }
  let path = ''
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const host = (u.hostname || '').toLowerCase()
    if (host !== 'github.com' && host !== 'www.github.com') {
      return { error: `not a github.com URL (got ${u.hostname || 'unknown host'})` }
    }
    path = u.pathname || ''
  } catch {
    return { error: 'invalid URL' }
  }
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return { error: 'URL must be github.com/owner/repo' }
  const owner = parts[0] || ''
  let repo = parts[1] || ''
  if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4)
  if (!owner || !repo) return { error: 'could not parse owner/repo from URL' }
  return { owner, repo }
}

// ── GitHub fetch helper ─────────────────────────────────────────────────────

async function gh<T>(url: string, token?: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'codespectra-hackathon-audit',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    return { ok: true, status: res.status, data: (await res.json()) as T }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

interface GhRepo {
  stargazers_count?: number
  forks_count?: number
  created_at?: string
  pushed_at?: string
  default_branch?: string
  size?: number
  license?: { key?: string } | null
  language?: string | null
  topics?: string[]
  private?: boolean
  fork?: boolean
}

interface GhCommit {
  sha?: string
  commit?: { author?: { date?: string; name?: string; email?: string } | null } | null
  author?: { login?: string } | null
}

interface GhTree {
  truncated?: boolean
  tree?: Array<{ path?: string; type?: string; size?: number }>
}

interface GhContent {
  type?: string
  content?: string
  size?: number
}

// ── File classification ─────────────────────────────────────────────────────

const MAX_FILES = 12
const MAX_FILE_BYTES = 60 * 1024

const MANIFEST_BASENAMES = new Set([
  'package.json', 'requirements.txt', 'go.mod', 'cargo.toml', 'pom.xml',
  'gemfile', 'build.gradle', 'composer.json',
])

const LOCKFILE_RE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|cargo\.lock|gemfile\.lock)$/i
const SKIP_DIR_RE = /(^|\/)(node_modules|dist|build|vendor|\.git|\.next|__pycache__|\.venv)(\/|$)/i
const BINARY_EXT_RE = /\.(png|jpe?g|gif|ico|webp|bmp|woff2?|ttf|eot|otf|pdf|zip|tar|gz|mp4|mov|webm|exe|dll|so|dylib|class|jar|sqlite3?|db)$/i
const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|cs|c|h|hpp|cpp|cc|vue|svelte|kt|swift|tf|sh|sql|html|css|json|ya?ml|toml|xml|md|txt)$/i
const TEST_RE = /test|spec|__tests__|\.test\./i
const CI_RE = /(^|\/)(\.github\/workflows\/|jenkinsfile|\.gitlab-ci\.yml|\.travis\.yml|azure-pipelines\.yml|\.circleci\/)/i
const DOCS_RE = /\.(md|rst|txt)$/i
const README_RE = /(^|\/)readme(\..*)?$/i

function basename(p: string): string {
  const parts = (p || '').split('/')
  return (parts[parts.length - 1] || '').toLowerCase()
}

function isManifest(path: string): boolean {
  const b = basename(path)
  return MANIFEST_BASENAMES.has(b) || b.endsWith('.csproj')
}

// ── Main audit ──────────────────────────────────────────────────────────────

export async function auditSubmissionRepo(opts: AuditOpts): Promise<EvidencePack> {
  const limitations: string[] = []
  const teamSize = Number.isFinite(opts.teamSize) ? opts.teamSize : 0
  const startMs = Date.parse(opts.eventStartISO || '')
  const endMs = Date.parse(opts.eventEndISO || '')
  const windowValid = Number.isFinite(startMs) && Number.isFinite(endMs)
  if (!windowValid) limitations.push('event window missing or invalid — timeline percentages unavailable')
  const token = (opts.githubToken || '').trim() || undefined

  const pack: EvidencePack = {
    repo: null,
    commits: null,
    files: null,
    docs: null,
    secrets: null,
    vulns: null,
    freshness: {
      firstCommitAt: null,
      pctDuringEvent: null,
      singleCommit: false,
      likelyPreexisting: false,
      reason: 'no commit data',
    },
    effort: {
      totalCommits: null,
      eventCommits: null,
      filesTouched: null,
      contributors: null,
      teamSize,
      teamSizeOk: false,
    },
    repoAccessible: false,
    privateUnreachable: false,
    limitations,
    auditedAt: new Date().toISOString(),
  }

  // 1. Parse URL
  const parsed = parseRepoUrl(opts.repoUrl || '')
  if ('error' in parsed) {
    limitations.push(`repo URL rejected: ${parsed.error}`)
    return pack
  }
  const { owner, repo } = parsed
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

  // 2. Repo metadata
  let defaultBranch = 'main'
  try {
    const meta = await gh<GhRepo>(apiBase, token)
    if (!meta.ok || !meta.data) {
      if (!token && (meta.status === 404 || meta.status === 0)) {
        limitations.push('repo metadata unavailable — repo may be private (no token) or nonexistent')
      } else {
        limitations.push(`repo metadata unavailable (GitHub status ${meta.status})`)
      }
      return pack
    }
    const m = meta.data
    pack.repoAccessible = true
    defaultBranch = (m.default_branch || 'main').trim() || 'main'
    pack.repo = {
      owner,
      name: repo,
      url: `https://github.com/${owner}/${repo}`,
      stars: typeof m.stargazers_count === 'number' ? m.stargazers_count : 0,
      forks: typeof m.forks_count === 'number' ? m.forks_count : 0,
      createdAt: m.created_at || null,
      pushedAt: m.pushed_at || null,
      defaultBranch,
      sizeKb: typeof m.size === 'number' ? m.size : 0,
      license: (m.license && m.license.key) || null,
      language: m.language || null,
      topics: Array.isArray(m.topics) ? m.topics : [],
      isPrivate: m.private === true,
      isFork: m.fork === true,
    }
  } catch {
    limitations.push('repo metadata fetch failed')
    return pack
  }

  if (!pack.repoAccessible) return pack
  if (pack.repo && pack.repo.isPrivate && !token) {
    pack.privateUnreachable = true
    limitations.push('private repo requires a GitHub token — deeper evidence unavailable')
    return pack
  }

  // 3. Commit timeline (max 3 pages × 100)
  let allCommits: GhCommit[] = []
  try {
    for (let page = 1; page <= 3; page++) {
      const r = await gh<GhCommit[]>(`${apiBase}/commits?per_page=100&page=${page}`, token)
      if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) {
        if (!r.ok && page === 1) {
          if (pack.repo && pack.repo.isPrivate && !token) {
            pack.privateUnreachable = true
            limitations.push('private repo requires a GitHub token — commit history unavailable')
          } else {
            limitations.push(`commit history unavailable (GitHub status ${r.status})`)
          }
        }
        break
      }
      allCommits = allCommits.concat(r.data)
      if (r.data.length < 100) break
    }
  } catch {
    limitations.push('commit history fetch failed')
  }

  if (allCommits.length > 0) {
    try {
      const dates: number[] = []
      const authorSet = new Set<string>()
      let eventCommits = 0
      for (const c of allCommits) {
        const d = Date.parse((c.commit && c.commit.author && c.commit.author.date) || '')
        if (Number.isFinite(d)) {
          dates.push(d)
          if (windowValid && d >= startMs && d <= endMs) eventCommits++
        }
        const login =
          ((c.author && c.author.login) || '') ||
          ((c.commit && c.commit.author && c.commit.author.email) || '') ||
          ((c.commit && c.commit.author && c.commit.author.name) || '')
        if (login) authorSet.add(login.toLowerCase())
      }
      dates.sort((a, b) => a - b)
      const firstAt = dates.length > 0 ? new Date(dates[0]).toISOString() : null
      const total = allCommits.length
      const pct = windowValid && total > 0 ? Math.round((eventCommits / total) * 1000) / 10 : 0
      const single = total === 1
      pack.commits = {
        total,
        eventCommits,
        pctDuringEvent: windowValid ? pct : 0,
        authors: authorSet.size,
        singleCommit: single,
        firstCommitAt: firstAt,
      }
      // 8. Freshness verdict (facts only)
      const preexistingWindow = windowValid && firstAt
        ? startMs - Date.parse(firstAt) > 7 * 24 * 3600 * 1000
        : false
      const lowEventShare = windowValid ? pct < 20 : false
      const likely = Boolean(preexistingWindow && lowEventShare)
      let reason = 'no commit data'
      if (!windowValid) {
        reason = 'event window invalid — cannot judge timeline'
      } else if (single) {
        reason = eventCommits === 1
          ? 'single commit, made during the event'
          : 'single commit, made outside the event'
      } else if (likely) {
        reason = `first commit ${firstAt || 'unknown'} predates event start by >7d and only ${pct}% of commits during event`
      } else {
        reason = `first commit ${firstAt || 'unknown'}, ${pct}% of commits during event`
      }
      pack.freshness = {
        firstCommitAt: firstAt,
        pctDuringEvent: windowValid ? pct : null,
        singleCommit: single,
        likelyPreexisting: likely,
        reason,
      }
      // 9. Effort
      pack.effort.totalCommits = total
      pack.effort.eventCommits = eventCommits
      pack.effort.contributors = authorSet.size
    } catch {
      limitations.push('commit timeline analysis failed')
    }
  } else {
    limitations.push('no commits fetched — timeline, freshness, and effort-contributor facts unavailable')
  }

  // 4. File tree
  interface TreeEntry { path: string; type: string; size: number }
  let treeEntries: TreeEntry[] = []
  let treeTruncated = false
  try {
    const t = await gh<GhTree>(`${apiBase}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`, token)
    if (!t.ok || !t.data || !Array.isArray(t.data.tree)) {
      limitations.push(`file tree unavailable (GitHub status ${t.status})`)
    } else {
      treeTruncated = t.data.truncated === true
      if (treeTruncated) limitations.push('GitHub truncated the file tree — counts are partial')
      for (const e of t.data.tree) {
        if ((e.type || '') !== 'blob' || !e.path) continue
        treeEntries.push({ path: e.path, type: e.type || 'blob', size: typeof e.size === 'number' ? e.size : 0 })
      }
    }
  } catch {
    limitations.push('file tree fetch failed')
  }

  const fileCount = treeEntries.length
  if (fileCount > 0) {
    pack.effort.filesTouched = fileCount
  }

  // Docs facts from the tree (no fetch needed)
  let readmeEntry: TreeEntry | null = null
  let readmeBytes = 0
  const ciFiles: string[] = []
  const manifests: string[] = []
  let testCount = 0
  let docsCount = 0
  let licenseFound = false
  try {
    for (const e of treeEntries) {
      const p = e.path || ''
      const b = basename(p)
      if (!readmeEntry && README_RE.test(p)) { readmeEntry = e; readmeBytes = e.size || 0 }
      if (/^license(\..*)?$/i.test(b) || /^(unlicense|copying)(\..*)?$/i.test(b)) licenseFound = true
      if (TEST_RE.test(p)) testCount++
      if (CI_RE.test(p)) { if (ciFiles.length < 20) ciFiles.push(p) }
      if (isManifest(p) && !LOCKFILE_RE.test(p)) manifests.push(p)
      if (DOCS_RE.test(p) && !README_RE.test(p)) docsCount++
    }
  } catch {
    limitations.push('file classification failed')
  }

  // 5. Code fetch (bounded: ≤12 files, ≤60KB each)
  const fetched: Array<{ path: string; content: string }> = []
  let bytesFetched = 0
  let truncatedFiles = 0
  const fetchedPaths: string[] = []
  if (treeEntries.length > 0) {
    try {
      const candidates: TreeEntry[] = []
      if (readmeEntry) candidates.push(readmeEntry)
      for (const e of treeEntries) {
        if (candidates.length >= MAX_FILES) break
        if (e === readmeEntry) continue
        if (isManifest(e.path) && !LOCKFILE_RE.test(e.path)) candidates.push(e)
      }
      const sources = treeEntries
        .filter((e) => !candidates.includes(e))
        .filter((e) => !SKIP_DIR_RE.test(e.path))
        .filter((e) => !LOCKFILE_RE.test(e.path))
        .filter((e) => !BINARY_EXT_RE.test(e.path))
        .filter((e) => SOURCE_EXT_RE.test(e.path))
        .sort((a, b) => (b.size || 0) - (a.size || 0))
      for (const s of sources) {
        if (candidates.length >= MAX_FILES) break
        candidates.push(s)
      }
      for (const c of candidates.slice(0, MAX_FILES)) {
        if ((c.size || 0) > MAX_FILE_BYTES) { truncatedFiles++; continue }
        if (SKIP_DIR_RE.test(c.path) || BINARY_EXT_RE.test(c.path)) continue
        const url = `${apiBase}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(defaultBranch)}`
        const r = await gh<GhContent>(url, token)
        if (!r.ok || !r.data || r.data.type !== 'file' || !r.data.content) continue
        let text = ''
        try {
          text = Buffer.from(r.data.content.replace(/\n/g, ''), 'base64').toString('utf8')
        } catch { continue }
        if (!text) continue
        const sliced = text.slice(0, MAX_FILE_BYTES)
        fetched.push({ path: c.path, content: sliced })
        fetchedPaths.push(c.path)
        bytesFetched += Buffer.byteLength(sliced, 'utf8')
        if (text.length > MAX_FILE_BYTES) truncatedFiles++
      }
      if (fetched.length === 0) limitations.push('no file contents could be fetched — secrets/vuln facts unavailable')
    } catch {
      limitations.push('code fetch failed — secrets/vuln facts unavailable')
    }
  } else {
    limitations.push('empty or unavailable file tree — code fetch skipped')
  }

  pack.files = {
    count: fileCount,
    bytesFetched,
    truncatedFiles,
    fetchedFiles: fetchedPaths,
  }
  pack.docs = {
    readme: readmeEntry !== null,
    readmeBytes,
    license: licenseFound,
    tests: testCount > 0,
    testCount,
    ci: ciFiles.length > 0,
    ciFiles,
    docsCount,
    manifests,
  }
  // 9b. teamSizeOk (facts only)
  try {
    const contributors = pack.effort.contributors
    pack.effort.teamSizeOk = contributors !== null
      && teamSize >= 2 && teamSize <= 5
      && contributors <= teamSize + 1
  } catch {
    pack.effort.teamSizeOk = false
  }

  // 6. Secrets scan (rule + file + line only — NEVER secret values)
  try {
    if (fetched.length === 0) {
      limitations.push('secrets scan skipped — no file contents')
    } else {
      let critical = 0
      let high = 0
      let medium = 0
      const top: EvidenceSecretTop[] = []
      for (const f of fetched) {
        let findings: Array<{ severity: string; rule: string; line: number }> = []
        try {
          findings = scanSecrets(f.content || '', f.path || '')
        } catch { continue }
        for (const fd of findings) {
          if (fd.severity === 'critical') critical++
          else if (fd.severity === 'high') high++
          else medium++
          if (top.length < 3) top.push({ rule: fd.rule || 'unknown', file: f.path, line: fd.line || 0 })
        }
      }
      pack.secrets = { critical, high, medium, top }
    }
  } catch {
    limitations.push('secrets scan failed')
  }

  // 7. Dependency vulns (manifests only, bounded wait)
  try {
    const manifestFiles = fetched.filter((f) => isManifest(f.path || ''))
    if (manifestFiles.length === 0) {
      limitations.push('dependency scan skipped — no manifests among fetched files')
    } else {
      const DEPS_TIMEOUT_MS = 25000
      const scan = scanDependencies(manifestFiles.map((f) => ({ path: f.path, content: f.content })))
      const result = await Promise.race([
        scan,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), DEPS_TIMEOUT_MS)),
      ])
      if (!result) {
        limitations.push('dependency scan timed out (OSV) — vuln facts unavailable')
      } else {
        const top: EvidenceVulnTop[] = (result.issues || []).slice(0, 5).map((i) => ({
          package: i.package_name || 'unknown',
          version: i.current_version || 'unknown',
          severity: i.severity || 'unknown',
          ...(i.cve_id ? { cve: i.cve_id } : {}),
        }))
        pack.vulns = { count: (result.issues || []).length, top }
      }
    }
  } catch {
    limitations.push('dependency scan failed')
  }

  return pack
}

// ── Similarity (TF-IDF cosine over code tokens, pure function) ──────────────

function tokenizeCode(src: string): string[] {
  let s = src || ''
  // strip block comments + template/string literals (crude)
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  s = s.replace(/`(?:\\.|[^`\\])*`/g, ' ')
  s = s.replace(/'(?:\\.|[^'\\\n])*'/g, ' ')
  s = s.replace(/"(?:\\.|[^"\\\n])*"/g, ' ')
  // strip line comments (crude: // and # to end of line)
  s = s.replace(/(^|\s)(\/\/|#)[^\n]*/g, ' ')
  return s
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((t) => t.length >= 2)
}

function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1)
  const n = tokens.length || 1
  for (const [k, v] of m) m.set(k, v / n)
  return m
}

/**
 * TF-IDF cosine similarity in [0,1]. Smoothed idf (log(1+N/df)) so terms
 * shared by both docs still carry weight — identical docs score ~1.
 */
export function similarityScore(a: string, b: string): number {
  const ta = tokenizeCode(a).slice(0, 2000)
  const tb = tokenizeCode(b).slice(0, 2000)
  if (ta.length === 0 || tb.length === 0) return 0
  const fa = termFreq(ta)
  const fb = termFreq(tb)
  const vocab = new Set<string>([...fa.keys(), ...fb.keys()])
  const N = 2
  let dot = 0
  let na = 0
  let nb = 0
  for (const t of vocab) {
    const df = (fa.has(t) ? 1 : 0) + (fb.has(t) ? 1 : 0)
    const idf = Math.log(1 + N / df)
    const va = (fa.get(t) ?? 0) * idf
    const vb = (fb.get(t) ?? 0) * idf
    dot += va * vb
    na += va * va
    nb += vb * vb
  }
  if (na === 0 || nb === 0) return 0
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb))
  if (!Number.isFinite(cos)) return 0
  return Math.max(0, Math.min(1, cos))
}
