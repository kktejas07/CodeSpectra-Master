/**
 * Open-source sprint (pure): parse pull-request links and decide whether a
 * PR counts — merged, in a registered repo, merged inside the contest window,
 * and opened by one of the entry's GitHub logins.
 */
import { parseRepoUrl } from '@/lib/hackathons/repo-audit'

export interface PrRef { owner: string; repo: string; number: number; key: string }

export function parsePrUrl(url: string): PrRef | { error: string } {
  const raw = String(url ?? '').trim()
  let u: URL
  try { u = new URL(raw) } catch { return { error: 'Paste the full pull request link (https://github.com/owner/repo/pull/123).' } }
  if (u.protocol !== 'https:' || !/^(www\.)?github\.com$/i.test(u.hostname)) return { error: 'Only github.com pull requests count.' }
  const m = u.pathname.match(/^\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/(\d{1,9})\/?$/)
  if (!m) return { error: 'That is not a pull request link (https://github.com/owner/repo/pull/123).' }
  const number = Number(m[3])
  return { owner: m[1], repo: m[2], number, key: `${m[1].toLowerCase()}/${m[2].toLowerCase()}#${number}` }
}

/** owner/repo keys (lower case) for the registered repositories. */
export function registeredRepoKeys(urls: string[]): Set<string> {
  const out = new Set<string>()
  for (const url of urls) {
    const r = parseRepoUrl(url)
    if ('owner' in r) out.add(`${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`)
  }
  return out
}

/** The fields we read from GitHub's GET /repos/{o}/{r}/pulls/{n}. */
export interface GithubPull {
  merged?: boolean
  merged_at?: string | null
  user?: { login?: string } | null
  base?: { repo?: { full_name?: string } | null } | null
  title?: string
}

export function prEligibility(
  pr: GithubPull,
  ref: PrRef,
  opts: { repos: Set<string>; logins: string[]; startsAt: string; endsAt: string },
): { ok: true } | { ok: false; reason: string } {
  const repoKey = `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`
  if (!opts.repos.has(repoKey)) return { ok: false, reason: 'That repository is not part of this sprint.' }
  const base = String(pr.base?.repo?.full_name || '').toLowerCase()
  if (base && base !== repoKey) return { ok: false, reason: 'That pull request targets a different repository.' }
  if (!pr.merged || !pr.merged_at) return { ok: false, reason: 'That pull request is not merged yet. Submit it again once it is merged.' }
  const merged = Date.parse(pr.merged_at)
  if (!(merged >= Date.parse(opts.startsAt) && merged <= Date.parse(opts.endsAt))) return { ok: false, reason: 'That pull request was merged outside the sprint dates.' }
  const author = String(pr.user?.login || '').toLowerCase()
  const logins = opts.logins.map((l) => l.toLowerCase()).filter(Boolean)
  if (!author || !logins.includes(author)) return { ok: false, reason: 'That pull request was opened by a GitHub account that is not on your entry. Add your GitHub username first.' }
  return { ok: true }
}

export function isGithubLogin(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(s)
}
